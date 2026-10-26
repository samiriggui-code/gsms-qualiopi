"""API RH : personnel, contrats, absences, titres des formateurs, liaison des comptes."""

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.common.media import MediaPath
from app.errors.errors import ConflictError, InvalidStateError, NotFoundError
from app.event.publish import publish
from app.middleware.auth import DB, StaffReader, StaffWriter, TrainersWriter, UserManager
from app.types import training as t
from app.types.auth import User
from app.types.hr import ABSENCE_KINDS, CONTRACT_KINDS, STAFF_KINDS, STAFF_SERVICES, WORK_TIMES, StaffAbsence, StaffContract, StaffMember

router = APIRouter(prefix="/api/v1", tags=["rh"])


def _staff(db, staff_id: str) -> StaffMember:  # noqa: ANN001
    m = db.get(StaffMember, staff_id)
    if m is None:
        raise NotFoundError("Membre du personnel introuvable")
    return m


def _check_links(db, user_id: str | None, trainer_id: str | None, ignore: str | None = None) -> None:  # noqa: ANN001
    if user_id and db.get(User, user_id) is None:
        raise NotFoundError("Compte introuvable")
    if trainer_id:
        trainer = db.get(t.Trainer, trainer_id)
        if trainer is None:
            raise NotFoundError("Formateur introuvable")
        if user_id and trainer.user_id and trainer.user_id != user_id:
            raise InvalidStateError("Ce formateur est déjà relié à un autre compte")
    for col, val in ((StaffMember.user_id, user_id), (StaffMember.trainer_id, trainer_id)):
        if val and db.scalar(select(StaffMember).where(col == val, StaffMember.id != (ignore or ""))):
            raise ConflictError("Déjà relié à un autre membre du personnel")


def _check_kind(value: str | None, allowed: tuple[str, ...], what: str) -> None:
    if value is not None and value not in allowed:
        raise HTTPException(422, f"{what} : valeurs possibles {', '.join(allowed)}")


def _view(m: StaffMember, today: date) -> dict:
    current = [c for c in m.contracts if c.covers(today, today)]
    return {
        "id": m.id, "nom": m.full_name, "prenom": m.first_name, "nom_de_famille": m.last_name, "email": m.email,
        "telephone": m.phone, "photo_url": m.photo_url,
        "service": m.service, "service_libelle": STAFF_SERVICES.get(m.service or ""),
        "site": {"visible": m.site_visible, "fonction": m.site_title, "bio": m.site_bio}, "statut": m.kind, "fonction": m.job_title, "actif": m.active,
        "compte_id": m.user_id, "formateur_id": m.trainer_id,
        "contrat_en_cours": {"type": current[0].kind, "fin": current[0].end_date.isoformat() if current[0].end_date else None}
        if current else None,
        "contrats": [{"id": c.id, "type": c.kind, "debut": c.start_date.isoformat(),
                      "fin": c.end_date.isoformat() if c.end_date else None, "temps": c.work_time} for c in m.contracts],
        "absences": [{"id": a.id, "debut": a.start_date.isoformat(), "fin": a.end_date.isoformat(), "nature": a.kind}
                     for a in m.absences],
    }


# ── Personnel ────────────────────────────────────────────────────────────────────


class StaffIn(BaseModel):
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = Field(default=None, max_length=40)
    kind: str = "SALARIE"
    job_title: str | None = None
    user_id: str | None = None
    trainer_id: str | None = None
    photo_url: MediaPath = None
    service: str | None = None  # STAFF_SERVICES
    site_visible: bool = False  # présenté sur le site de l'organisme, dans le volet de son service
    site_title: str | None = Field(default=None, max_length=200)
    site_bio: str | None = Field(default=None, max_length=1000)


@router.get("/rh/personnel")
def list_staff(db: DB, _: StaffReader, actifs: bool = True, service: str | None = None) -> list[dict]:
    q = select(StaffMember).order_by(StaffMember.last_name)
    if actifs:
        q = q.where(StaffMember.active.is_(True))
    if service:
        _check_kind(service, tuple(STAFF_SERVICES), "Service")
        q = q.where(StaffMember.service == service)
    return [_view(m, date.today()) for m in db.scalars(q)]


@router.get("/rh/personnel/services")
def staff_services(db: DB, _: StaffReader, actifs: bool = True) -> list[dict]:
    """Effectif par service (volets de la page Personnel), puis le personnel sans service."""
    q = select(StaffMember.service, func.count()).group_by(StaffMember.service)
    if actifs:
        q = q.where(StaffMember.active.is_(True))
    counts = dict(db.execute(q).all())
    return [*({"code": k, "libelle": v, "effectif": counts.get(k, 0)} for k, v in STAFF_SERVICES.items()),
            {"code": None, "libelle": "Sans service", "effectif": counts.get(None, 0)}]


@router.post("/rh/personnel", status_code=201)
def create_staff(body: StaffIn, db: DB, _: StaffWriter) -> dict:
    _check_kind(body.kind, STAFF_KINDS, "Statut")
    _check_kind(body.service, tuple(STAFF_SERVICES), "Service")
    _check_links(db, body.user_id, body.trainer_id)
    m = StaffMember(**body.model_dump())
    db.add(m)
    db.commit()
    return _view(m, date.today())


@router.get("/rh/personnel/{staff_id}")
def get_staff(staff_id: str, db: DB, _: StaffReader) -> dict:
    m = _staff(db, staff_id)
    view = _view(m, date.today())
    if m.trainer_id:
        trainer = db.get(t.Trainer, m.trainer_id)
        view["titres"] = [{"type": q.kind, "libelle": q.label, "numero": q.number,
                           "fin": q.valid_until.isoformat() if q.valid_until else None} for q in trainer.qualifications]
    return view


class StaffPatch(BaseModel):
    """Modification de la fiche : seuls les champs envoyés changent."""

    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    email: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=40)
    kind: str | None = None
    job_title: str | None = Field(None, max_length=150)
    service: str | None = None
    active: bool | None = None
    user_id: str | None = None
    trainer_id: str | None = None
    photo_url: MediaPath = None
    site_visible: bool | None = None
    site_title: str | None = Field(None, max_length=200)
    site_bio: str | None = Field(None, max_length=1000)


@router.patch("/rh/personnel/{staff_id}")
def update_staff(staff_id: str, body: StaffPatch, db: DB, _: StaffWriter) -> dict:
    m = _staff(db, staff_id)
    changes = body.model_dump(exclude_unset=True)
    for field, label in (("first_name", "Le prénom"), ("last_name", "Le nom"), ("kind", "Le statut"), ("active", "L'état")):
        if field in changes and changes[field] is None:
            raise InvalidStateError(f"{label} ne peut pas être vidé")
    _check_kind(changes.get("kind"), STAFF_KINDS, "Statut")
    _check_kind(changes.get("service"), tuple(STAFF_SERVICES), "Service")
    if "user_id" in changes or "trainer_id" in changes:
        _check_links(db, changes.get("user_id", m.user_id), changes.get("trainer_id", m.trainer_id), ignore=m.id)
    visible = changes.get("site_visible", m.site_visible)
    if visible and not changes.get("site_title", m.site_title):
        raise InvalidStateError("Présentation sur le site : indiquez la fonction affichée (site_title)")
    for key, value in changes.items():
        setattr(m, key, value)
    db.commit()
    return _view(m, date.today())


class ContractIn(BaseModel):
    kind: str
    start_date: date
    end_date: date | None = None
    work_time: str | None = None
    note: str | None = None


@router.post("/rh/personnel/{staff_id}/contrats", status_code=201)
def add_contract(staff_id: str, body: ContractIn, db: DB, _: StaffWriter) -> dict:
    _check_kind(body.kind, CONTRACT_KINDS, "Type de contrat")
    _check_kind(body.work_time, WORK_TIMES, "Temps de travail")
    if body.end_date and body.end_date < body.start_date:
        raise InvalidStateError("La fin du contrat précède son début")
    m = _staff(db, staff_id)
    m.contracts.append(StaffContract(**body.model_dump()))
    db.commit()
    return _view(m, date.today())


class AbsenceIn(BaseModel):
    start_date: date
    end_date: date
    kind: str
    note: str | None = None


@router.post("/rh/personnel/{staff_id}/absences", status_code=201)
def add_absence(staff_id: str, body: AbsenceIn, db: DB, _: StaffWriter) -> dict:
    _check_kind(body.kind, ABSENCE_KINDS, "Nature")
    if body.end_date < body.start_date:
        raise InvalidStateError("La fin de l'absence précède son début")
    m = _staff(db, staff_id)
    m.absences.append(StaffAbsence(**body.model_dump()))
    db.commit()
    return _view(m, date.today())


@router.get("/rh/echeances")
def expiring_titles(db: DB, _: StaffReader, jours: int = 90) -> list[dict]:
    """Titres des formateurs expirés ou qui expirent dans les `jours` prochains jours (carte CNAPS, SSIAP 3…)."""
    horizon = date.today() + timedelta(days=jours)
    rows = db.execute(
        select(t.TrainerQualification, t.Trainer)
        .join(t.Trainer, t.Trainer.id == t.TrainerQualification.trainer_id)
        .where(t.TrainerQualification.valid_until.is_not(None), t.TrainerQualification.valid_until <= horizon)
        .order_by(t.TrainerQualification.valid_until)
    )
    today = date.today()
    return [{"titre_id": q.id, "formateur": tr.full_name, "formateur_id": tr.id, "formateur_photo_url": tr.photo_url, "type": q.kind, "libelle": q.label,
             "fin": q.valid_until.isoformat(), "etat": "EXPIRE" if q.valid_until < today else "A_RENOUVELER"}
            for q, tr in rows]


# ── Formateurs : titres et compte ────────────────────────────────────────────────


class QualificationIn(BaseModel):
    kind: str = "AUTRE"
    label: str
    number: str | None = None
    obtained_on: date | None = None
    valid_until: date | None = None


@router.post("/formateurs/{trainer_id}/titres", status_code=201)
def add_qualification(trainer_id: str, body: QualificationIn, db: DB, _: TrainersWriter) -> dict:
    _check_kind(body.kind, tuple(t.QUALIFICATION_KINDS), "Type de titre")
    trainer = db.get(t.Trainer, trainer_id)
    if trainer is None:
        raise NotFoundError("Formateur introuvable")
    q = t.TrainerQualification(trainer_id=trainer.id, **body.model_dump())
    db.add(q)
    db.flush()
    publish(db, "trainer.qualification_updated", "trainer_qualification", q.id, payload={"trainer_ids": [trainer.id]})
    db.commit()
    return {"id": q.id, "type": q.kind, "fin": q.valid_until.isoformat() if q.valid_until else None}


class AccountIn(BaseModel):
    user_id: str | None  # None = délier


@router.put("/formateurs/{trainer_id}/compte")
def link_account(trainer_id: str, body: AccountIn, db: DB, _: UserManager) -> dict:
    """Relie un compte à une fiche formateur : ce compte voit alors les sessions de ce formateur."""
    trainer = db.get(t.Trainer, trainer_id)
    if trainer is None:
        raise NotFoundError("Formateur introuvable")
    if body.user_id:
        if db.get(User, body.user_id) is None:
            raise NotFoundError("Compte introuvable")
        other = db.scalar(select(t.Trainer).where(t.Trainer.user_id == body.user_id, t.Trainer.id != trainer.id))
        if other is not None:
            raise ConflictError(f"Ce compte est déjà relié au formateur {other.full_name}")
    trainer.user_id = body.user_id
    db.commit()
    return {"formateur_id": trainer.id, "compte_id": trainer.user_id}
