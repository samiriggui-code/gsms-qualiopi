"""Registres du parcours, toutes sessions confondues : une étape (convocations, émargements…), les
inscriptions, les abandons, la présentation à la certification.

Rien n'est recalculé ici : chaque ligne reprend l'état et les actions que `journey_view` décide pour
le stagiaire, pour que l'écran transversal et le dossier de session disent toujours la même chose.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.errors import NotFoundError
from app.journey.service import journey_view
from app.training import models as t
from app.training.access import can_see

# Étape → action du parcours qui la fait avancer (celle qu'on propose depuis le registre).
STEP_ACTIONS = {
    "analyse_besoin": "analyse_besoin", "positionnement": "positionnement", "convention": "convention_signer",
    "convocation": "convocation", "emargement": None, "evaluations": "evaluation", "attestation": "attestation",
    "satisfaction_chaud": "satisfaction_chaud", "satisfaction_froid": "satisfaction_froid",
}
VIEWS = (*STEP_ACTIONS, "inscriptions", "abandons", "certification")
# Ordre d'affichage : ce qui demande une action d'abord.
STATE_ORDER = {"EN_RETARD": 0, "A_ECHEANCE": 1, "A_VENIR": 2, "FAIT": 3, "SANS_OBJET": 4}


def _session(s: t.TrainingSession) -> dict:
    return {"id": s.id, "reference": s.reference, "intitule": s.program.title if s.program else None,
            "debut": s.start_date.isoformat(), "fin": s.end_date.isoformat(), "statut": s.status}


def _progress(steps: list[dict]) -> dict:
    applicable = [st for st in steps if st["etat"] != "SANS_OBJET"]
    pending = sorted((st for st in applicable if st["etat"] != "FAIT"), key=lambda st: STATE_ORDER[st["etat"]])
    nxt = pending[0] if pending else None
    return {"faits": sum(st["etat"] == "FAIT" for st in applicable), "applicables": len(applicable),
            "prochaine": {"etape": nxt["etape"], "etat": nxt["etat"], "echeance": nxt["echeance"]} if nxt else None}


def _row(e: t.Enrollment, v: dict, view: str) -> dict | None:
    base = {"inscription": e.id, "stagiaire": v["stagiaire"], "statut": v["statut"], "session": _session(e.session),
            "entreprise": v["contact"]["entreprise"], "financement": v["contact"]["financement"]}
    if view == "inscriptions":
        return base | {"inscrit_le": v["contact"]["inscrit_le"], "avancement": _progress(v["etapes"]),
                       "possible": [k for k in ("confirmer", "terminer") if v["capabilities"][k]["allowed"]]}
    if view == "abandons":
        if v["abandon"] is None:
            return None
        return base | {"abandon": v["abandon"], "avancement": _progress(v["etapes"])}
    if view == "certification":
        exams = [a for a in e.assessments if a.kind == "EXAMEN"]
        if not exams:
            return None
        return base | {"epreuves": [{"intitule": a.label, "le": a.assessed_on.isoformat(),
                                     "note": float(a.score) if a.score is not None else None, "reussi": a.passed}
                                    for a in sorted(exams, key=lambda a: a.assessed_on)]}
    step = next(st for st in v["etapes"] if st["etape"] == view)
    action = STEP_ACTIONS[view]
    cap = v["capabilities"].get(action) if action else None
    return base | {"etape": {k: step.get(k) for k in ("etat", "echeance", "le", "detail")},
                   "action": ({"cle": action, **cap} if cap else None)}


def _sort_key(row: dict) -> tuple:
    state = (row.get("etape") or {}).get("etat") or ((row.get("avancement") or {}).get("prochaine") or {}).get("etat")
    return (STATE_ORDER.get(state or "", 5), row["session"]["debut"], row["stagiaire"])


def registry(db: Session, user: User, view: str, today: date | None = None, session_id: str | None = None) -> dict:
    if view not in VIEWS:
        raise NotFoundError("Registre inconnu")
    today = today or date.today()
    q = select(t.TrainingSession).order_by(t.TrainingSession.start_date.desc())
    if session_id:
        q = q.where(t.TrainingSession.id == session_id)
    rows = []
    for s in db.scalars(q):
        if not can_see(db, user, s):
            continue
        for e in s.enrollments:
            row = _row(e, journey_view(db, e, user, today), view)
            if row is not None:
                rows.append(row)
    rows.sort(key=_sort_key)
    counts: dict[str, int] = {}
    for row in rows:
        key = ((row.get("etape") or {}).get("etat") if view in STEP_ACTIONS
               else row["statut"] if view != "certification"
               else ("REUSSI" if row["epreuves"][-1]["reussi"] else "NON_REUSSI" if row["epreuves"][-1]["reussi"] is False
                     else "EN_ATTENTE"))
        counts[key] = counts.get(key, 0) + 1
    return {"vue": view, "compteurs": counts, "lignes": rows}
