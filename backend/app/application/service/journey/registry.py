"""Registres du parcours, toutes sessions confondues : une étape (convocations, émargements…), les
inscriptions, les abandons, la présentation à la certification.

Rien n'est recalculé ici : chaque ligne reprend l'état et les actions que `journey_view` décide pour
le stagiaire, pour que l'écran transversal et le dossier de session disent toujours la même chose.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.access.training_scope import can_see
from app.application.service.journey.service import journey_view
from app.errors.errors import InvalidStateError, NotFoundError
from app.types import training as t
from app.types.auth import User

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
    # Identifiant et e-mail du stagiaire : lien vers sa fiche et avatar (déjà visibles avec le même droit).
    base = {"inscription": e.id, "stagiaire": v["stagiaire"], "stagiaire_id": e.learner_id,
            "stagiaire_email": e.learner.email if e.learner else None, "statut": v["statut"], "session": _session(e.session),
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
               else row["statut"] if view != "certification" else _exam_result(row["epreuves"]))
        counts[key] = counts.get(key, 0) + 1
    return {"vue": view, "compteurs": counts, "lignes": rows}


def _exam_result(epreuves: list[dict]) -> str:
    """Résultat de présentation à la certification : celui de la dernière épreuve."""
    last = epreuves[-1]["reussi"]
    return "REUSSI" if last else "NON_REUSSI" if last is False else "EN_ATTENTE"


RESULTS = ("REUSSI", "NON_REUSSI", "EN_ATTENTE", "AUCUN")


def assessments(db: Session, user: User, today: date | None = None, session_id: str | None = None,
                program_id: str | None = None, etat: str | None = None, resultat: str | None = None) -> dict:
    """Évaluations des acquis, attestation et présentation à la certification, une ligne par inscription.

    Composé à partir des registres « evaluations », « attestation » et « certification » (mêmes états, mêmes
    actions) ; s'y ajoute seulement le détail des évaluations enregistrées. `etat` filtre sur l'étape
    « évaluations », `resultat` sur la certification (AUCUN : aucune épreuve d'examen enregistrée)."""
    if etat is not None and etat not in STATE_ORDER:
        raise InvalidStateError(f"État : {', '.join(STATE_ORDER)}")
    if resultat is not None and resultat not in RESULTS:
        raise InvalidStateError(f"Résultat : {', '.join(RESULTS)}")
    today = today or date.today()
    q = select(t.TrainingSession).order_by(t.TrainingSession.start_date.desc())
    if session_id:
        q = q.where(t.TrainingSession.id == session_id)
    if program_id:
        q = q.where(t.TrainingSession.program_id == program_id)
    rows = []
    counts: dict[str, dict[str, int]] = {"evaluations": {}, "attestation": {}, "certification": {}}
    for s in db.scalars(q):
        if not can_see(db, user, s):
            continue
        for e in s.enrollments:
            v = journey_view(db, e, user, today)
            ev, att = _row(e, v, "evaluations"), _row(e, v, "attestation")
            cert = _row(e, v, "certification")
            res = _exam_result(cert["epreuves"]) if cert else "AUCUN"
            if (etat and ev["etape"]["etat"] != etat) or (resultat and res != resultat):
                continue
            row = {k: ev[k] for k in ("inscription", "stagiaire", "stagiaire_id", "stagiaire_email", "statut", "session",
                                      "entreprise", "financement")}
            row["session"] = row["session"] | {"programme_id": s.program_id, "programme_code": s.program_code,
                                               "certifiante": bool(s.program and s.program.is_certifying)}
            row["evaluations"] = ev["etape"] | {"action": ev["action"], "liste": [
                {"id": a.id, "nature": a.kind, "intitule": a.label, "le": a.assessed_on.isoformat(),
                 "note": float(a.score) if a.score is not None else None, "reussi": a.passed}
                for a in sorted(e.assessments, key=lambda a: (a.assessed_on, a.label))]}
            row["attestation"] = att["etape"] | {"action": att["action"]}
            row["certification"] = {"resultat": res, "epreuves": cert["epreuves"] if cert else []}
            rows.append(row)
            for key, value in (("evaluations", ev["etape"]["etat"]), ("attestation", att["etape"]["etat"]),
                               ("certification", res)):
                counts[key][value] = counts[key].get(value, 0) + 1
    rows.sort(key=lambda r: (STATE_ORDER.get(r["evaluations"]["etat"], 5), r["session"]["debut"], r["stagiaire"]))
    return {"compteurs": counts, "lignes": rows}


def summary(db: Session, user: User, today: date | None = None) -> dict:
    """Vue d'ensemble du parcours (page de section) : pour chaque étape, le nombre de stagiaires par état, plus les
    inscriptions par statut, les abandons et les examens. Un seul passage sur les inscriptions visibles."""
    today = today or date.today()
    steps: dict[str, dict[str, int]] = {k: {} for k in STEP_ACTIONS}
    statuses: dict[str, int] = {}
    exams = {"presentes": 0, "reussis": 0}
    late_rows: list[dict] = []
    for s in db.scalars(select(t.TrainingSession).order_by(t.TrainingSession.start_date)):
        if not can_see(db, user, s):
            continue
        for e in s.enrollments:
            v = journey_view(db, e, user, today)
            statuses[e.status] = statuses.get(e.status, 0) + 1
            for st in v["etapes"]:
                if st["etape"] in steps:
                    steps[st["etape"]][st["etat"]] = steps[st["etape"]].get(st["etat"], 0) + 1
                    if st["etat"] == "EN_RETARD":
                        late_rows.append({"stagiaire": v["stagiaire"], "session": s.reference, "session_id": s.id,
                                          "etape": st["etape"], "echeance": st.get("echeance")})
            exam = [a for a in e.assessments if a.kind == "EXAMEN"]
            if exam:
                exams["presentes"] += 1
                exams["reussis"] += bool(sorted(exam, key=lambda a: a.assessed_on)[-1].passed)
    late_rows.sort(key=lambda r: r["echeance"] or "")
    return {"etapes": steps, "inscriptions": statuses, "examens": exams, "en_retard": late_rows}
