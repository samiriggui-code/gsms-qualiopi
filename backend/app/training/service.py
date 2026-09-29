"""Opérations du domaine formation. Chaque écriture passe par TrainingPolicy (enforce)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.errors import ConflictError, InvalidStateError, NotFoundError
from app.events.publish import publish
from app.platform.decisions import enforce
from app.training import models as t
from app.training.lifecycle import TRANSITIONS
from app.training.policy import TrainingPolicy

EDITABLE = ("reference", "program_id", "start_date", "end_date", "location", "room", "trainer_id", "capacity")


def get_session(db: Session, session_id: str) -> t.TrainingSession:
    s = db.get(t.TrainingSession, session_id)
    if s is None:
        raise NotFoundError("Session introuvable")
    return s


def _check_refs(db: Session, data: dict) -> None:
    if data.get("program_id") and db.get(t.Program, data["program_id"]) is None:
        raise NotFoundError("Formation introuvable")
    if data.get("trainer_id") and db.get(t.Trainer, data["trainer_id"]) is None:
        raise NotFoundError("Formateur introuvable")
    if data.get("start_date") and data.get("end_date") and data["end_date"] < data["start_date"]:
        raise InvalidStateError("La date de fin précède la date de début")
    if data.get("capacity") is not None and data["capacity"] < 1:
        raise InvalidStateError("Capacité : au moins une place")


def create_session(db: Session, data: dict, actor: User) -> t.TrainingSession:
    _check_refs(db, data)
    if db.scalar(select(t.TrainingSession).where(t.TrainingSession.reference == data["reference"])):
        raise ConflictError(f"La référence {data['reference']} existe déjà")
    s = t.TrainingSession(**{k: v for k, v in data.items() if k in EDITABLE}, status="PLANIFIEE")
    db.add(s)
    db.flush()
    publish(db, "session.created", "session", s.id, session_id=s.id, program_id=s.program_id, actor_id=actor.id)
    return s


def update_session(db: Session, s: t.TrainingSession, changes: dict, actor: User, today: date | None = None) -> t.TrainingSession:
    changes = {k: v for k, v in changes.items() if k in EDITABLE and getattr(s, k) != v}
    if not changes:
        return s
    enforce(TrainingPolicy(db, actor, today).decide(s, "edit", changes))
    merged = {k: getattr(s, k) for k in EDITABLE} | changes
    _check_refs(db, merged)
    if "reference" in changes and db.scalar(select(t.TrainingSession).where(t.TrainingSession.reference == changes["reference"])):
        raise ConflictError(f"La référence {changes['reference']} existe déjà")
    for k, v in changes.items():
        setattr(s, k, v)
    publish(db, "session.updated", "session", s.id, session_id=s.id, program_id=s.program_id, actor_id=actor.id,
            payload={"fields": sorted(changes)})
    return s


def delete_session(db: Session, s: t.TrainingSession, actor: User, today: date | None = None) -> None:
    enforce(TrainingPolicy(db, actor, today).decide(s, "delete"))
    db.delete(s)


def transition(db: Session, s: t.TrainingSession, action: str, actor: User, reason: str | None = None,
               today: date | None = None) -> t.TrainingSession:
    if action not in TRANSITIONS:
        raise NotFoundError(f"Transition inconnue : {action}")
    enforce(TrainingPolicy(db, actor, today).decide(s, action))
    if action == "cancel":
        if not (reason or "").strip():
            raise InvalidStateError("Indiquez le motif de l'annulation")
        s.cancel_reason = reason.strip()
    before = s.status
    s.status = TRANSITIONS[action].to_state
    publish(db, "session.status_changed", "session", s.id, session_id=s.id, program_id=s.program_id, actor_id=actor.id,
            payload={"from": before, "to": s.status, "action": action})
    return s


def enroll(db: Session, s: t.TrainingSession, learner_id: str, actor: User, company_id: str | None = None,
           funding: str | None = None, today: date | None = None) -> t.Enrollment:
    enforce(TrainingPolicy(db, actor, today).decide(s, "enroll"))
    if db.get(t.Learner, learner_id) is None:
        raise NotFoundError("Stagiaire introuvable")
    if any(e.learner_id == learner_id for e in s.enrollments):
        raise ConflictError("Stagiaire déjà inscrit à cette session")
    e = t.Enrollment(session_id=s.id, learner_id=learner_id, company_id=company_id, funding=funding, status="INSCRIT")
    db.add(e)
    db.flush()
    db.refresh(s)
    publish(db, "learner.enrolled", "enrollment", e.id, session_id=s.id, program_id=s.program_id, actor_id=actor.id)
    return e
