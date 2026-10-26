"""Outils du serveur MCP : lectures du moteur Qualiopi pour l'assistant IA.

Chaque outil appelle la fonction de la route HTTP correspondante (mêmes services, mêmes politiques, même
forme de réponse) : aucune règle métier n'est recodée ici. On n'ajoute que :
- la permission exigée, identique à celle de la route (vérifiée avant l'appel, refus lisible sinon) ; quand la route
  accepte plusieurs permissions (l'une ou l'autre), l'outil porte le même tuple ;
- la traduction des arguments (une session ou une preuve se désigne aussi par sa référence, une formation par son
  code ou son slug de catalogue) ;
- une limite sur les listes, pour ne pas noyer l'assistant.

Tous les outils sont en lecture seule : aucun n'écrit en base.
"""

from __future__ import annotations

import inspect
import typing
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors.errors import InvalidStateError, NotFoundError
from app.handler import qualiopi as routes
from app.handler import qualiopi_ecrans as screens
from app.handler import training as training_routes
from app.handler.training_resources import QUALITY_READ
from app.handler.training_resources import ROUTERS as CRUD_ROUTERS
from app.middleware.auth import permissions_of
from app.types import training as t
from app.types.auth import User
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
    if not permissions_of(db, user) & {"sessions.read", "sessions.read_own"}:
        # Lecture qualité seule (compte de l'assistant) : les sessions de la période de certification, telles que
        # GET /qualiopi/audits/echantillon les montre déjà à ce droit ; les filtres ne font que trier ces lignes.
        sample = screens.proposed_sample(db, user)
        rows = [s for s in sample["sessions"] if (status is None or s["statut"] == status)
                and (du is None or s["au"] >= du.isoformat()) and (au is None or s["du"] <= au.isoformat())]
        return _capped(rows, _limit(args), "sessions", periode=sample["periode"],
                       portee="Sessions de la période de certification (vue qualité)")
    rows = training_routes.list_sessions(db, user, statut=status, du=du, au=au)
    views = [training_routes.SessionView.model_validate(s).model_dump(mode="json") for s in rows]
    return _capped(views, _limit(args), "sessions")


def _audits(db: Session, user: User, args: dict) -> object:
    out = screens.list_audits(db, user)
    return {**out, **_capped(out["audits"], _limit(args), "audits")}


_watch_items = _crud_list("watch-items")
_complaints = _crud_list("complaints")


def _watch(db: Session, user: User, args: dict) -> object:
    return _capped(_watch_items(db, user), _limit(args), "veille")


def _complaint_list(db: Session, user: User, args: dict) -> object:
    return _capped(_complaints(db, user), _limit(args), "reclamations")


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
         "statut et le nombre d'inscrits. Avec la seule lecture qualité : les sessions de la période de certification "
         "(référence, formation, dates, statut), comme l'échantillon d'audit.",
         {"statut": {"type": "string", "enum": list(t.SESSION_STATUSES)},
          "du": {"type": "string", "format": "date", "description": "Sessions finissant à partir de cette date"},
          "au": {"type": "string", "format": "date", "description": "Sessions commençant au plus tard à cette date"},
          "limite": _LIMIT},
         ("sessions.read", "sessions.read_own", "quality.read"), _sessions),
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
)

BY_NAME = {tool.name: tool for tool in TOOLS}
