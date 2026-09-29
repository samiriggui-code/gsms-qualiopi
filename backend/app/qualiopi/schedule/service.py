"""Échéancier : pour chaque session, quels jalons du circuit sont à venir, à échéance, en retard ou faits.

Déterministe : dates de la session + preuves + date du jour. Les contrôles Qualiopi constatent un
trou une fois la session exigible ; l'échéancier prévient avant.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR
from app.core.db import utcnow
from app.qualiopi.evidence.models import USABLE_STATUSES, Evidence
from app.qualiopi.schedule.models import MilestoneStatus
from app.training import models as t

CIRCUITS_DIR = BACKEND_DIR / "config" / "circuits"


class MilestoneDef(BaseModel):
    key: str
    label: str
    anchor: str = Field(pattern="^(start|end)$")
    offset_days: int
    warn_days: int = 5
    evidence: str
    facts: dict = Field(default_factory=dict)
    enrollments: list[str]
    owner: str
    indicators: list[int] = Field(default_factory=list)


class Circuit(BaseModel):
    code: str
    title: str
    milestones: list[MilestoneDef]


@lru_cache
def load_circuit(name: str = "standard") -> Circuit:
    raw = yaml.safe_load(Path(CIRCUITS_DIR / f"{name}.yaml").read_text(encoding="utf-8"))
    circuit = Circuit(**raw["circuit"], milestones=raw["milestones"])
    keys = [m.key for m in circuit.milestones]
    if len(keys) != len(set(keys)):
        raise ValueError(f"circuit {name} : clés de jalon en double")
    return circuit


def due_date(m: MilestoneDef, s: t.TrainingSession) -> date:
    anchor = s.start_date if m.anchor == "start" else s.end_date
    return anchor + timedelta(days=m.offset_days)


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def assess(m: MilestoneDef, s: t.TrainingSession, evidence: list[Evidence], today: date) -> dict:
    """État d'un jalon pour une session. Fonction pure (testée sans base)."""
    due = due_date(m, s)
    people = [e for e in s.enrollments if e.status in m.enrollments]
    done_ids = {
        ev.enrollment_id
        for ev in evidence
        if ev.evidence_type == m.evidence
        and ev.status in USABLE_STATUSES
        and all(ev.facts.get(k) == v for k, v in m.facts.items())
    }
    missing = [{"who": e.learner.full_name, "enrollment_id": e.id} for e in people if e.id not in done_ids]
    done = len(people) - len(missing)
    if not people:
        status, why = "SANS_OBJET", ("Aucun apprenant n'a encore terminé la formation." if m.enrollments == ["TERMINE"]
                                     else "Aucun apprenant concerné.")
    elif not missing:
        status, why = "FAIT", f"{done}/{len(people)} : fait."
    elif today > due:
        late = (today - due).days
        status, why = "EN_RETARD", f"Échéance du {_fmt(due)} dépassée de {late} jour(s) : {done}/{len(people)}, manque {_names(missing)}."
    elif today >= due - timedelta(days=m.warn_days):
        left = (due - today).days
        status, why = "A_ECHEANCE", f"Échéance le {_fmt(due)} (dans {left} jour(s)) : {done}/{len(people)}, manque {_names(missing)}."
    else:
        status, why = "A_VENIR", f"Échéance le {_fmt(due)} : {done}/{len(people)}."
    return {"due_on": due, "status": status, "done": done, "total": len(people), "missing": missing, "explanation": why}


def _names(missing: list[dict], limit: int = 5) -> str:
    names = [m["who"] for m in missing[:limit]]
    more = len(missing) - limit
    return ", ".join(names) + (f" et {more} autre(s)" if more > 0 else "")


def refresh_schedule(db: Session, sessions: list[t.TrainingSession], today: date | None = None, circuit_name: str = "standard") -> int:
    """Recalcule l'échéancier des sessions données (le worker l'appelle après chaque lot et chaque nuit)."""
    today = today or date.today()
    circuit = load_circuit(circuit_name)
    ids = [s.id for s in sessions]
    if not ids:
        return 0
    evidence = list(db.scalars(select(Evidence).where(Evidence.session_id.in_(ids), Evidence.status != "RETIREE")))
    by_session: dict[str, list[Evidence]] = {}
    for ev in evidence:
        by_session.setdefault(ev.session_id, []).append(ev)
    existing = {(r.session_id, r.key): r for r in db.scalars(select(MilestoneStatus).where(MilestoneStatus.session_id.in_(ids)))}
    count = 0
    for s in sessions:
        if s.status == "ANNULEE":
            db.execute(delete(MilestoneStatus).where(MilestoneStatus.session_id == s.id))
            continue
        for m in circuit.milestones:
            result = assess(m, s, by_session.get(s.id, []), today)
            row = existing.get((s.id, m.key))
            if row is None:
                row = MilestoneStatus(session_id=s.id, key=m.key)
                db.add(row)
            row.circuit = circuit.code
            row.label = m.label
            row.owner = m.owner
            row.indicators = m.indicators
            row.due_on = result["due_on"]
            row.status = result["status"]
            row.done = result["done"]
            row.total = result["total"]
            row.missing = result["missing"]
            row.explanation = result["explanation"][:500]
            row.evaluated_at = utcnow()
            count += 1
    db.flush()
    return count


def milestone_view(r: MilestoneStatus) -> dict:
    return {
        "key": r.key, "label": r.label, "owner": r.owner, "due_on": r.due_on.isoformat(), "status": r.status,
        "done": r.done, "total": r.total, "missing": r.missing, "indicators": r.indicators, "explanation": r.explanation,
    }
