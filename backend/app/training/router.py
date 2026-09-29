"""Routeur du domaine formation : sessions (liste, fiche, création) et référentiels utiles aux formulaires."""

from datetime import date, datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.auth.security import DB, Reader, TrainingWriter
from app.core.errors import ConflictError, InvalidStateError, NotFoundError
from app.events.publish import publish
from app.training.models import (
    SESSION_STATUSES,
    AttendanceSlot,
    Company,
    Document,
    Enrollment,
    Organization,
    Program,
    Trainer,
    TrainingSession,
)
from app.training.schemas import OrganizationIn, OrganizationOut, SessionIn

router = APIRouter(prefix="/api/v1", tags=["formation"])


# --- Listes de référence (sélecteurs des formulaires) ---


class ProgramRef(BaseModel):
    id: str
    code: str
    title: str
    is_certifying: bool
    duration_hours: float | None


class TrainerRef(BaseModel):
    id: str
    full_name: str
    is_external: bool


# --- Sessions ---


class SessionRow(BaseModel):
    id: str
    reference: str
    program: ProgramRef
    trainer: TrainerRef | None
    start_date: date
    end_date: date
    location: str | None
    room: str | None
    capacity: int | None
    status: str
    enrolled: int
    slots_total: int
    slots_signed: int
    subcontracted: bool


class EnrollmentRow(BaseModel):
    id: str
    learner_id: str
    learner_name: str
    learner_email: str | None
    company_name: str | None
    status: str
    funding: str | None
    needs_analysis_done: bool
    adaptation_required: bool
    positioning_done: bool
    convocation_sent_on: date | None
    agreement_signed_on: date | None
    attendance_present: int
    attendance_total: int
    assessments: int
    certificate_issued_on: date | None


class SlotRow(BaseModel):
    id: str
    day: date
    period: str
    trainer_signed_at: datetime | None
    present: int
    signed: int


class DocumentRow(BaseModel):
    id: str
    kind: str
    title: str
    version: int
    status: str
    created_at: datetime
    signed_at: datetime | None


class SessionDetail(SessionRow):
    enrollments: list[EnrollmentRow]
    slots: list[SlotRow]
    documents: list[DocumentRow]


def _program_ref(p: Program) -> ProgramRef:
    return ProgramRef(
        id=p.id,
        code=p.code,
        title=p.title,
        is_certifying=p.is_certifying,
        duration_hours=float(p.duration_hours) if p.duration_hours is not None else None,
    )


def _trainer_ref(t: Trainer | None) -> TrainerRef | None:
    if t is None:
        return None
    return TrainerRef(id=t.id, full_name=f"{t.first_name} {t.last_name}", is_external=t.is_external)


def _row(s: TrainingSession, enrolled: int, slots_total: int, slots_signed: int) -> dict:
    return {
        "id": s.id,
        "reference": s.reference,
        "program": _program_ref(s.program),
        "trainer": _trainer_ref(s.trainer),
        "start_date": s.start_date,
        "end_date": s.end_date,
        "location": s.location,
        "room": s.room,
        "capacity": s.capacity,
        "status": s.status,
        "enrolled": enrolled,
        "slots_total": slots_total,
        "slots_signed": slots_signed,
        "subcontracted": s.subcontractor_id is not None,
    }


ACTIVE_ENROLLMENT = ("INSCRIT", "CONFIRME", "TERMINE", "ABANDON")


@router.get("/sessions", response_model=list[SessionRow])
def list_sessions(db: DB, _: Reader):
    enrolled = dict(
        db.execute(
            select(Enrollment.session_id, func.count())
            .where(Enrollment.status.in_(ACTIVE_ENROLLMENT))
            .group_by(Enrollment.session_id)
        ).all()
    )
    slots_total = dict(
        db.execute(select(AttendanceSlot.session_id, func.count()).group_by(AttendanceSlot.session_id)).all()
    )
    slots_signed = dict(
        db.execute(
            select(AttendanceSlot.session_id, func.count())
            .where(AttendanceSlot.trainer_signed_at.is_not(None))
            .group_by(AttendanceSlot.session_id)
        ).all()
    )
    sessions = db.scalars(
        select(TrainingSession)
        .options(selectinload(TrainingSession.program), selectinload(TrainingSession.trainer))
        .order_by(TrainingSession.start_date.desc())
    ).all()
    return [_row(s, enrolled.get(s.id, 0), slots_total.get(s.id, 0), slots_signed.get(s.id, 0)) for s in sessions]


def _load_session(db, session_id: str) -> TrainingSession:
    s = db.scalar(
        select(TrainingSession)
        .where(TrainingSession.id == session_id)
        .options(
            selectinload(TrainingSession.program),
            selectinload(TrainingSession.trainer),
            selectinload(TrainingSession.attendance_slots).selectinload(AttendanceSlot.signatures),
            selectinload(TrainingSession.enrollments).selectinload(Enrollment.learner),
            selectinload(TrainingSession.enrollments).selectinload(Enrollment.needs_analysis),
            selectinload(TrainingSession.enrollments).selectinload(Enrollment.positioning),
            selectinload(TrainingSession.enrollments).selectinload(Enrollment.convocation),
            selectinload(TrainingSession.enrollments).selectinload(Enrollment.agreement),
            selectinload(TrainingSession.enrollments).selectinload(Enrollment.assessments),
            selectinload(TrainingSession.enrollments).selectinload(Enrollment.certificate),
            selectinload(TrainingSession.enrollments).selectinload(Enrollment.signatures),
        )
    )
    if s is None:
        raise NotFoundError("Session introuvable")
    return s


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: str, db: DB, _: Reader):
    s = _load_session(db, session_id)
    company_names = dict(db.execute(select(Company.id, Company.name)).all())
    slots = sorted(s.attendance_slots, key=lambda sl: (sl.day, sl.period != "MATIN"))
    counted = [e for e in s.enrollments if e.status in ACTIVE_ENROLLMENT]

    enrollments = []
    for e in sorted(s.enrollments, key=lambda e: (e.learner.last_name, e.learner.first_name)):
        company_id = e.company_id or e.learner.company_id
        enrollments.append(
            EnrollmentRow(
                id=e.id,
                learner_id=e.learner_id,
                learner_name=f"{e.learner.first_name} {e.learner.last_name}",
                learner_email=e.learner.email,
                company_name=company_names.get(company_id) if company_id else None,
                status=e.status,
                funding=e.funding,
                needs_analysis_done=bool(e.needs_analysis and e.needs_analysis.completed_on),
                adaptation_required=bool(e.needs_analysis and e.needs_analysis.adaptation_required),
                positioning_done=bool(e.positioning and e.positioning.completed_on),
                convocation_sent_on=e.convocation.sent_on if e.convocation else None,
                agreement_signed_on=e.agreement.signed_on if e.agreement else None,
                attendance_present=sum(1 for sig in e.signatures if sig.present and sig.signed_at),
                attendance_total=len(slots),
                assessments=len(e.assessments),
                certificate_issued_on=e.certificate.issued_on if e.certificate else None,
            )
        )

    documents = db.scalars(
        select(Document).where(Document.session_id == s.id).order_by(Document.created_at.desc())
    ).all()

    return {
        **_row(s, len(counted), len(slots), sum(1 for sl in slots if sl.trainer_signed_at)),
        "enrollments": enrollments,
        "slots": [
            SlotRow(
                id=sl.id,
                day=sl.day,
                period=sl.period,
                trainer_signed_at=sl.trainer_signed_at,
                present=sum(1 for sig in sl.signatures if sig.present),
                signed=sum(1 for sig in sl.signatures if sig.signed_at),
            )
            for sl in slots
        ],
        "documents": [
            DocumentRow(
                id=d.id,
                kind=d.kind,
                title=d.title,
                version=d.version,
                status=d.status,
                created_at=d.created_at,
                signed_at=d.signed_at,
            )
            for d in documents
        ],
    }


@router.post("/sessions", response_model=SessionRow, status_code=201)
def create_session(body: SessionIn, db: DB, user: TrainingWriter):
    missing = [f for f in ("reference", "program_id", "start_date", "end_date") if getattr(body, f) is None]
    if missing:
        raise InvalidStateError(f"Champs obligatoires manquants : {', '.join(missing)}")
    if body.end_date < body.start_date:
        raise InvalidStateError("La date de fin précède la date de début")
    if body.status and body.status not in SESSION_STATUSES:
        raise InvalidStateError(f"Statut inconnu, valeurs possibles : {', '.join(SESSION_STATUSES)}")
    if db.scalar(select(TrainingSession.id).where(TrainingSession.reference == body.reference)):
        raise ConflictError(f"La référence {body.reference} existe déjà")
    if db.get(Program, body.program_id) is None:
        raise NotFoundError("Programme introuvable")
    if body.trainer_id and db.get(Trainer, body.trainer_id) is None:
        raise NotFoundError("Formateur introuvable")

    s = TrainingSession(**body.model_dump(exclude_none=True), created_by=user.full_name)
    db.add(s)
    db.flush()
    publish(db, "session.created", "session", s.id, session_id=s.id, program_id=s.program_id, actor_id=user.id)
    db.commit()
    s = _load_session(db, s.id)
    return _row(s, 0, 0, 0)


# --- Organisme (fiche unique) ---


@router.get("/organization", response_model=OrganizationOut)
def get_organization(db: DB, _: Reader):
    org = db.scalar(select(Organization).limit(1))
    if org is None:
        raise NotFoundError("Organisme non renseigné")
    return org


@router.patch("/organization", response_model=OrganizationOut)
def update_organization(body: OrganizationIn, db: DB, user: TrainingWriter):
    org = db.scalar(select(Organization).limit(1))
    if org is None:
        if not body.name:
            raise InvalidStateError("Le nom de l'organisme est obligatoire")
        org = Organization(name=body.name, created_by=user.full_name)
        db.add(org)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(org, key, value)
    db.flush()
    publish(db, "organization.updated", "organization", org.id, actor_id=user.id)
    db.commit()
    return org
