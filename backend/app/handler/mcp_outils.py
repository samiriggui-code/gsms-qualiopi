"""Outils du serveur MCP : lectures du moteur Qualiopi pour l'assistant IA.

Chaque outil appelle la fonction de la route HTTP correspondante (mêmes services, mêmes politiques, même
forme de réponse) : aucune règle métier n'est recodée ici. On n'ajoute que :
- la permission exigée, identique à celle de la route (vérifiée avant l'appel, refus lisible sinon) ; quand la route
  accepte plusieurs permissions (l'une ou l'autre), l'outil porte le même tuple ;
- la traduction des arguments (une session ou une preuve se désigne aussi par sa référence, une formation par son
  code ou son slug de catalogue) ;
- une limite sur les listes, pour ne pas noyer l'assistant ;
- sur réglage (`IA_MASQUER_COORDONNEES`), le retrait des coordonnées (e-mail, téléphone, adresse postale) et de
  l'identité détaillée (naissance, nationalité) des réponses (`sans_contact`) ; par défaut rien n'est retiré, puisque
  chaque outil répond avec les droits de la personne pour qui l'assistant travaille (`mcp.py`).

Tous les outils sont en lecture seule : aucun n'écrit en base.
"""

from __future__ import annotations

import inspect
import re
import typing
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.service.edof import service as edof_service
from app.config.config import get_settings
from app.errors.errors import InvalidStateError, NotFoundError
from app.handler import documents as documents_routes
from app.handler import editions as editions_routes
from app.handler import edof as edof_routes
from app.handler import funding as funding_routes
from app.handler import hr as hr_routes
from app.handler import invoicing as invoicing_routes
from app.handler import journal as journal_routes
from app.handler import journey as journey_routes
from app.handler import pilotage as pilotage_routes
from app.handler import preinscriptions as preinscriptions_routes
from app.handler import qualiopi as routes
from app.handler import qualiopi_ecrans as screens
from app.handler import training as training_routes
from app.handler import training_offre as offre_routes
from app.handler.training_resources import QUALITY_READ
from app.handler.training_resources import ROUTERS as CRUD_ROUTERS
from app.middleware.auth import permissions_of
from app.types import training as t
from app.types.auth import User
from app.types.preinscriptions import STATUSES as PREINSCRIPTION_STATUSES
from app.types.preinscriptions import Preinscription
from app.types.qualiopi_audit import Audit
from app.types.qualiopi_capa import CAPA_STATUSES
from app.types.qualiopi_evidence import EVIDENCE_STATUSES, Evidence

DEFAULT_LIMIT = 50
MAX_LIMIT = 200
FINDING_STATUSES = tuple(screens.FINDING_STATUS_LABELS)
OPEN_FINDINGS = ["OUVERT", "EN_TRAITEMENT"]


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    properties: dict
    permission: str | tuple[str, ...]  # une permission, ou plusieurs dont l'une suffit (comme `require_any`)
    run: Callable[[Session, User, dict], object]
    required: tuple[str, ...] = ()

    @property
    def permissions(self) -> tuple[str, ...]:
        return (self.permission,) if isinstance(self.permission, str) else self.permission

    def descriptor(self) -> dict:
        schema: dict = {"type": "object", "properties": self.properties, "additionalProperties": False}
        if self.required:
            schema["required"] = list(self.required)
        return {"name": self.name, "description": self.description, "inputSchema": schema,
                "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True,
                                "openWorldHint": False}}


# ── Lecture des arguments ────────────────────────────────────────────────────────


def _int(args: dict, key: str, default: int | None = None, lo: int | None = None, hi: int | None = None) -> int | None:
    value = args.get(key, default)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise InvalidStateError(f"« {key} » doit être un nombre entier")
    try:
        number = int(value)
    except ValueError:
        raise InvalidStateError(f"« {key} » doit être un nombre entier") from None
    if (lo is not None and number < lo) or (hi is not None and number > hi):
        raise InvalidStateError(f"« {key} » doit être compris entre {lo} et {hi}")
    return number


def _str(args: dict, key: str) -> str | None:
    value = args.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if not isinstance(value, str):
        raise InvalidStateError(f"« {key} » doit être un texte")
    return value.strip()


def _date(args: dict, key: str) -> date | None:
    value = _str(args, key)
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise InvalidStateError(f"« {key} » doit être une date AAAA-MM-JJ") from None


def _statuses(args: dict, key: str, allowed: tuple[str, ...]) -> list[str] | None:
    value = args.get(key)
    if value is None or value == []:
        return None
    values = [value] if isinstance(value, str) else value
    if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
        raise InvalidStateError(f"« {key} » doit être une liste de statuts")
    unknown = sorted(set(values) - set(allowed))
    if unknown:
        raise InvalidStateError(f"Statut inconnu : {', '.join(unknown)} (attendus : {', '.join(allowed)})")
    return values


def _limit(args: dict) -> int:
    return _int(args, "limite", DEFAULT_LIMIT, 1, MAX_LIMIT) or DEFAULT_LIMIT


def _capped(rows: list, limit: int, key: str, **extra: object) -> dict:
    return {"total": len(rows), "affiches": min(len(rows), limit), **extra, key: rows[:limit]}


def _session_id(db: Session, value: str) -> str:
    """Une session se désigne par son identifiant ou par sa référence (ex. S-2026-001)."""
    if db.get(t.TrainingSession, value) is not None:
        return value
    found = db.scalar(select(t.TrainingSession.id).where(t.TrainingSession.reference == value))
    if found is None:
        raise NotFoundError(f"Session introuvable : {value}")
    return found


def _evidence_id(db: Session, value: str) -> str:
    if db.get(Evidence, value) is not None:
        return value
    found = db.scalar(select(Evidence.id).where(Evidence.reference == value))
    if found is None:
        raise NotFoundError(f"Preuve introuvable : {value}")
    return found


def _program_id(db: Session, value: str) -> str:
    """Une formation se désigne par son identifiant, son code ou son slug de catalogue."""
    if db.get(t.Program, value) is not None:
        return value
    found = db.scalar(select(t.Program.id).where((t.Program.code == value) | (t.Program.catalog_slug == value)))
    if found is None:
        raise NotFoundError(f"Formation introuvable : {value}")
    return found


_ROWS = TypeAdapter(list[dict])


def _crud_list(path: str) -> Callable[[Session, User], list[dict]]:
    """La fonction de la route de liste `GET /api/v1/<path>` déclarée par `crud_router` (sans filtre)."""
    for router in CRUD_ROUTERS:
        for route in router.routes:
            if getattr(route, "path", None) == f"/api/v1/{path}" and "GET" in getattr(route, "methods", ()):
                endpoint = route.endpoint
                filters = typing.get_args(inspect.signature(endpoint).parameters["params"].annotation)[0]
                # Même encodage JSON que la réponse HTTP (modèle de réponse `list[dict]` de la route).
                return lambda db, user: _ROWS.dump_python(endpoint(db=db, params=filters(), _=user), mode="json")
    raise LookupError(f"route GET /api/v1/{path} introuvable")


# ── Outils ───────────────────────────────────────────────────────────────────────


def _readiness(db: Session, user: User, args: dict) -> object:
    return routes.readiness(db, user, du=_date(args, "du"), au=_date(args, "au"))


def _indicator(db: Session, user: User, args: dict) -> object:
    number = _int(args, "numero", lo=1, hi=99)
    if number is None:
        raise InvalidStateError("Indiquez le numéro de l'indicateur (« numero »)")
    return routes.indicator(number, db, user)


def _evidence_list(db: Session, user: User, args: dict) -> object:
    session = _str(args, "session")
    out = screens.list_evidence(db, user, statut=_statuses(args, "statut", EVIDENCE_STATUSES + ("RETIREE",)),
                                type=_str(args, "type"), indicateur=_int(args, "indicateur", lo=1, hi=99),
                                session_id=_session_id(db, session) if session else None,
                                recherche=_str(args, "recherche"))
    limit = _limit(args)
    out["preuves"] = out["preuves"][:limit]
    out["affichees"] = len(out["preuves"])
    return out


def _evidence(db: Session, user: User, args: dict) -> object:
    value = _str(args, "preuve")
    if value is None:
        raise InvalidStateError("Indiquez la preuve (« preuve » : identifiant ou référence)")
    return screens.get_evidence(_evidence_id(db, value), db, user)


def _findings(db: Session, user: User, args: dict) -> object:
    statuses = _statuses(args, "statut", FINDING_STATUSES) or OPEN_FINDINGS
    rows = screens.findings(db, user, statut=statuses, indicateur=_int(args, "indicateur", lo=1, hi=99))
    return _capped(rows, _limit(args), "ecarts", statuts=statuses)


def _deadlines(db: Session, user: User, args: dict) -> object:
    rows = routes.upcoming(db, user, days=_int(args, "jours", 15, 0, 365), owner=_str(args, "responsable"))
    return _capped(rows, _limit(args), "echeances")


def _actions(db: Session, user: User, args: dict) -> object:
    status = _str(args, "statut")
    if status is not None and status not in CAPA_STATUSES:
        raise InvalidStateError(f"Statut inconnu : {status} (attendus : {', '.join(CAPA_STATUSES)})")
    late = args.get("en_retard", False)
    if not isinstance(late, bool):
        raise InvalidStateError("« en_retard » doit valoir true ou false")
    rows = routes.list_actions(db, user, statut=status, en_retard=late)
    return _capped(rows, _limit(args), "actions")


def _session_summary(db: Session, user: User, args: dict) -> object:
    value = _str(args, "session")
    if value is None:
        raise InvalidStateError("Indiquez la session (« session » : identifiant ou référence)")
    return routes.get_session_dossier(_session_id(db, value), db, user)


def _program(db: Session, user: User, args: dict) -> object:
    value = _str(args, "formation")
    if value is None:
        raise InvalidStateError("Indiquez la formation (« formation » : identifiant, code ou slug)")
    return screens.formation_view(_program_id(db, value), db, user)


def _sessions(db: Session, user: User, args: dict) -> object:
    status = _str(args, "statut")
    if status is not None and status not in t.SESSION_STATUSES:
        raise InvalidStateError(f"Statut inconnu : {status} (attendus : {', '.join(t.SESSION_STATUSES)})")
    du, au = _date(args, "du"), _date(args, "au")
    rows = training_routes.list_sessions(db, user, statut=status, du=du, au=au)
    views = [training_routes.SessionView.model_validate(s).model_dump(mode="json") for s in rows]
    return _capped(views, _limit(args), "sessions")


def _planning(db: Session, user: User, args: dict) -> object:
    annulees = args.get("annulees", False)
    if not isinstance(annulees, bool):
        raise InvalidStateError("« annulees » doit valoir true ou false")
    return pilotage_routes.get_planning(db, user, du=_date(args, "du"), au=_date(args, "au"),
                                        formateur=_str(args, "formateur"), lieu=_str(args, "lieu"),
                                        programme=_str(args, "programme"), annulees=annulees)


def _audits(db: Session, user: User, args: dict) -> object:
    out = screens.list_audits(db, user)
    return {**out, **_capped(out["audits"], _limit(args), "audits")}


_watch_items = _crud_list("watch-items")
_complaints = _crud_list("complaints")


def _watch(db: Session, user: User, args: dict) -> object:
    return _capped(_watch_items(db, user), _limit(args), "veille")


def _complaint_list(db: Session, user: User, args: dict) -> object:
    return _capped(_complaints(db, user), _limit(args), "reclamations")



# ── Données personnelles ─────────────────────────────────────────────────────────

# Clés retirées des réponses, telles quelles ou en suffixe (`stagiaire_email`, `contact_email`, `client_address`…) :
# coordonnées (e-mail, téléphone, adresse postale), identité détaillée (naissance, nationalité, que les listes de
# l'application ne montrent déjà pas, LEARNER_PERSONAL_FIELDS) et identifiants bancaires ou sociaux.
CONTACT_KEYS = frozenset({
    "email", "e_mail", "telephone", "phone", "mobile", "portable", "fax",
    "adresse", "address", "postal_code", "code_postal", "ville", "city",
    "iban", "bic", "nir", "numero_securite_sociale",
    "birth_date", "birth_city", "birth_department", "birth_country", "nationality", "naissance", "nationalite",
})
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
EMAIL_MASK = "[e-mail masqué]"


# Adresse d'un site (lieu de formation, salle) : ce n'est pas une donnée personnelle, elle reste visible.
SITE_ADDRESS_KEYS = frozenset({"adresse", "address", "postal_code", "code_postal", "ville", "city"})


def _is_contact(key: str, keep: frozenset[str] = frozenset()) -> bool:
    key = key.lower()
    if key in keep:
        return False
    return key in CONTACT_KEYS or any(key.endswith(f"_{k}") for k in CONTACT_KEYS)


def sans_contact(value: object, keep: frozenset[str] = frozenset()) -> object:
    """Retire récursivement les champs de contact (sauf les clés de `keep`) ; une adresse e-mail glissée dans un texte
    (auteur d'une modification « Nom <e-mail> »…) est masquée."""
    if isinstance(value, dict):
        return {k: sans_contact(v, keep) for k, v in value.items() if not (isinstance(k, str) and _is_contact(k, keep))}
    if isinstance(value, list):
        return [sans_contact(v, keep) for v in value]
    if isinstance(value, str):
        return _EMAIL.sub(EMAIL_MASK, value)
    return value


_ANY = TypeAdapter(Any)


def _out(value: object, keep: frozenset[str] = frozenset()) -> object:
    """Même encodage JSON que la réponse HTTP de la route (dates ISO, décimaux…) ; sans les contacts si le réglage
    `IA_MASQUER_COORDONNEES` le demande (sinon la personne voit ce qu'elle voit déjà dans GSMS)."""
    value = _ANY.dump_python(value, mode="json")
    return sans_contact(value, keep) if get_settings().ia_masquer_coordonnees else value


def _crud(path: str) -> tuple[Callable[..., list[dict]], Callable[[Session, User, str], dict]]:
    """Les fonctions des routes `GET /api/v1/<path>` (liste, filtres déclarés compris) et `GET /api/v1/<path>/{id}`."""
    found: dict[str, Callable] = {}
    for router in CRUD_ROUTERS:
        for route in router.routes:
            if "GET" in getattr(route, "methods", ()) and getattr(route, "path", None) in (f"/api/v1/{path}",
                                                                                           f"/api/v1/{path}/{{item_id}}"):
                found["one" if route.path.endswith("{item_id}") else "list"] = route.endpoint
    if len(found) != 2:
        raise LookupError(f"routes GET /api/v1/{path} introuvables")
    endpoint, one = found["list"], found["one"]
    filters = typing.get_args(inspect.signature(endpoint).parameters["params"].annotation)[0]
    return (lambda db, user, **f: endpoint(db=db, params=filters(**f), _=user),
            lambda db, user, item_id: one(item_id=item_id, db=db, _=user))


def _required(args: dict, key: str, what: str) -> str:
    value = _str(args, key)
    if value is None:
        raise InvalidStateError(f"Indiquez {what} (« {key} »)")
    return value


def _bool(args: dict, key: str, default: bool = False) -> bool:
    value = args.get(key, default)
    if not isinstance(value, bool):
        raise InvalidStateError(f"« {key} » doit valoir true ou false")
    return value


def _person_id(db: Session, model: type, value: str, label: str) -> str:
    """Un stagiaire ou un formateur se désigne par son identifiant ou par « Prénom Nom » (sans ambiguïté)."""
    if db.get(model, value) is not None:
        return value
    wanted = " ".join(value.lower().split())
    ids = list(db.scalars(select(model.id).where(
        (func.lower(model.first_name + " " + model.last_name) == wanted)
        | (func.lower(model.last_name + " " + model.first_name) == wanted))))
    if not ids:
        raise NotFoundError(f"{label} introuvable : {value}")
    if len(ids) > 1:
        raise InvalidStateError(f"Plusieurs {label.lower()}s portent ce nom : indiquez l'identifiant")
    return ids[0]


def _by_reference(db: Session, model: type, value: str, label: str) -> str:
    if db.get(model, value) is not None:
        return value
    found = db.scalar(select(model.id).where(model.reference == value))
    if found is None:
        raise NotFoundError(f"{label} introuvable : {value}")
    return found


def _session_arg(db: Session, args: dict) -> str:
    return _session_id(db, _required(args, "session", "la session (identifiant ou référence)"))


# ── Outils : lieux, équipements, audits ──────────────────────────────────────────

_premises_list, _ = _crud("premises")
_equipment_list, _ = _crud("equipment")
_trainers_list, _trainer_one = _crud("trainers")
_qualifications_list, _ = _crud("trainer-qualifications")
_learners_list, _ = _crud("learners")
_companies_list, _ = _crud("companies")
_surveys_list, _ = _crud("surveys")


def _premises(db: Session, user: User, args: dict) -> object:
    return _capped(_out(_premises_list(db, user), keep=SITE_ADDRESS_KEYS), _limit(args), "lieux")


def _equipment(db: Session, user: User, args: dict) -> object:
    return _capped(_out(_equipment_list(db, user)), _limit(args), "equipements")


def _audit(db: Session, user: User, args: dict) -> object:
    value = _required(args, "audit", "l'audit (identifiant ou référence)")
    return _out(screens.get_audit(_by_reference(db, Audit, value, "Audit"), db, user))


# ── Outils : EDOF ────────────────────────────────────────────────────────────────


def _edof_overview(db: Session, user: User, args: dict) -> object:
    # Ce que rend `GET /edof/etablissement` (edof_routes.get_establishment), sans son commit : la route crée le profil
    # et le dossier de l'établissement à la première lecture, l'outil ne garde rien (rollback de `_call_tool`).
    return _out(edof_service.establishment_view(db, permissions_of(db, user)))


def _edof_dossier(db: Session, user: User, args: dict) -> object:
    dossier, program = _str(args, "dossier"), _str(args, "formation")
    if dossier is None and program is None:
        raise InvalidStateError("Indiquez le dossier (« dossier ») ou la formation (« formation »)")
    if dossier is None:
        found = edof_service.formation_dossier(db, _program_id(db, program))
        if found is None:
            raise NotFoundError(f"Pas de dossier EDOF pour la formation {program}")
        dossier = found.id
    return _out(edof_routes.get_dossier(dossier, db, user))


# ── Outils : formateurs, personnel ───────────────────────────────────────────────


def _trainers(db: Session, user: User, args: dict) -> object:
    return _capped(_out(_trainers_list(db, user)), _limit(args), "formateurs")


def _trainer(db: Session, user: User, args: dict) -> object:
    value = _required(args, "formateur", "le formateur (identifiant ou « Prénom Nom »)")
    return _out(_trainer_one(db, user, _person_id(db, t.Trainer, value, "Formateur")))


def _qualifications(db: Session, user: User, args: dict) -> object:
    value = _str(args, "formateur")
    trainer = _person_id(db, t.Trainer, value, "Formateur") if value else None
    return _capped(_out(_qualifications_list(db, user, formateur=trainer)), _limit(args), "titres")


def _expiring_titles(db: Session, user: User, args: dict) -> object:
    rows = hr_routes.expiring_titles(db=db, _=user, jours=_int(args, "jours", 90, 0, 3650))
    return _capped(_out(rows), _limit(args), "titres")


def _staff(db: Session, user: User, args: dict) -> object:
    rows = hr_routes.list_staff(db=db, _=user, actifs=_bool(args, "actifs", True), service=_str(args, "service"))
    return _capped(_out(rows), _limit(args), "personnel")


# ── Outils : financement, facturation ────────────────────────────────────────────


def _funding_cases(db: Session, user: User, args: dict) -> object:
    return _capped(_out(funding_routes.list_cases(db=db, user=user)), _limit(args), "dossiers")


def _funding_deadlines(db: Session, user: User, args: dict) -> object:
    rows = funding_routes.funding_deadlines(db=db, _=user, jours=_int(args, "jours", 15, 0, 365))
    return _capped(_out(rows), _limit(args), "echeances")


def _invoices(db: Session, user: User, args: dict) -> object:
    kind = _str(args, "type")
    if kind is not None and kind not in invoicing_routes.KINDS:
        raise InvalidStateError(f"Type inconnu : {kind} (attendus : {', '.join(invoicing_routes.KINDS)})")
    status = _str(args, "statut")
    if status is not None and status not in invoicing_routes.STATUSES:
        raise InvalidStateError(f"Statut inconnu : {status} (attendus : {', '.join(invoicing_routes.STATUSES)})")
    search = _str(args, "recherche")
    if search is not None and len(search) > 100:
        raise InvalidStateError("« recherche » : 100 caractères au plus")
    rows = invoicing_routes.list_invoices(db=db, _=user, type=kind, statut=status,
                                          en_retard=_bool(args, "en_retard"), q=search)
    return _capped(_out(rows), _limit(args), "factures")


def _invoices_overview(db: Session, user: User, args: dict) -> object:
    return _out(invoicing_routes.overview(db=db, _=user))


def _payments(db: Session, user: User, args: dict) -> object:
    rows = invoicing_routes.list_payments(db=db, _=user, du=_date(args, "du"), au=_date(args, "au"),
                                          annules=_bool(args, "annules"))
    return _capped(_out(rows), _limit(args), "encaissements")


# ── Outils : préinscriptions, documents ──────────────────────────────────────────


def _preinscriptions(db: Session, user: User, args: dict) -> object:
    search = _str(args, "recherche")
    if search is not None and len(search) > 100:
        raise InvalidStateError("« recherche » : 100 caractères au plus")
    program = _str(args, "formation")
    out = preinscriptions_routes.list_preinscriptions(
        db=db, _=user, statut=_statuses(args, "statut", tuple(PREINSCRIPTION_STATUSES)), formation=program,
        recherche=search, limite=_limit(args))
    return _out(out)


def _preinscription(db: Session, user: User, args: dict) -> object:
    value = _required(args, "demande", "la demande (identifiant ou référence)")
    return _out(preinscriptions_routes.get_preinscription(_by_reference(db, Preinscription, value, "Demande"), db, user))


def _business_documents(db: Session, user: User, args: dict) -> object:
    kind = _str(args, "type")
    company = _str(args, "entreprise")
    rows = editions_routes.list_projects(db=db, _=user, entreprise=company, type=kind)
    return _capped(_out(rows), _limit(args), "documents")


def _pieces_dossier(db: Session, user: User, args: dict) -> object:
    subject = _required(args, "dossier", "le dossier (ORGANISME ou FORMATEUR)")
    if subject == "ORGANISME":
        subject_id = db.scalar(select(t.Organization.id))
        if subject_id is None:
            raise NotFoundError("Aucun organisme n'est encore enregistré")
    elif subject == "FORMATEUR":
        value = _required(args, "formateur", "le formateur (identifiant ou « Prénom Nom »)")
        subject_id = _person_id(db, t.Trainer, value, "Formateur")
    else:
        raise InvalidStateError("« dossier » : ORGANISME ou FORMATEUR")
    return _out(documents_routes.get_dossier(subject, subject_id, db, user))


# ── Outils : évaluations, satisfaction, résultats ────────────────────────────────


def _assessments(db: Session, user: User, args: dict) -> object:
    session = _str(args, "session")
    program = _str(args, "formation")
    out = journey_routes.assessments(db=db, user=user, session_id=_session_id(db, session) if session else None,
                                     programme=_program_id(db, program) if program else None,
                                     etat=_str(args, "etat"), resultat=_str(args, "resultat"))
    out = _out(out)
    return {**out, **_capped(out["lignes"], _limit(args), "lignes")}


def _surveys(db: Session, user: User, args: dict) -> object:
    return _capped(_out(_surveys_list(db, user)), _limit(args), "enquetes")


def _results(db: Session, user: User, args: dict) -> object:
    return _out(offre_routes.results(db=db, user=user, mois=_int(args, "mois", 12, 1, 60)))


# ── Outils : stagiaires, entreprises, sessions ───────────────────────────────────


def _learners(db: Session, user: User, args: dict) -> object:
    return _capped(_out(_learners_list(db, user, entreprise=_str(args, "entreprise"))), _limit(args), "stagiaires")


def _learner_enrollments(db: Session, user: User, args: dict) -> object:
    value = _required(args, "stagiaire", "le stagiaire (identifiant ou « Prénom Nom »)")
    rows = training_routes.learner_enrollments(_person_id(db, t.Learner, value, "Stagiaire"), db=db, _=user)
    return _capped(_out(rows), _limit(args), "inscriptions")


def _companies(db: Session, user: User, args: dict) -> object:
    return _capped(_out(_companies_list(db, user)), _limit(args), "entreprises")


def _session(db: Session, user: User, args: dict) -> object:
    return _out(training_routes.get_session(_session_arg(db, args), db, user))


def _session_journey(db: Session, user: User, args: dict) -> object:
    return _out(journey_routes.session_journey(_session_arg(db, args), db, user))


def _session_activity(db: Session, user: User, args: dict) -> object:
    rows = training_routes.session_activity(_session_arg(db, args), db, user)
    return _capped(_out(rows), _limit(args), "evenements")


def _journal(db: Session, user: User, args: dict) -> object:
    return _out(journal_routes.recent(db=db, _=user, table=_str(args, "table"), acteur=None,
                                      avant=_int(args, "avant", lo=1), limite=_limit(args)))


_NUMBER = {"type": "integer", "minimum": 1, "maximum": 99}
_LIMIT = {"type": "integer", "minimum": 1, "maximum": MAX_LIMIT, "default": DEFAULT_LIMIT,
          "description": "Nombre maximal de lignes renvoyées"}

TOOLS: tuple[Tool, ...] = (
    Tool("etat_indicateurs",
         "État de préparation calculé par le moteur pour chaque indicateur du référentiel en vigueur, sur une période "
         "(par défaut le cycle de certification en cours). C'est un état de préparation à partir des preuves "
         "disponibles, jamais une décision de conformité : seul l'organisme certificateur en décide.",
         {"du": {"type": "string", "format": "date", "description": "Début de période AAAA-MM-JJ"},
          "au": {"type": "string", "format": "date", "description": "Fin de période AAAA-MM-JJ"}},
         "quality.read", _readiness),
    Tool("fiche_indicateur",
         "Chaîne complète d'un indicateur : exigences officielles, preuves attendues, contrôles du moteur et leurs "
         "résultats, preuves disponibles, écarts, actions correctives, historique.",
         {"numero": {**_NUMBER, "description": "Numéro de l'indicateur (ex. 11)"}},
         "quality.read", _indicator, ("numero",)),
    Tool("lister_preuves",
         "Preuves réunies par l'organisme (les plus récentes d'abord), avec leur statut et les comptes par statut.",
         {"statut": {"type": "array", "items": {"type": "string", "enum": [*EVIDENCE_STATUSES, "RETIREE"]}},
          "type": {"type": "string", "description": "Code du type de preuve"},
          "indicateur": {**_NUMBER, "description": "Preuves rattachées à cet indicateur"},
          "session": {"type": "string", "description": "Identifiant ou référence de session"},
          "recherche": {"type": "string", "description": "Texte cherché dans la référence, le libellé ou la cible"},
          "limite": _LIMIT},
         "quality.read", _evidence_list),
    Tool("fiche_preuve",
         "Une preuve : d'où elle vient, les indicateurs qu'elle sert, sa grille de relecture, les décisions prises "
         "et son historique.",
         {"preuve": {"type": "string", "description": "Identifiant ou référence de la preuve"}},
         "quality.read", _evidence, ("preuve",)),
    Tool("lister_ecarts",
         "Écarts (constats) relevés par les contrôles du moteur ou les audits internes, avec l'explication et ce qui "
         "est à faire. Par défaut : les écarts ouverts ou en traitement.",
         {"statut": {"type": "array", "items": {"type": "string", "enum": list(FINDING_STATUSES)}},
          "indicateur": _NUMBER, "limite": _LIMIT},
         "quality.read", _findings),
    Tool("lister_echeances",
         "Jalons de l'échéancier des sessions en retard, ou non faits et dont l'échéance tombe dans les prochains "
         "jours. Les délais de l'échéancier viennent du circuit de session retenu (délais recommandés), ce ne sont "
         "pas des obligations du référentiel.",
         {"jours": {"type": "integer", "minimum": 0, "maximum": 365, "default": 15, "description": "Horizon en jours"},
          "responsable": {"type": "string", "description": "Rôle responsable du jalon (ex. gestion, formateur)"},
          "limite": _LIMIT},
         "quality.read", _deadlines),
    Tool("lister_actions_correctives",
         "Actions correctives et préventives, par échéance, avec l'écart d'origine et leur avancement.",
         {"statut": {"type": "string", "enum": list(CAPA_STATUSES)},
          "en_retard": {"type": "boolean", "default": False, "description": "Seulement les actions en retard"},
          "limite": _LIMIT},
         "quality.read", _actions),
    Tool("synthese_session",
         "Synthèse Qualiopi d'une session de formation : pièces du parcours réunies (conventions, convocations, "
         "émargements, évaluations, attestations…), état des indicateurs pour la session, contrôles et preuves.",
         {"session": {"type": "string", "description": "Identifiant ou référence de la session"}},
         "quality.read", _session_summary, ("session",)),
    Tool("fiche_formation",
         "Ce que le moteur sait d'une formation : par indicateur, l'état de préparation calculé sur ses contrôles et "
         "ceux de ses sessions, le détail des contrôles, ses preuves et ses écarts ouverts. Les éléments communs à "
         "tout l'organisme restent dans l'état des indicateurs.",
         {"formation": {"type": "string", "description": "Identifiant, code ou slug de catalogue de la formation"}},
         "quality.read", _program, ("formation",)),
    Tool("lister_sessions",
         "Sessions de formation, de la plus récente à la plus ancienne, avec leur formation, leur formateur, leur "
         "statut et le nombre d'inscrits.",
         {"statut": {"type": "string", "enum": list(t.SESSION_STATUSES)},
          "du": {"type": "string", "format": "date", "description": "Sessions finissant à partir de cette date"},
          "au": {"type": "string", "format": "date", "description": "Sessions commençant au plus tard à cette date"},
          "limite": _LIMIT},
         ("sessions.read", "sessions.read_own"), _sessions),
    Tool("planning",
         "Planning des sessions sur une période (31 jours à partir d'aujourd'hui par défaut, 93 au plus) : créneaux "
         "(demi-journées d'émargement, sinon dates de la session) avec formation, formateur et salle, et conflits de "
         "formateur ou de salle signalés pour information (rien n'est bloqué : la personne qui planifie décide).",
         {"du": {"type": "string", "format": "date", "description": "Début de période AAAA-MM-JJ"},
          "au": {"type": "string", "format": "date", "description": "Fin de période AAAA-MM-JJ"},
          "formateur": {"type": "string", "description": "Identifiant du formateur"},
          "lieu": {"type": "string", "description": "Lieu ou salle"},
          "programme": {"type": "string", "description": "Identifiant de la formation"},
          "annulees": {"type": "boolean", "default": False, "description": "Inclure les sessions annulées"}},
         ("sessions.read", "sessions.read_own"), _planning),
    Tool("lister_audits",
         "Audits internes et audits blancs de l'organisme, du plus récent au plus ancien : période, échantillon de "
         "sessions, avancement et jugements de l'organisme sur ses propres preuves. Ils ne remplacent pas l'audit du "
         "certificateur.",
         {"limite": _LIMIT},
         "quality.read", _audits),
    Tool("lister_veille",
         "Éléments de veille notés par l'organisme (légale et réglementaire, métiers et compétences, pédagogique et "
         "technologique), les plus récents d'abord, avec leur source et leur exploitation.",
         {"limite": _LIMIT},
         QUALITY_READ, _watch),
    Tool("lister_reclamations",
         "Réclamations, difficultés et aléas enregistrés, les plus récents d'abord, avec la session concernée, les "
         "dates d'accusé de réception, de réponse et de résolution.",
         {"limite": _LIMIT},
         QUALITY_READ, _complaint_list),
    Tool("lister_lieux",
         "Sites et salles de l'organisme (par code) : type, site de rattachement, étage, capacité, accessibilité, "
         "statut, date de dernière vérification et nombre d'équipements.",
         {"limite": _LIMIT},
         QUALITY_READ, _premises),
    Tool("lister_equipements",
         "Équipements pédagogiques et de sécurité (par catégorie) : quantité, salle, référence réglementaire, statut, "
         "dernière et prochaine vérification, et `check_overdue` (prochaine vérification dépassée, calculé par "
         "l'application). Les échéances de vérification sont celles saisies par l'organisme.",
         {"limite": _LIMIT},
         QUALITY_READ, _equipment),
    Tool("fiche_audit",
         "Un audit interne ou audit blanc : période, échantillon de sessions, par indicateur l'état calculé par le "
         "moteur au moment de la photo, le jugement de l'organisme, les résultats, preuves et écarts figés. C'est "
         "l'auto-évaluation de l'organisme, jamais une décision du certificateur.",
         {"audit": {"type": "string", "description": "Identifiant ou référence de l'audit (ex. AUD-2026-001)"}},
         "quality.read", _audit, ("audit",)),
    Tool("referencement_edof",
         "Référencement CPF (EDOF) : profil de l'établissement, son dossier (pièces, anomalies relevées par "
         "l'application) et, pour chaque formation, l'état de son dossier EDOF avec le nombre d'anomalies bloquantes "
         "et à vérifier. Un dossier complet dans GSMS n'est pas une acceptation : seule la Caisse des Dépôts décide.",
         {},
         "edof.read", _edof_overview),
    Tool("fiche_dossier_edof",
         "Un dossier EDOF (établissement ou formation) : pièces exigées et leur état, anomalies, compléments demandés, "
         "accompagnements, étapes (dépôt, décision) et actions possibles. Les pièces sensibles restent masquées sans "
         "le droit correspondant.",
         {"dossier": {"type": "string", "description": "Identifiant du dossier EDOF"},
          "formation": {"type": "string", "description": "Ou : identifiant, code ou slug de la formation"}},
         "edof.read", _edof_dossier),
    Tool("lister_formateurs",
         "Formateurs (par nom) : interne ou externe, spécialités, nombre de sessions et de titres enregistrés.",
         {"limite": _LIMIT},
         "sessions.read", _trainers),
    Tool("fiche_formateur",
         "Fiche d'un formateur : spécialités, statut interne ou externe, présentation sur le site, nombre de sessions "
         "et de titres.",
         {"formateur": {"type": "string", "description": "Identifiant ou « Prénom Nom » du formateur"}},
         "sessions.read", _trainer, ("formateur",)),
    Tool("lister_titres_formateurs",
         "Titres et qualifications des formateurs (carte professionnelle, SSIAP, formateur SST…), par date de fin de "
         "validité : type, libellé, numéro, obtention, fin de validité.",
         {"formateur": {"type": "string", "description": "Seulement ce formateur (identifiant ou « Prénom Nom »)"},
          "limite": _LIMIT},
         "sessions.read", _qualifications),
    Tool("echeances_titres_formateurs",
         "Titres des formateurs expirés ou qui expirent dans les prochains jours (état EXPIRE ou A_RENOUVELER, "
         "calculé à partir de la date de fin saisie).",
         {"jours": {"type": "integer", "minimum": 0, "maximum": 3650, "default": 90, "description": "Horizon en jours"},
          "limite": _LIMIT},
         "staff.read", _expiring_titles),
    Tool("lister_personnel",
         "Personnel de l'organisme (par nom) : service, statut, fonction, contrat en cours, contrats et absences.",
         {"actifs": {"type": "boolean", "default": True, "description": "Seulement le personnel actif"},
          "service": {"type": "string", "description": "Code du service"},
          "limite": _LIMIT},
         "staff.read", _staff),
    Tool("lister_dossiers_financement",
         "Dossiers de financement des inscriptions (les plus récents d'abord) : chaque source (CPF, OPCO, France "
         "Travail, entreprise…) avec son état dans le circuit du dispositif, ses montants, ses pièces et les actions "
         "possibles.",
         {"limite": _LIMIT},
         "funding.read", _funding_cases),
    Tool("echeances_financement",
         "Échéances des dossiers de financement dans les prochains jours (délais du circuit de chaque dispositif "
         "tel que paramétré).",
         {"jours": {"type": "integer", "minimum": 0, "maximum": 365, "default": 15, "description": "Horizon en jours"},
          "limite": _LIMIT},
         "funding.read", _funding_deadlines),
    Tool("lister_factures",
         "Factures et avoirs (les plus récents d'abord) : numéro, client, statut, échéance, montants en centimes "
         "(HT, TVA, TTC, encaissé, reste dû, trop-perçu) et retard. Liste seulement : aucune pièce n'est renvoyée.",
         {"type": {"type": "string", "enum": ["FACTURE", "AVOIR"]},
          "statut": {"type": "string", "description": "Statut de la facture (ex. BROUILLON, EMISE)"},
          "en_retard": {"type": "boolean", "default": False, "description": "Seulement les factures en retard"},
          "recherche": {"type": "string", "description": "Texte cherché dans le numéro, le client ou l'intitulé"},
          "limite": _LIMIT},
         "invoices.read", _invoices),
    Tool("synthese_factures",
         "Chiffres de l'accueil Factures et encaissements : brouillons, factures par statut, montant à encaisser, en "
         "retard, encaissé ce mois-ci (en centimes) et alertes d'échéance.",
         {},
         "invoices.read", _invoices_overview),
    Tool("lister_encaissements",
         "Encaissements reçus (les plus récents d'abord) : montant en centimes, date, mode, facture et client.",
         {"du": {"type": "string", "format": "date", "description": "Reçus à partir de cette date"},
          "au": {"type": "string", "format": "date", "description": "Reçus au plus tard à cette date"},
          "annules": {"type": "boolean", "default": False, "description": "Inclure les encaissements annulés"},
          "limite": _LIMIT},
         "invoices.read", _payments),
    Tool("lister_preinscriptions",
         "Demandes de préinscription reçues du site (les plus récentes d'abord), avec les compteurs par statut : "
         "formation demandée, session souhaitée, financement, situation, origine, traitement.",
         {"statut": {"type": "array", "items": {"type": "string", "enum": list(PREINSCRIPTION_STATUSES)}},
          "formation": {"type": "string", "description": "Slug ou identifiant de la formation"},
          "recherche": {"type": "string", "description": "Texte cherché (référence, nom, formation…)"},
          "limite": _LIMIT},
         "leads.read", _preinscriptions),
    Tool("fiche_preinscription",
         "Une demande de préinscription : formation, expérience, motivation, déclarations, conversion, sessions "
         "proposables (avec la décision d'inscription de l'application) et actions possibles.",
         {"demande": {"type": "string", "description": "Identifiant ou référence de la demande (ex. PRE-2026-001)"}},
         "leads.read", _preinscription, ("demande",)),
    Tool("lister_documents_professionnels",
         "Documents professionnels (devis, propositions, rapports…), du plus récemment modifié au plus ancien : type, "
         "client, statut, validité et montants.",
         {"type": {"type": "string", "description": "Type de document (ex. DEVIS)"},
          "entreprise": {"type": "string", "description": "Identifiant de l'entreprise cliente"},
          "limite": _LIMIT},
         "documents.read", _business_documents),
    Tool("dossier_pieces",
         "Dossier de pièces de l'organisme ou d'un formateur : chaque pièce attendue, les indicateurs qu'elle sert et "
         "son état (MANQUANTE, DEMANDEE, EN_RETARD, A_COMPLETER, RECUE, VALIDEE, REJETEE, EXPIREE).",
         {"dossier": {"type": "string", "enum": ["ORGANISME", "FORMATEUR"]},
          "formateur": {"type": "string", "description": "Pour un dossier FORMATEUR : identifiant ou « Prénom Nom »"}},
         "quality.read", _pieces_dossier, ("dossier",)),
    Tool("evaluations_acquis",
         "Évaluations des acquis par inscription (sessions visibles) : étape « évaluations » du parcours, notes, "
         "attestation et résultat de certification, avec les compteurs.",
         {"session": {"type": "string", "description": "Identifiant ou référence de session"},
          "formation": {"type": "string", "description": "Identifiant, code ou slug de la formation"},
          "etat": {"type": "string", "description": "État de l'étape « évaluations »"},
          "resultat": {"type": "string", "enum": ["REUSSI", "NON_REUSSI", "EN_ATTENTE", "AUCUN"]},
          "limite": _LIMIT},
         ("sessions.read", "sessions.read_own"), _assessments),
    Tool("lister_enquetes_satisfaction",
         "Enquêtes de satisfaction (les plus récentes d'abord) : session, public (apprenant à chaud, entreprise, "
         "formateur, financeur…), dates d'envoi et de réponse, note et commentaire.",
         {"limite": _LIMIT},
         QUALITY_READ, _surveys),
    Tool("resultats_formations",
         "Résultats mesurés par formation sur une période (12 mois par défaut) : taux de réussite, d'abandon et de "
         "satisfaction calculés à partir de ce qui est enregistré, méthode de calcul, taux publiés et écarts avec la "
         "mesure.",
         {"mois": {"type": "integer", "minimum": 1, "maximum": 60, "default": 12, "description": "Période en mois"}},
         ("sessions.read", "quality.read"), _results),
    Tool("lister_stagiaires",
         "Stagiaires (par nom) : entreprise et nombre d'inscriptions.",
         {"entreprise": {"type": "string", "description": "Identifiant de l'entreprise"}, "limite": _LIMIT},
         "sessions.read", _learners),
    Tool("inscriptions_stagiaire",
         "Inscriptions d'un stagiaire, de la session la plus récente à la plus ancienne : statut, financement, "
         "session, formation et formateur.",
         {"stagiaire": {"type": "string", "description": "Identifiant ou « Prénom Nom » du stagiaire"},
          "limite": _LIMIT},
         "sessions.read", _learner_enrollments, ("stagiaire",)),
    Tool("lister_entreprises",
         "Entreprises clientes (par nom) : SIRET, interlocuteur, nombre de stagiaires et d'inscriptions.",
         {"limite": _LIMIT},
         "sessions.read", _companies),
    Tool("fiche_session",
         "Une session : formation, dates, lieu, formateur, statut, stagiaires inscrits et actions possibles maintenant "
         "(décidées par l'application).",
         {"session": {"type": "string", "description": "Identifiant ou référence de la session"}},
         ("sessions.read", "sessions.read_own"), _session, ("session",)),
    Tool("parcours_session",
         "Parcours des stagiaires d'une session : pour chacun, les étapes faites ou non (analyse du besoin, "
         "convocation, émargement, évaluations, attestation…) et ce qui est possible maintenant.",
         {"session": {"type": "string", "description": "Identifiant ou référence de la session"}},
         ("sessions.read", "sessions.read_own"), _session_journey, ("session",)),
    Tool("activite_session",
         "Ce qui s'est passé sur une session (inscriptions, émargements, évaluations…), du plus récent au plus ancien.",
         {"session": {"type": "string", "description": "Identifiant ou référence de la session"}, "limite": _LIMIT},
         ("sessions.read", "sessions.read_own"), _session_activity, ("session",)),
    Tool("journal_activite",
         "Fil des dernières modifications enregistrées, toutes données confondues (table, élément, champs modifiés, "
         "auteur, date) ; `suite` donne l'identifiant à passer dans « avant » pour la page suivante.",
         {"table": {"type": "string", "description": "Seulement cette table (ex. formation.session)"},
          "avant": {"type": "integer", "minimum": 1, "description": "Lignes antérieures à cet identifiant"},
          "limite": _LIMIT},
         "journal.read", _journal),
)

BY_NAME = {tool.name: tool for tool in TOOLS}
