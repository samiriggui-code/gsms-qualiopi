"""Outils du serveur MCP : lectures du moteur Qualiopi pour l'assistant IA.

Chaque outil appelle la fonction de la route HTTP correspondante (mêmes services, mêmes politiques, même
forme de réponse) : aucune règle métier n'est recodée ici. On n'ajoute que :
- la permission exigée, identique à celle de la route (vérifiée avant l'appel, refus lisible sinon) ;
- la traduction des arguments (une session ou une preuve se désigne aussi par sa référence) ;
- une limite sur les listes, pour ne pas noyer l'assistant.

Tous les outils sont en lecture seule : aucun n'écrit en base.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors.errors import InvalidStateError, NotFoundError
from app.handler import qualiopi as routes
from app.handler import qualiopi_ecrans as screens
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
    permission: str
    run: Callable[[Session, User, dict], object]
    required: tuple[str, ...] = ()

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
)

BY_NAME = {tool.name: tool for tool in TOOLS}
