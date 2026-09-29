"""Période évaluée : quelles sessions comptent pour l'état global et pour un audit."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError
from app.qualiopi.cycle.models import CYCLE_KINDS, CertificationCycle


@dataclass(frozen=True)
class Period:
    start: date | None
    end: date | None
    label: str

    def contains_session(self, start_date: date, end_date: date) -> bool:
        """Une session compte si elle chevauche la période."""
        if self.start and end_date < self.start:
            return False
        if self.end and start_date > self.end:
            return False
        return True

    def view(self) -> dict:
        return {"start": self.start.isoformat() if self.start else None,
                "end": self.end.isoformat() if self.end else None, "label": self.label}


ALL_TIME = Period(None, None, "Toute l'activité (aucun cycle de certification défini)")


def active_cycle(db: Session, today: date | None = None) -> CertificationCycle | None:
    today = today or date.today()
    rows = db.scalars(select(CertificationCycle).where(CertificationCycle.period_start <= today).order_by(CertificationCycle.period_start.desc()))
    return next((c for c in rows if c.period_end is None or c.period_end >= today), None)


def resolve_period(db: Session, start: date | None = None, end: date | None = None, today: date | None = None) -> Period:
    """Période demandée explicitement, sinon celle du cycle en cours, sinon toute l'activité."""
    if start or end:
        if start and end and end < start:
            raise InvalidStateError("La fin de période précède son début")
        return Period(start, end, "Période choisie")
    cycle = active_cycle(db, today)
    if cycle is None:
        return ALL_TIME
    return Period(cycle.period_start, cycle.period_end, cycle.label)


def create_cycle(db: Session, *, label: str, kind: str, period_start: date, period_end: date | None,
                 audit_on: date | None, certifier: str | None, notes: str | None) -> CertificationCycle:
    if kind not in CYCLE_KINDS:
        raise InvalidStateError(f"Type de cycle attendu : {', '.join(CYCLE_KINDS)}")
    if period_end and period_end < period_start:
        raise InvalidStateError("La fin de période précède son début")
    cycle = CertificationCycle(label=label, kind=kind, period_start=period_start, period_end=period_end,
                               audit_on=audit_on, certifier=certifier, notes=notes)
    db.add(cycle)
    db.flush()
    return cycle
