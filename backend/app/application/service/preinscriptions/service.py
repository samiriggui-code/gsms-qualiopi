"""Opérations sur les demandes de préinscription. Chaque changement passe par PreinscriptionPolicy (enforce).

La conversion reprend les services existants : le stagiaire est créé avec le schéma de l'API des apprenants
(`PersonIn`), l'inscription passe par `training.service.enroll` (et donc par TrainingPolicy).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.application.access.preinscriptions import PreinscriptionPolicy, same_learner
from app.application.service.platform.decisions import enforce
from app.application.service.qualiopi.common import next_reference
from app.application.service.training import service as training
from app.database.db import utcnow
from app.errors.errors import InvalidStateError, NotFoundError
from app.event.publish import publish
from app.types import training as t
from app.types.auth import User
from app.types.preinscriptions import OPEN_STATUSES, Preinscription
from app.types.training_schemas import PersonIn

# Une même personne qui renvoie le formulaire pour la même formation ne crée pas une seconde demande.
DUPLICATE_WINDOW = timedelta(hours=24)


def get(db: Session, preinscription_id: str) -> Preinscription:
    p = db.get(Preinscription, preinscription_id)
    if p is None:
        raise NotFoundError("Demande de préinscription introuvable")
    return p


def submit(db: Session, data: dict, now: datetime | None = None) -> tuple[Preinscription, bool]:
    """Enregistre la demande reçue du site. Renvoie (demande, créée) ; un doublon récent n'est pas recréé."""
    now = now or utcnow()
    duplicate = db.scalar(select(Preinscription).where(
        func.lower(Preinscription.email) == data["email"].lower(),
        Preinscription.formation_slug == data["formation_slug"],
        Preinscription.status.in_(OPEN_STATUSES),
        Preinscription.created_at >= now - DUPLICATE_WINDOW,
    ).limit(1))
    if duplicate is not None:
        return duplicate, False
    program = db.scalar(select(t.Program).where(t.Program.catalog_slug == data["formation_slug"]))
    p = Preinscription(**data, reference=next_reference(db, "PRE"), status="NOUVELLE", consented_at=now,
                       program_id=program.id if program else None)
    db.add(p)
    db.flush()
    publish(db, "preinscription.received", "preinscription", p.id, program_id=p.program_id,
            payload={"formation": p.formation_slug, "origine": p.source_context})
    return p, True


def search(db: Session, statuts: list[str] | None = None, formation: str | None = None, recherche: str | None = None,
           limite: int = 100) -> tuple[list[Preinscription], int]:
    stmt = select(Preinscription)
    if statuts:
        stmt = stmt.where(Preinscription.status.in_(statuts))
    if formation:
        stmt = stmt.where(or_(Preinscription.formation_slug == formation, Preinscription.program_id == formation))
    if recherche and recherche.strip():
        like = f"%{recherche.strip().lower()}%"
        stmt = stmt.where(or_(*(func.lower(c).like(like) for c in (
            Preinscription.reference, Preinscription.first_name, Preinscription.last_name, Preinscription.usage_name,
            Preinscription.email, Preinscription.phone, Preinscription.formation_name, Preinscription.city))))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(stmt.order_by(Preinscription.created_at.desc()).limit(limite)))
    return rows, total


def change_status(db: Session, p: Preinscription, target: str, actor: User, motif: str | None = None,
                  today: date | None = None) -> Preinscription:
    enforce(PreinscriptionPolicy(db, actor, today).change_status(p, target))
    if target == "REFUSEE":
        if not (motif or "").strip():
            raise InvalidStateError("Indiquez le motif du refus")
        p.refusal_reason = motif.strip()
    before = p.status
    p.status = target
    p.status_changed_at = utcnow()
    p.handled_by = actor.full_name
    publish(db, "preinscription.status_changed", "preinscription", p.id, program_id=p.program_id, actor_id=actor.id,
            payload={"from": before, "to": target})
    return p


def convert(db: Session, p: Preinscription, actor: User, session_id: str | None = None,
            today: date | None = None) -> dict:
    """Stagiaire (repris s'il existe sous la même adresse e-mail, sinon créé) et, si une session est donnée,
    inscription à cette session. Refus motivé (409, `details`) si la conversion est impossible."""
    session = training.get_session(db, session_id) if session_id else None
    enforce(PreinscriptionPolicy(db, actor, today).convert(p, session))
    learner = same_learner(db, p)
    existing = learner is not None
    if learner is None:
        person = PersonIn(first_name=p.first_name, last_name=p.last_name, email=p.email, phone=p.phone)
        learner = t.Learner(**person.model_dump(exclude_none=True), created_by=actor.full_name)
        db.add(learner)
        db.flush()
    enrollment = None
    if session is not None:
        enrollment = training.enroll(db, session, learner.id, actor, funding=p.funding_mode[:60], today=today)
    before = p.status
    p.status = "CONVERTIE"
    p.learner_id = learner.id
    p.session_id = session.id if session else None
    p.enrollment_id = enrollment.id if enrollment else None
    p.converted_at = p.status_changed_at = utcnow()
    p.handled_by = actor.full_name
    publish(db, "preinscription.converted", "preinscription", p.id, program_id=p.program_id, actor_id=actor.id,
            payload={"from": before, "learner_id": learner.id, "enrollment_id": p.enrollment_id})
    return {"stagiaire_id": learner.id, "stagiaire_existant": existing, "inscription_id": p.enrollment_id,
            "session_id": p.session_id}
