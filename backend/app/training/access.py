"""Portée des sessions : toutes (sessions.read) ou seulement les siennes (sessions.read_own).

« Les siennes » = celles dont le formateur est relié au compte de l'utilisateur
(équivalent du `if_owner` / `User Permission` de Frappe, porté par le domaine).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import permissions_of
from app.core.errors import NotFoundError
from app.training import models as t


def own_trainer_ids(db: Session, user: User) -> set[str]:
    return set(db.scalars(select(t.Trainer.id).where(t.Trainer.user_id == user.id)))


def sees_all(db: Session, user: User) -> bool:
    return "sessions.read" in permissions_of(db, user)


def can_see(db: Session, user: User | None, s: t.TrainingSession) -> bool:
    if user is None or sees_all(db, user):
        return True
    return "sessions.read_own" in permissions_of(db, user) and s.trainer_id in own_trainer_ids(db, user)


def visible_session(db: Session, user: User, session_id: str) -> t.TrainingSession:
    """Une session hors de portée répond « introuvable » : on ne révèle pas son existence."""
    s = db.get(t.TrainingSession, session_id)
    if s is None or not can_see(db, user, s):
        raise NotFoundError("Session introuvable")
    return s
