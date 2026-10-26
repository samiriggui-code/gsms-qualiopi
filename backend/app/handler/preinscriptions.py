"""Préinscriptions : formulaire public du site (`POST /api/v1/public/preinscriptions`) et traitement par
l'organisme (`/api/v1/preinscriptions`).

La route publique répond `{error, detail, message}` en cas de refus : `message` est le texte que le
formulaire du site affiche tel quel.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.access.preinscriptions import PreinscriptionPolicy, same_learner
from app.application.access.training import TrainingPolicy
from app.application.service.preinscriptions import limiter, service
from app.application.service.training.lifecycle import ENROLLABLE_STATES
from app.common.journal import set_actor
from app.common.limites import client_ip
from app.errors.errors import DomainError, InvalidStateError
from app.middleware.auth import DB, require
from app.types import training as t
from app.types.auth import User
from app.types.preinscriptions import CIVILITIES, COMPLIANCE, STATUSES, Preinscription

public_router = APIRouter(prefix="/api/v1/public", tags=["public"])
router = APIRouter(prefix="/api/v1/preinscriptions", tags=["Préinscriptions"])
Reader = Annotated[User, Depends(require("leads.read"))]
Writer = Annotated[User, Depends(require("leads.write"))]

MAX_BODY_BYTES = 16 * 1024
PUBLIC_ACTOR = "formulaire public du site"
EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE = re.compile(r"^\+?[0-9 .()-]{10,40}$")
POSTAL_CODE = re.compile(r"^\d{5}$")

# Libellés des champs du formulaire, pour des messages d'erreur lisibles.
FIELD_LABELS = {
    "civility": "civilité", "firstName": "prénom", "lastName": "nom", "usageName": "nom d'usage", "email": "e-mail",
    "phone": "téléphone", "birthDate": "date de naissance", "birthCity": "ville de naissance",
    "birthDepartment": "département de naissance", "birthCountry": "pays de naissance", "nationality": "nationalité",
    "address": "adresse", "postalCode": "code postal", "city": "ville", "formationSlug": "formation",
    "formationName": "formation", "fundingMode": "financement", "sessionChoice": "session",
    "sessionLabel": "session", "currentSituation": "situation actuelle", "experience": "expérience",
    "motivation": "motivation", "sourceContext": "origine", "compliance": "déclarations",
    **dict.fromkeys(COMPLIANCE, "déclarations"),
}


def _text(max_length: int, alias: str, required: bool = True):  # noqa: ANN202
    if required:
        return Field(alias=alias, min_length=1, max_length=max_length)
    return Field(None, alias=alias, max_length=max_length)


class PreinscriptionIn(BaseModel):
    """Corps envoyé par landing/app/preinscription.tsx (noms de champs du formulaire)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    civility: Literal["M", "MME"]
    first_name: str = _text(100, "firstName")
    last_name: str = _text(100, "lastName")
    usage_name: str | None = _text(100, "usageName", required=False)
    email: str = _text(200, "email")
    phone: str = _text(40, "phone")
    birth_date: date = Field(alias="birthDate")
    birth_city: str = _text(120, "birthCity")
    birth_department: str | None = _text(60, "birthDepartment", required=False)
    birth_country: str = _text(80, "birthCountry")
    nationality: str = _text(80, "nationality")
    address: str = _text(300, "address")
    postal_code: str = _text(10, "postalCode")
    city: str = _text(120, "city")
    formation_slug: str = _text(80, "formationSlug")
    formation_name: str | None = _text(250, "formationName", required=False)
    funding_mode: str = _text(80, "fundingMode")
    session_choice: str | None = _text(300, "sessionChoice", required=False)  # doublon de sessionLabel, non conservé
    session_label: str | None = _text(300, "sessionLabel", required=False)
    current_situation: str = _text(300, "currentSituation")
    experience: str | None = _text(4000, "experience", required=False)
    motivation: str | None = _text(4000, "motivation", required=False)
    has_valid_identity_document: StrictBool = Field(alias="hasValidIdentityDocument")
    has_no_incompatible_conviction: StrictBool = Field(alias="hasNoIncompatibleConviction")
    meets_formation_prerequisites: StrictBool = Field(alias="meetsFormationPrerequisites")
    accepts_internal_rules: StrictBool = Field(alias="acceptsInternalRules")
    acknowledges_cnaps_handled_by_school: StrictBool = Field(alias="acknowledgesCnapsHandledBySchool")
    certifies_information_accuracy: StrictBool = Field(alias="certifiesInformationAccuracy")
    source_context: str | None = _text(80, "sourceContext", required=False)

    @field_validator("usage_name", "birth_department", "formation_name", "session_choice", "session_label",
                     "experience", "motivation", "source_context", mode="before")
    @classmethod
    def _empty_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        if not EMAIL.match(value):
            raise ValueError("adresse e-mail invalide")
        return value.lower()

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        if not PHONE.match(value):
            raise ValueError("au moins 10 chiffres")
        return value

    @field_validator("postal_code")
    @classmethod
    def _postal(cls, value: str) -> str:
        if not POSTAL_CODE.match(value):
            raise ValueError("5 chiffres attendus")
        return value

    @field_validator("birth_date")
    @classmethod
    def _birth(cls, value: date) -> date:
        if value >= date.today() or value.year < 1900:
            raise ValueError("date invalide")
        return value

    @model_validator(mode="after")
    def _coherence(self) -> PreinscriptionIn:
        if self.birth_country.lower() == "france" and not self.birth_department:
            raise ValueError("birthDepartment|indiquez le département de naissance")
        if not all(getattr(self, field) for field in _COMPLIANCE_FIELDS.values()):
            raise ValueError("compliance|cochez toutes les déclarations de l'onglet « Conformité »")
        return self

    def record(self) -> dict:
        data = self.model_dump(exclude={"session_choice", *_COMPLIANCE_FIELDS.values()})
        data["compliance"] = {key: True for key in _COMPLIANCE_FIELDS}
        return data


_COMPLIANCE_FIELDS = {field.alias: name for name, field in PreinscriptionIn.model_fields.items() if field.alias in COMPLIANCE}


def _refusal(status: int, code: str, message: str, details: list | None = None) -> JSONResponse:
    content = {"error": code, "detail": message, "message": message}
    if details:
        content["details"] = details
    return JSONResponse(status_code=status, content=content)


def _validation_details(exc: ValidationError) -> list[dict]:
    out = []
    for err in exc.errors():
        field = str(err["loc"][0]) if err["loc"] else ""
        reason = str(err.get("ctx", {}).get("error", "")) or ""
        if not field and "|" in reason:  # contrôle croisé : « champ|message »
            field, reason = reason.split("|", 1)
        label = FIELD_LABELS.get(field, field or "formulaire")
        if err["type"] == "missing":
            reason = "à renseigner"
        elif err["type"] == "extra_forbidden":
            reason = "champ inconnu"
        elif err["type"] in ("string_too_short",):
            reason = "à renseigner"
        elif err["type"] == "string_too_long":
            reason = f"{err['ctx']['max_length']} caractères au plus"
        elif not reason:
            reason = "valeur invalide"
        out.append({"champ": field, "message": f"{label.capitalize()} : {reason}"})
    return out


@public_router.post("/preinscriptions", status_code=201)
async def submit(request: Request, db: DB) -> JSONResponse:
    """Demande envoyée par le formulaire du site, sans compte."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        return _refusal(413, "trop_volumineux", "Demande trop volumineuse : raccourcissez les champs libres.")
    # Lecture bornée : un envoi sans Content-Length (fragmenté) s'arrête dès que la limite est dépassée.
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            return _refusal(413, "trop_volumineux", "Demande trop volumineuse : raccourcissez les champs libres.")
        chunks.append(chunk)
    raw = b"".join(chunks)
    try:
        body = json.loads(raw or b"null")
    except ValueError:
        body = None
    if not isinstance(body, dict):
        return _refusal(400, "illisible", "Demande illisible : renvoyez le formulaire.")
    try:
        data = PreinscriptionIn.model_validate(body)
    except ValidationError as exc:
        details = _validation_details(exc)
        return _refusal(422, "invalid_state", details[0]["message"] if len(details) == 1
                        else f"{len(details)} champs à corriger : {' ; '.join(d['message'] for d in details)}", details)
    if not limiter.allow(client_ip(request)):
        return _refusal(429, "trop_de_demandes", "Trop de demandes envoyées depuis cette adresse : réessayez dans quelques minutes.")

    def save() -> None:
        set_actor(db, PUBLIC_ACTOR)
        service.submit(db, data.record())
        db.commit()

    try:
        await run_in_threadpool(save)
    except DomainError as exc:
        db.rollback()
        return _refusal(exc.status_code, exc.code, exc.message, getattr(exc, "details", None))
    return JSONResponse(status_code=201, content={"message": "Demande enregistrée : l'organisme vous recontacte rapidement."})


# ── Traitement par l'organisme ────────────────────────────────────────────────


def _iso(value: object) -> str | None:
    return value.isoformat() if value is not None else None  # type: ignore[attr-defined]


def _programs(db: Session, rows: list[Preinscription]) -> dict[str, t.Program]:
    ids = {p.program_id for p in rows if p.program_id}
    return {x.id: x for x in db.scalars(select(t.Program).where(t.Program.id.in_(ids)))} if ids else {}


def _summary(p: Preinscription, programs: dict[str, t.Program]) -> dict:
    program = programs.get(p.program_id or "")
    return {
        "id": p.id, "reference": p.reference, "statut": p.status, "statut_libelle": STATUSES[p.status],
        "civilite": p.civility, "prenom": p.first_name, "nom": p.last_name, "nom_usage": p.usage_name,
        "email": p.email, "telephone": p.phone,
        "formation": {"slug": p.formation_slug, "nom": p.formation_name or p.formation_slug,
                      "id": program.id if program else None, "code": program.code if program else None,
                      "image_url": program.image_url if program else None},
        "session_souhaitee": p.session_label, "financement": p.funding_mode, "situation": p.current_situation,
        "origine": p.source_context, "recue_le": _iso(p.created_at), "statut_change_le": _iso(p.status_changed_at),
        "traitee_par": p.handled_by,
    }


def _session_view(s: t.TrainingSession, decision: dict) -> dict:
    active = [e for e in s.enrollments if e.status != "ANNULE"]
    return {"id": s.id, "reference": s.reference, "debut": _iso(s.start_date), "fin": _iso(s.end_date),
            "lieu": s.location, "statut": s.status, "places": s.capacity, "inscrits": len(active),
            "inscription": decision}


def _detail(db: Session, p: Preinscription, user: User) -> dict:
    policy = PreinscriptionPolicy(db, user)
    training_policy = TrainingPolicy(db, user)
    known = same_learner(db, p)
    sessions = []
    if p.program_id:
        sessions = [_session_view(s, training_policy.decide(s, "enroll").to_dict()) for s in db.scalars(
            select(t.TrainingSession).where(t.TrainingSession.program_id == p.program_id,
                                            t.TrainingSession.status.in_(ENROLLABLE_STATES),
                                            t.TrainingSession.end_date >= date.today())
            .order_by(t.TrainingSession.start_date))]
    learner = db.get(t.Learner, p.learner_id) if p.learner_id else None
    session = db.get(t.TrainingSession, p.session_id) if p.session_id else None
    return {
        **_summary(p, _programs(db, [p])),
        "civilite_libelle": CIVILITIES.get(p.civility, p.civility),
        "naissance": {"date": _iso(p.birth_date), "ville": p.birth_city, "departement": p.birth_department,
                      "pays": p.birth_country},
        "nationalite": p.nationality,
        "adresse": {"adresse": p.address, "code_postal": p.postal_code, "ville": p.city},
        "experience": p.experience, "motivation": p.motivation,
        "declarations": [{"code": k, "libelle": label, "cochee": bool((p.compliance or {}).get(k))}
                         for k, label in COMPLIANCE.items()],
        "declarations_le": _iso(p.consented_at),
        "motif_refus": p.refusal_reason,
        "conversion": {
            "le": _iso(p.converted_at),
            "stagiaire": {"id": learner.id, "nom": learner.full_name, "photo_url": learner.photo_url} if learner else None,
            "session": {"id": session.id, "reference": session.reference} if session else None,
            "inscription_id": p.enrollment_id,
        } if p.status == "CONVERTIE" else None,
        "stagiaire_existant": {"id": known.id, "nom": known.full_name, "photo_url": known.photo_url} if known and p.status != "CONVERTIE" else None,
        "sessions_proposees": sessions,
        "capabilities": policy.capabilities(p),
    }


@router.get("")
def list_preinscriptions(
    db: DB, _: Reader,
    statut: Annotated[list[str] | None, Query()] = None,
    formation: str | None = None,
    recherche: str | None = Query(None, max_length=100),
    limite: int = Query(100, ge=1, le=500),
) -> dict:
    """Demandes, les plus récentes d'abord ; `statut` se répète (NOUVELLE, EN_COURS, CONVERTIE, REFUSEE)."""
    unknown = sorted(set(statut or []) - set(STATUSES))
    if unknown:
        raise InvalidStateError(f"Statut inconnu : {', '.join(unknown)} (valeurs : {', '.join(STATUSES)})")
    rows, total = service.search(db, statut, formation, recherche, limite)
    counts = dict(db.execute(select(Preinscription.status, func.count()).group_by(Preinscription.status)).all())
    programs = _programs(db, rows)
    return {"total": total, "statuts": STATUSES, "compteurs": {code: counts.get(code, 0) for code in STATUSES},
            "demandes": [_summary(p, programs) for p in rows]}


@router.get("/{preinscription_id}")
def get_preinscription(preinscription_id: str, db: DB, user: Reader) -> dict:
    return _detail(db, service.get(db, preinscription_id), user)


class StatusIn(BaseModel):
    statut: str = Field(max_length=20)
    motif: str | None = Field(None, max_length=2000)


@router.post("/{preinscription_id}/statut")
def change_status(preinscription_id: str, body: StatusIn, db: DB, user: Writer) -> dict:
    """EN_COURS (prise en charge, ou réouverture d'un refus) ou REFUSEE (motif obligatoire)."""
    p = service.change_status(db, service.get(db, preinscription_id), body.statut, user, body.motif)
    db.commit()
    return _detail(db, p, user)


class ConversionIn(BaseModel):
    session_id: str | None = None


@router.post("/{preinscription_id}/conversion")
def convert(preinscription_id: str, body: ConversionIn, db: DB, user: Writer) -> dict:
    """Stagiaire (repris par son e-mail s'il existe) et inscription à `session_id` si elle est donnée."""
    p = service.get(db, preinscription_id)
    result = service.convert(db, p, user, body.session_id)
    db.commit()
    return _detail(db, p, user) | {"resultat": result}
