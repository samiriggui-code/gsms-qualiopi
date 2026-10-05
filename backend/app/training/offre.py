"""Écrans de l'offre de formation : résultats mesurés par formation (I2, I3) et ressources pédagogiques (I19).

Les taux sont calculés à partir de ce qui est enregistré dans GSMS (sessions terminées, examens, abandons,
enquêtes à chaud). Un taux publié sur la fiche formation n'est remplacé que par une publication explicite,
qui garde sa base de calcul (période, effectifs) : un taux sans base n'est pas vérifiable.
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import DB, permissions_of, require_any
from app.core.errors import NotFoundError
from app.events.publish import publish
from app.platform.decisions import ALLOW, Decision, deny, enforce
from app.training import models as t

router = APIRouter(prefix="/api/v1/formation", tags=["offre de formation"])

Reader = Annotated[User, Depends(require_any("sessions.read", "quality.read"))]

ENDED = ("TERMINEE", "CLOTUREE")
SATISFIED_SCORE = Decimal("4")  # note sur 5 à partir de laquelle un répondant compte comme satisfait
GAP_POINTS = 5  # écart signalé entre un taux publié et le taux mesuré

METHOD = {
    "periode": "Sessions terminées ou clôturées dont la date de fin tombe dans la période.",
    "reussite": "Stagiaires reçus à l'examen (dernière épreuve « examen » enregistrée) parmi ceux qui s'y sont présentés.",
    "abandon": "Stagiaires en abandon parmi les inscrits (inscriptions annulées exclues).",
    "satisfaction": "Répondants à l'enquête à chaud ayant donné une note d'au moins 4 sur 5, parmi les répondants.",
}


def _pct(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def _num(v: Decimal | None) -> float | None:
    return float(v) if v is not None else None


def period(months: int, today: date | None = None) -> tuple[date, date]:
    """Les `months` derniers mois, jour courant compris (12 mois au 05/10/2026 : du 06/10/2025 au 05/10/2026)."""
    end = today or date.today()
    year, month = divmod(end.year * 12 + end.month - 1 - months, 12)
    back = date(year, month + 1, min(end.day, calendar.monthrange(year, month + 1)[1]))
    return back + timedelta(days=1), end


def measure(db: Session, start: date, end: date) -> dict[str, dict]:
    """Résultats mesurés par formation sur les sessions terminées entre start et end."""
    sessions = list(db.scalars(select(t.TrainingSession).where(
        t.TrainingSession.status.in_(ENDED), t.TrainingSession.end_date >= start, t.TrainingSession.end_date <= end)))
    by_program: dict[str, dict] = defaultdict(lambda: {"sessions": 0, "stagiaires": 0, "abandons": 0, "examines": 0,
                                                       "reussis": 0, "enquetes": 0, "repondants": 0, "satisfaits": 0,
                                                       "notes": []})
    session_program = {s.id: s.program_id for s in sessions}
    for s in sessions:
        by_program[s.program_id]["sessions"] += 1
    if not sessions:
        return {}
    enrollments = list(db.scalars(select(t.Enrollment).where(t.Enrollment.session_id.in_(session_program),
                                                              t.Enrollment.status != "ANNULE")))
    exams: dict[str, list[t.Assessment]] = defaultdict(list)
    for a in db.scalars(select(t.Assessment).where(t.Assessment.enrollment_id.in_([e.id for e in enrollments]),
                                                   t.Assessment.kind == "EXAMEN", t.Assessment.passed.is_not(None))):
        exams[a.enrollment_id].append(a)
    for e in enrollments:
        m = by_program[session_program[e.session_id]]
        m["stagiaires"] += 1
        m["abandons"] += e.status == "ABANDON"
        if exams.get(e.id):
            last = max(exams[e.id], key=lambda a: (a.assessed_on, a.created_at or datetime.min))
            m["examines"] += 1
            m["reussis"] += bool(last.passed)
    for sv in db.scalars(select(t.SatisfactionSurvey).where(t.SatisfactionSurvey.session_id.in_(session_program),
                                                            t.SatisfactionSurvey.audience == "APPRENANT_CHAUD")):
        m = by_program[session_program[sv.session_id]]
        m["enquetes"] += 1
        if sv.score is not None:
            m["repondants"] += 1
            m["satisfaits"] += sv.score >= SATISFIED_SCORE
            m["notes"].append(sv.score)
    out = {}
    for pid, m in by_program.items():
        notes = m.pop("notes")
        out[pid] = {**m, "taux_reussite": _pct(m["reussis"], m["examines"]),
                    "taux_abandon": _pct(m["abandons"], m["stagiaires"]),
                    "taux_reponse": _pct(m["repondants"], m["enquetes"]),
                    "taux_satisfaction": _pct(m["satisfaits"], m["repondants"]),
                    "note_moyenne": round(float(sum(notes) / len(notes)), 2) if notes else None}
    return out


def _fr(v: float) -> str:
    return f"{v:g}".replace(".", ",")


def _gaps(p: t.Program, m: dict | None) -> list[str]:
    gaps = []
    published = {"réussite": (_num(p.success_rate), m and m["taux_reussite"]),
                 "satisfaction": (_num(p.satisfaction_rate), m and m["taux_satisfaction"])}
    for label, (shown, measured) in published.items():
        if shown is None:
            continue
        if not p.results_basis:
            gaps.append(f"Taux de {label} publié ({_fr(shown)} %) sans base de calcul enregistrée")
        elif measured is not None and abs(shown - measured) >= GAP_POINTS:
            gaps.append(f"Taux de {label} publié ({_fr(shown)} %) éloigné du taux mesuré ({_fr(measured)} %)")
    return gaps


class ResultsPolicy:
    def __init__(self, can_write: bool):
        self.can_write = can_write

    def publish(self, m: dict | None) -> Decision:
        if not self.can_write:
            return deny("PERMISSION_MISSING", "Permission « sessions.write » requise")
        if not m or (m["taux_reussite"] is None and m["taux_satisfaction"] is None):
            return deny("NOTHING_MEASURED", "Aucun examen ni aucune réponse à l'enquête à chaud sur la période : rien à publier")
        return ALLOW


def _policy(db: Session, user: User) -> ResultsPolicy:
    return ResultsPolicy("sessions.write" in permissions_of(db, user))


@router.get("/resultats")
def results(db: DB, user: Reader, mois: Annotated[int, Query(ge=1, le=60)] = 12) -> dict:
    start, end = period(mois)
    measured = measure(db, start, end)
    policy = _policy(db, user)
    rows = []
    for p in db.scalars(select(t.Program).order_by(t.Program.title)):
        m = measured.get(p.id)
        rows.append({
            "id": p.id, "code": p.code, "title": p.title, "is_certifying": p.is_certifying,
            "mesure": m,
            "publie": {"taux_reussite": _num(p.success_rate), "taux_satisfaction": _num(p.satisfaction_rate),
                       "base": p.results_basis},
            "ecarts": _gaps(p, m),
            "capabilities": {"publier": policy.publish(m).to_dict()},
        })
    rows.sort(key=lambda r: (r["mesure"] is None, -len(r["ecarts"]), r["title"]))
    totals = {k: sum(m[k] for m in measured.values()) for k in
              ("sessions", "stagiaires", "abandons", "examines", "reussis", "enquetes", "repondants", "satisfaits")}
    totals.update(taux_reussite=_pct(totals["reussis"], totals["examines"]),
                  taux_abandon=_pct(totals["abandons"], totals["stagiaires"]),
                  taux_satisfaction=_pct(totals["satisfaits"], totals["repondants"]))
    return {"periode": {"du": start, "au": end, "mois": mois}, "methode": METHOD, "totaux": totals,
            "formations_mesurees": len(measured), "formations": rows}


class PublishIn(BaseModel):
    mois: int = Field(default=12, ge=1, le=60)


@router.post("/resultats/{program_id}/publication")
def publish_results(program_id: str, body: PublishIn, db: DB, user: Reader) -> dict:
    p = db.get(t.Program, program_id)
    if p is None:
        raise NotFoundError("Formation introuvable")
    start, end = period(body.mois)
    m = measure(db, start, end).get(p.id)
    enforce(_policy(db, user).publish(m))
    if m["taux_reussite"] is not None:
        p.success_rate = Decimal(str(m["taux_reussite"]))
    if m["taux_satisfaction"] is not None:
        p.satisfaction_rate = Decimal(str(m["taux_satisfaction"]))
    p.results_basis = {
        "du": start.isoformat(), "au": end.isoformat(), "sessions": m["sessions"], "stagiaires": m["stagiaires"],
        "examines": m["examines"], "repondants": m["repondants"], "publie_le": date.today().isoformat(),
        "publie_par": user.full_name,
    }
    publish(db, "program.updated", "program", p.id, program_id=p.id, actor_id=user.id)
    db.commit()
    return {"id": p.id, "taux_reussite": _num(p.success_rate), "taux_satisfaction": _num(p.satisfaction_rate),
            "base": p.results_basis}


# ── Ressources pédagogiques ────────────────────────────────────────────────────


@router.get("/ressources")
def resources(db: DB, user: Reader) -> dict:
    programs = {p.id: p for p in db.scalars(select(t.Program).order_by(t.Program.title))}
    rows = list(db.scalars(select(t.ProgramResource).order_by(t.ProgramResource.title)))
    can_write = "sessions.write" in permissions_of(db, user)
    by_program = defaultdict(int)
    for r in rows:
        by_program[r.program_id] += 1
    return {
        "ressources": [{**{c.key: getattr(r, c.key) for c in t.ProgramResource.__table__.columns
                           if c.key not in ("created_at", "updated_at")},
                        "program_code": programs[r.program_id].code, "program_title": programs[r.program_id].title}
                       for r in rows],
        "formations": [{"id": p.id, "code": p.code, "title": p.title, "ressources": by_program.get(p.id, 0)}
                       for p in programs.values()],
        "capabilities": {"ecrire": (ALLOW if can_write else deny(
            "PERMISSION_MISSING", "Permission « sessions.write » requise")).to_dict()},
    }
