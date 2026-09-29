"""API du financement."""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.security import DB, FundingReader, FundingWriter
from app.core.errors import NotFoundError
from app.funding import service
from app.funding.models import FundingCase
from app.funding.schemes import rule_at, schemes
from app.platform.features import is_enabled

router = APIRouter(prefix="/api/v1", tags=["financement"])


@router.get("/financement/dispositifs")
def list_schemes(db: DB, _: FundingReader) -> list[dict]:
    """Dispositifs activés pour l'organisme, avec leurs étapes."""
    return [{"code": s.code, "libelle": s.label, "financeur": s.provider, "payeur": s.payer, "prorata": s.prorata,
             "etats": s.states, "actions": {k: a.label for k, a in s.actions.items()}}
            for s in schemes().values() if is_enabled(db, s.feature)]


@router.get("/financement/regles/{key}")
def get_rule(key: str, _: FundingReader, le: date | None = None) -> dict:
    """Valeur d'une règle datée (ex. participation CPF) à une date, avec sa source."""
    return rule_at(key, le or date.today())


class CaseIn(BaseModel):
    cout: Decimal | None = None  # défaut : prix de la formation


@router.post("/inscriptions/{enrollment_id}/financement", status_code=201)
def open_case(enrollment_id: str, body: CaseIn, db: DB, user: FundingWriter) -> dict:
    case = service.open_case(db, service.get_enrollment(db, enrollment_id), body.cout, user)
    db.commit()
    return service.case_view(db, case, user)


@router.get("/inscriptions/{enrollment_id}/financement")
def get_case(enrollment_id: str, db: DB, user: FundingReader) -> dict:
    case = db.scalar(select(FundingCase).where(FundingCase.enrollment_id == enrollment_id))
    if case is None:
        raise NotFoundError("Pas de dossier de financement pour cette inscription")
    return service.case_view(db, case, user)


class SourceIn(BaseModel):
    dispositif: str
    financeur: str | None = None
    montant_demande: Decimal | None = None
    signataire: str | None = None
    destinataire_facture: str | None = None
    payeur: str | None = None


@router.post("/financement/dossiers/{case_id}/sources", status_code=201)
def add_source(case_id: str, body: SourceIn, db: DB, user: FundingWriter) -> dict:
    case = db.get(FundingCase, case_id)
    if case is None:
        raise NotFoundError("Dossier de financement introuvable")
    src = service.add_source(db, case, body.dispositif, user, provider_name=body.financeur,
                             amount_requested=body.montant_demande, signatory=body.signataire,
                             invoice_recipient=body.destinataire_facture, payer_name=body.payeur)
    db.commit()
    return service.source_view(db, src, user)


class ActionIn(BaseModel):
    external_ref: str | None = None
    amount_granted: Decimal | None = None
    amount_paid: Decimal | None = None
    invoice_ref: str | None = None
    motif: str | None = None
    note: str | None = None


@router.post("/financement/sources/{source_id}/actions/{action}")
def apply_action(source_id: str, action: str, body: ActionIn, db: DB, user: FundingWriter) -> dict:
    src = service.apply(db, service.get_source(db, source_id), action, body.model_dump(exclude_none=True), user)
    db.commit()
    return service.source_view(db, src, user)


@router.get("/financement/echeances")
def funding_deadlines(db: DB, _: FundingReader, jours: int = 15) -> list[dict]:
    return service.deadlines(db, date.today(), jours)
