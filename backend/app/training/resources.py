"""Ressources CRUD du domaine formation (tables simples), déclarées avec app.core.crud."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.crud import crud_router, to_dict
from app.core.errors import InvalidStateError, NotFoundError
from app.training import models as t
from app.training.schemas import (
    CompanyIn,
    ComplaintIn,
    PartnerIn,
    PersonIn,
    ProgramIn,
    QualificationIn,
    StaffDevelopmentIn,
    SubcontractorIn,
    SurveyIn,
    TrainerIn,
    WatchIn,
)

# --- Schémas de création complétés (rattachement au parent) ---


class QualificationCreate(QualificationIn):
    trainer_id: str


class SurveyCreate(SurveyIn):
    session_id: str


# --- Contrôles de valeurs ---


def _one_of(field: str, allowed: tuple[str, ...], label: str):
    def check(_: Session, data: dict) -> None:
        value = data.get(field)
        if value is not None and value not in allowed:
            raise InvalidStateError(f"{label} inconnu, valeurs possibles : {', '.join(allowed)}")

    return check


def _all(*checks):
    def run(db: Session, data: dict) -> None:
        for check in checks:
            check(db, data)

    return run


def _exists(field: str, model: type, label: str):
    def check(db: Session, data: dict) -> None:
        value = data.get(field)
        if value and db.get(model, value) is None:
            raise NotFoundError(f"{label} introuvable")

    return check


# --- Sérialiseurs (colonnes calculées pour les listes) ---


def _names(db: Session, model: type, ids: set) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    if model in (t.Learner, t.Trainer):
        rows = db.execute(select(model.id, model.first_name, model.last_name).where(model.id.in_(ids))).all()
        return {r[0]: f"{r[1]} {r[2]}" for r in rows}
    return dict(db.execute(select(model.id, model.name).where(model.id.in_(ids))).all())


def _counts(db: Session, column, ids: list) -> dict:
    if not ids:
        return {}
    return dict(db.execute(select(column, func.count()).where(column.in_(ids)).group_by(column)).all())


def serialize_learners(db: Session, rows: list) -> list[dict]:
    companies = _names(db, t.Company, {r.company_id for r in rows})
    enrollments = _counts(db, t.Enrollment.learner_id, [r.id for r in rows])
    return [
        {**to_dict(r), "full_name": r.full_name, "company_name": companies.get(r.company_id),
         "enrollments": enrollments.get(r.id, 0)}
        for r in rows
    ]


def serialize_companies(db: Session, rows: list) -> list[dict]:
    learners = _counts(db, t.Learner.company_id, [r.id for r in rows])
    enrollments = _counts(db, t.Enrollment.company_id, [r.id for r in rows])
    return [{**to_dict(r), "learners": learners.get(r.id, 0), "enrollments": enrollments.get(r.id, 0)} for r in rows]


def serialize_trainers(db: Session, rows: list) -> list[dict]:
    sessions = _counts(db, t.TrainingSession.trainer_id, [r.id for r in rows])
    quals = _counts(db, t.TrainerQualification.trainer_id, [r.id for r in rows])
    return [
        {**to_dict(r), "full_name": f"{r.first_name} {r.last_name}", "sessions": sessions.get(r.id, 0),
         "qualifications": quals.get(r.id, 0)}
        for r in rows
    ]


def serialize_programs(db: Session, rows: list) -> list[dict]:
    sessions = _counts(db, t.TrainingSession.program_id, [r.id for r in rows])
    return [{**to_dict(r), "sessions": sessions.get(r.id, 0)} for r in rows]


def _with_trainer(db: Session, rows: list) -> list[dict]:
    trainers = _names(db, t.Trainer, {r.trainer_id for r in rows})
    return [{**to_dict(r), "trainer_name": trainers.get(r.trainer_id)} for r in rows]


def _with_session(db: Session, rows: list) -> list[dict]:
    ids = {r.session_id for r in rows if r.session_id}
    refs = dict(db.execute(select(t.TrainingSession.id, t.TrainingSession.reference).where(t.TrainingSession.id.in_(ids))).all()) if ids else {}
    return [{**to_dict(r), "session_reference": refs.get(r.session_id)} for r in rows]


def serialize_surveys(db: Session, rows: list) -> list[dict]:
    base = _with_session(db, rows)
    learner_by_enrollment = {}
    enrollment_ids = {r.enrollment_id for r in rows if r.enrollment_id}
    if enrollment_ids:
        pairs = db.execute(select(t.Enrollment.id, t.Enrollment.learner_id).where(t.Enrollment.id.in_(enrollment_ids))).all()
        names = _names(db, t.Learner, {p[1] for p in pairs})
        learner_by_enrollment = {p[0]: names.get(p[1]) for p in pairs}
    return [{**b, "learner_name": learner_by_enrollment.get(r.enrollment_id)} for b, r in zip(base, rows)]


# --- Déclaration des ressources ---

ROUTERS = [
    crud_router(
        model=t.Program, path="programs", schema_in=ProgramIn, label="Programme",
        write_permission="write_training", order_by=[t.Program.title],
        created_event="program.created", updated_event="program.updated", serialize=serialize_programs,
    ),
    crud_router(
        model=t.Company, path="companies", schema_in=CompanyIn, label="Entreprise",
        write_permission="write_training", order_by=[t.Company.name], serialize=serialize_companies,
    ),
    crud_router(
        model=t.Learner, path="learners", schema_in=PersonIn, label="Apprenant",
        write_permission="write_training", order_by=[t.Learner.last_name, t.Learner.first_name],
        serialize=serialize_learners, validate=_exists("company_id", t.Company, "Entreprise"),
    ),
    crud_router(
        model=t.Trainer, path="trainers", schema_in=TrainerIn, label="Formateur",
        write_permission="write_training", order_by=[t.Trainer.last_name, t.Trainer.first_name],
        updated_event="trainer.updated", serialize=serialize_trainers,
    ),
    crud_router(
        model=t.TrainerQualification, path="trainer-qualifications", schema_in=QualificationCreate,
        label="Qualification", write_permission="write_training",
        order_by=[t.TrainerQualification.valid_until], updated_event="trainer.qualification_updated",
        event_entity="trainer_qualification", serialize=_with_trainer,
        validate=_exists("trainer_id", t.Trainer, "Formateur"),
    ),
    crud_router(
        model=t.StaffDevelopmentAction, path="staff-development", schema_in=StaffDevelopmentIn,
        label="Action de développement", write_permission="write_quality",
        order_by=[t.StaffDevelopmentAction.planned_on.desc()], updated_event="staff_development.updated",
        serialize=_with_trainer, validate=_exists("trainer_id", t.Trainer, "Formateur"),
    ),
    crud_router(
        model=t.Subcontractor, path="subcontractors", schema_in=SubcontractorIn, label="Sous-traitant",
        write_permission="write_quality", order_by=[t.Subcontractor.name], updated_event="subcontractor.updated",
    ),
    crud_router(
        model=t.PartnerNetwork, path="partners", schema_in=PartnerIn, label="Partenaire",
        write_permission="write_quality", order_by=[t.PartnerNetwork.name], updated_event="partner.updated",
        validate=_one_of("kind", ("HANDICAP", "SOCIO_ECONOMIQUE"), "Type de partenaire"),
    ),
    crud_router(
        model=t.WatchItem, path="watch-items", schema_in=WatchIn, label="Veille",
        write_permission="write_quality", order_by=[t.WatchItem.noted_on.desc()], updated_event="watch.updated",
        validate=_one_of("domain", ("LEGALE", "METIERS", "PEDAGOGIQUE"), "Domaine de veille"),
    ),
    crud_router(
        model=t.Complaint, path="complaints", schema_in=ComplaintIn, label="Réclamation",
        write_permission="write_quality", order_by=[t.Complaint.received_on.desc()],
        created_event="complaint.created", updated_event="complaint.updated", serialize=_with_session,
        validate=_all(
            _one_of("kind", ("RECLAMATION", "DIFFICULTE", "ALEA"), "Type"),
            _one_of("stakeholder", ("APPRENANT", "ENTREPRISE", "FINANCEUR", "FORMATEUR", "AUTRE"), "Partie prenante"),
            _exists("session_id", t.TrainingSession, "Session"),
        ),
    ),
    crud_router(
        model=t.SatisfactionSurvey, path="surveys", schema_in=SurveyCreate, label="Enquête",
        write_permission="write_quality", order_by=[t.SatisfactionSurvey.sent_on.desc()],
        updated_event="survey.completed", serialize=serialize_surveys,
        validate=_all(
            _one_of("audience", ("APPRENANT_CHAUD", "APPRENANT_FROID", "ENTREPRISE", "FINANCEUR", "FORMATEUR"), "Public"),
            _exists("session_id", t.TrainingSession, "Session"),
        ),
    ),
]
