"""Conditions nommées des relances. Elles lisent les données existantes ; rien n'est saisi en double.

Une condition est évaluée à la planification, puis relue juste avant l'envoi : si la chose est faite
entre-temps (convention signée, évaluation saisie…), le message est annulé au lieu de partir.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.qualiopi.schedule.models import MilestoneStatus
from app.training import models as t


@dataclass
class Ctx:
    db: Session
    today: date
    session: t.TrainingSession | None = None
    enrollment: t.Enrollment | None = None
    milestone: MilestoneStatus | None = None


ACTIVE = ("INSCRIT", "CONFIRME")


def _inscription_active(c: Ctx) -> bool:
    return c.enrollment is not None and c.enrollment.status in ACTIVE and c.session.status not in ("ANNULEE", "CLOTUREE")


def _convention_non_signee(c: Ctx) -> bool:
    ag = c.enrollment.agreement if c.enrollment else None
    return _inscription_active(c) and not (ag and ag.signed_on)


def _session_a_venir(c: Ctx) -> bool:
    return c.session is not None and c.session.status in ("PLANIFIEE", "CONFIRMEE") and c.session.start_date >= c.today


def _evaluations_manquantes(c: Ctx) -> bool:
    s = c.session
    if s is None or s.status in ("ANNULEE", "CLOTUREE"):
        return False
    return any(not e.assessments for e in s.enrollments if e.status in (*ACTIVE, "TERMINE"))


def _jalon_non_fait(c: Ctx) -> bool:
    m = c.milestone
    return m is not None and m.status in ("A_ECHEANCE", "EN_RETARD")


def _toujours(c: Ctx) -> bool:
    return True


CONDITIONS: dict[str, Callable[[Ctx], bool]] = {
    "inscription_active": _inscription_active,
    "convention_non_signee": _convention_non_signee,
    "session_a_venir": _session_a_venir,
    "evaluations_manquantes": _evaluations_manquantes,
    "jalon_non_fait": _jalon_non_fait,
    "toujours": _toujours,
}

LABELS = {
    "inscription_active": "l'inscription n'est plus active",
    "convention_non_signee": "la convention est signée",
    "session_a_venir": "la session a commencé ou n'est plus prévue",
    "evaluations_manquantes": "les évaluations sont saisies",
    "jalon_non_fait": "le jalon est fait",
    "toujours": "",
}
