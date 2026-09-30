"""API du domaine formation : sessions, cycle de vie, capacités, inscriptions."""

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.security import DB, AllSessionsReader, SessionsReader, SessionsWriter
from app.training import activity, service
from app.training import models as t
from app.training.access import own_trainer_ids, sees_all, visible_session
from app.training.policy import TrainingPolicy
from app.training.schemas import LearnerOut, ProgramOut, SessionOut, TrainerOut

router = APIRouter(prefix="/api/v1", tags=["formation"])


@router.get("/formations", response_model=list[ProgramOut])
def list_programs(db: DB, _: SessionsReader) -> list[t.Program]:
    return list(db.scalars(select(t.Program).order_by(t.Program.code)))


@router.get("/formateurs", response_model=list[TrainerOut])
def list_trainers(db: DB, _: SessionsReader) -> list[t.Trainer]:
    return list(db.scalars(select(t.Trainer).order_by(t.Trainer.last_name)))


@router.get("/stagiaires", response_model=list[LearnerOut])
def list_learners(db: DB, _: AllSessionsReader) -> list[t.Learner]:
    return list(db.scalars(select(t.Learner).order_by(t.Learner.last_name)))


class SessionView(SessionOut):
    cancel_reason: str | None = None
    program_code: str | None = None
    program_title: str | None = None
    trainer_name: str | None = None
    learners_count: int = 0


@router.get("/sessions", response_model=list[SessionView])
def list_sessions(db: DB, user: SessionsReader, statut: str | None = None,
                  du: date | None = None, au: date | None = None) -> list[t.TrainingSession]:
    q = select(t.TrainingSession).order_by(t.TrainingSession.start_date.desc())
    if not sees_all(db, user):  # formateur : ses propres sessions
        q = q.where(t.TrainingSession.trainer_id.in_(own_trainer_ids(db, user)))
    if statut:
        q = q.where(t.TrainingSession.status == statut)
    if du:
        q = q.where(t.TrainingSession.end_date >= du)
    if au:
        q = q.where(t.TrainingSession.start_date <= au)
    return list(db.scalars(q))


class SessionCreate(BaseModel):
    reference: str
    program_id: str
    start_date: date
    end_date: date
    location: str | None = None
    room: str | None = None
    trainer_id: str | None = None
    capacity: int | None = None


@router.post("/sessions", response_model=SessionView, status_code=201)
def create_session(body: SessionCreate, db: DB, user: SessionsWriter) -> t.TrainingSession:
    s = service.create_session(db, body.model_dump(), user)
    db.commit()
    return s


@router.get("/sessions/{session_id}")
def get_session(session_id: str, db: DB, user: SessionsReader) -> dict:
    """La session, ses inscriptions et ce que l'utilisateur peut en faire maintenant."""
    s = visible_session(db, user, session_id)
    return {
        "session": SessionView.model_validate(s).model_dump(mode="json"),
        "inscriptions": [{"id": e.id, "learner_id": e.learner_id, "stagiaire": f"{e.learner.first_name} {e.learner.last_name}",
                          "statut": e.status, "financement": e.funding} for e in s.enrollments],
        "capabilities": TrainingPolicy(db, user).capabilities(s),
    }


@router.get("/sessions/{session_id}/activite")
def session_activity(session_id: str, db: DB, user: SessionsReader) -> list[dict]:
    """Ce qui s'est passé sur la session (inscriptions, émargements, évaluations…), du plus récent au plus ancien."""
    return activity.session_activity(db, visible_session(db, user, session_id))


@router.get("/sessions/{session_id}/capabilities")
def session_capabilities(session_id: str, db: DB, user: SessionsReader) -> dict:
    return TrainingPolicy(db, user).capabilities(visible_session(db, user, session_id))


class SessionPatch(BaseModel):
    reference: str | None = None
    program_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    location: str | None = None
    room: str | None = None
    trainer_id: str | None = None
    capacity: int | None = None


@router.patch("/sessions/{session_id}", response_model=SessionView)
def update_session(session_id: str, body: SessionPatch, db: DB, user: SessionsWriter) -> t.TrainingSession:
    s = service.update_session(db, service.get_session(db, session_id), body.model_dump(exclude_unset=True), user)
    db.commit()
    return s


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, db: DB, user: SessionsWriter) -> None:
    service.delete_session(db, service.get_session(db, session_id), user)
    db.commit()


class TransitionIn(BaseModel):
    motif: str | None = None


@router.post("/sessions/{session_id}/transitions/{action}", response_model=SessionView)
def apply_transition(session_id: str, action: str, body: TransitionIn, db: DB, user: SessionsWriter) -> t.TrainingSession:
    """Actions : confirm, start, finish, close, cancel (motif obligatoire pour cancel)."""
    s = service.transition(db, service.get_session(db, session_id), action, user, reason=body.motif)
    db.commit()
    return s


class EnrollIn(BaseModel):
    learner_id: str
    company_id: str | None = None
    financement: str | None = None


@router.post("/sessions/{session_id}/inscriptions", status_code=201)
def enroll(session_id: str, body: EnrollIn, db: DB, user: SessionsWriter) -> dict:
    e = service.enroll(db, service.get_session(db, session_id), body.learner_id, user,
                       company_id=body.company_id, funding=body.financement)
    db.commit()
    return {"id": e.id, "statut": e.status}
