from datetime import date, datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.security import DB, Reader, ReferentialManager
from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.qualiopi.referential.importer import active_version, import_referential
from app.qualiopi.referential.models import Indicator

router = APIRouter(prefix="/api/v1/referentials", tags=["référentiel"])


class CriterionOut(BaseModel):
    number: int
    title: str

    model_config = {"from_attributes": True}


class VersionOut(BaseModel):
    id: str
    code: str
    version: str
    title: str
    effective_from: date
    source_label: str
    source_url: str | None
    upstream_ref: str | None
    imported_at: datetime
    criteria: list[CriterionOut]

    model_config = {"from_attributes": True}


class IndicatorSummary(BaseModel):
    number: int
    code: str
    criterion_number: int
    title: str
    scope: str
    ponderation: str
    new_entrant_adapted: bool
    subcontracting: str
    applicability: dict
    expected_evidence: list[str]
    controls_count: int


class IndicatorTextOut(BaseModel):
    section: str
    body: str

    model_config = {"from_attributes": True}


class ControlOut(BaseModel):
    key: str
    label: str
    check: str
    scope: str
    severity: str
    remediation: str
    guide_section: str | None
    new_entrant_mode: str

    model_config = {"from_attributes": True}


class IndicatorDetail(IndicatorSummary):
    criterion_title: str
    editorial_note: str | None
    human_review: str
    texts: list[IndicatorTextOut]
    controls: list[ControlOut]


def _summary(ind: Indicator) -> dict:
    return {
        "number": ind.number,
        "code": ind.code,
        "criterion_number": ind.criterion_number,
        "title": ind.title,
        "scope": ind.scope,
        "ponderation": ind.ponderation,
        "new_entrant_adapted": ind.new_entrant_adapted,
        "subcontracting": ind.subcontracting,
        "applicability": ind.applicability or {},
        "expected_evidence": [e["type"] for e in ind.expected_evidence or []],
        "controls_count": len(ind.controls),
    }


@router.get("/active", response_model=VersionOut)
def get_active(db: DB, _: Reader):
    return active_version(db)


@router.get("/active/indicators", response_model=list[IndicatorSummary])
def list_indicators(db: DB, _: Reader):
    return [_summary(ind) for ind in active_version(db).indicators]


@router.get("/active/indicators/{number}", response_model=IndicatorDetail)
def get_indicator(number: int, db: DB, _: Reader):
    version = active_version(db)
    ind = db.scalar(select(Indicator).where(Indicator.version_id == version.id, Indicator.number == number))
    if ind is None:
        raise NotFoundError(f"Indicateur {number} introuvable dans {version.code} {version.version}")
    criterion = next((c for c in version.criteria if c.number == ind.criterion_number), None)
    return {
        **_summary(ind),
        "criterion_title": criterion.title if criterion else "",
        "editorial_note": ind.editorial_note,
        "human_review": ind.human_review,
        "texts": ind.texts,
        "controls": ind.controls,
    }


@router.post("/import", response_model=VersionOut)
def import_default(db: DB, user: ReferentialManager):
    """(Ré)importe le référentiel Qualiopi V9 livré avec l'application. Idempotent."""
    version = import_referential(db, get_settings().referentials_dir / "qualiopi" / "v9", actor_id=user.id)
    db.commit()
    return version
