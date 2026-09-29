"""API du moteur Qualiopi (lecture de l'état de préparation, import du référentiel, validation humaine)."""

from datetime import date, timedelta
from pathlib import Path

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import or_, select

from app.auth.security import DB, EvidenceValidator, QualityWriter, Reader, ReferentialManager
from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.qualiopi.engine import refresh_all
from app.qualiopi.evaluation.report import session_dossier
from app.qualiopi.evaluation.service import indicator_readiness
from app.qualiopi.evidence.models import Evidence, EvidenceIndicatorLink
from app.qualiopi.evidence.service import validate
from app.qualiopi.referential.importer import active_version, import_referential
from app.qualiopi.review.models import IndicatorReview
from app.qualiopi.review.service import record_review
from app.qualiopi.schedule.models import MilestoneStatus
from app.qualiopi.schedule.service import milestone_view
from app.training import models as t

router = APIRouter(prefix="/api/v1", tags=["qualiopi"])


class ImportIn(BaseModel):
    folder: str = "qualiopi/v9"  # relatif à REFERENTIALS_DIR
    activate: bool = True


def _referential_folder(relative: str) -> Path:
    root = get_settings().referentials_dir.resolve()
    folder = (root / relative).resolve()
    if not folder.is_relative_to(root) or not folder.is_dir():
        raise NotFoundError(f"Référentiel introuvable : {relative}")
    return folder


def _version_view(v) -> dict:  # noqa: ANN001
    return {
        "id": v.id,
        "code": v.code,
        "version": v.version,
        "title": v.title,
        "effective_from": v.effective_from.isoformat(),
        "source_label": v.source_label,
        "source_sha256": v.source_sha256,
        "normative_sha256": v.normative_sha256,
        "upstream_ref": v.upstream_ref,
        "is_active": v.is_active,
        "indicators": len(v.indicators),
    }


@router.post("/referentials/import")
def import_version(body: ImportIn, db: DB, user: ReferentialManager) -> dict:
    v = import_referential(db, _referential_folder(body.folder), activate=body.activate, actor_id=user.id)
    db.commit()
    return _version_view(v)


@router.get("/referentials/active")
def get_active(db: DB, _: Reader) -> dict:
    return _version_view(active_version(db))


@router.post("/qualiopi/evaluate")
def evaluate_all(db: DB, user: QualityWriter) -> dict:
    """Réconciliation des preuves + réévaluation complète (bouton « tout réévaluer »)."""
    result = refresh_all(db, trigger=f"manuel:{user.email}")
    db.commit()
    return result


@router.get("/qualiopi/readiness")
def readiness(db: DB, _: Reader) -> dict:
    version = active_version(db)
    return {
        "referential": f"{version.code} {version.version}",
        "indicators": indicator_readiness(db, version),
        "disclaimer": "État de préparation calculé à partir des preuves disponibles. "
        "Ne constitue pas une décision de conformité : seul l'organisme certificateur en décide.",
    }


@router.get("/sessions/{session_id}/dossier")
def get_session_dossier(session_id: str, db: DB, _: Reader) -> dict:
    return session_dossier(db, active_version(db), session_id)


class ValidationIn(BaseModel):
    decision: str  # VALIDEE | REJETEE
    comment: str | None = None


@router.post("/evidence/{evidence_id}/validation")
def validate_evidence(evidence_id: str, body: ValidationIn, db: DB, user: EvidenceValidator) -> dict:
    ev = validate(db, evidence_id, body.decision, body.comment, user.id, user.full_name)
    db.commit()
    return {"id": ev.id, "reference": ev.reference, "status": ev.status}


@router.get("/qualiopi/echeances")
def upcoming(db: DB, _: Reader, days: int = Query(15, ge=0, le=365), owner: str | None = None) -> list[dict]:
    """Jalons en retard, ou non faits dont l'échéance tombe dans les `days` prochains jours."""
    horizon = date.today() + timedelta(days=days)
    q = (
        select(MilestoneStatus, t.TrainingSession.reference)
        .join(t.TrainingSession, t.TrainingSession.id == MilestoneStatus.session_id)
        .where(or_(MilestoneStatus.status.in_(("EN_RETARD", "A_ECHEANCE")),
                   (MilestoneStatus.status == "A_VENIR") & (MilestoneStatus.due_on <= horizon)))
        .order_by(MilestoneStatus.due_on)
    )
    if owner:
        q = q.where(MilestoneStatus.owner == owner)
    return [{"session": ref, "session_id": m.session_id, **milestone_view(m)} for m, ref in db.execute(q)]


class ReviewIn(BaseModel):
    conclusion: str  # SATISFAISANT | A_AMELIORER | INSUFFISANT
    comment: str
    valid_months: int = 12
    severity: str = "mineure"  # si INSUFFISANT


@router.post("/qualiopi/indicateurs/{number}/revues")
def review_indicator(number: int, body: ReviewIn, db: DB, user: EvidenceValidator) -> dict:
    """Revue humaine attestée : l'état calculé et les preuves consultées sont figés avec elle."""
    version = active_version(db)
    current = next((i for i in indicator_readiness(db, version) if i["number"] == number), None)
    if current is None:
        raise NotFoundError(f"Indicateur {number} inconnu")
    evidence = db.scalars(select(Evidence.reference).join(EvidenceIndicatorLink).where(
        EvidenceIndicatorLink.indicator_number == number, EvidenceIndicatorLink.version_id == version.id,
        Evidence.status.in_(("EXPLOITABLE", "VALIDEE")))).all()
    review = record_review(db, version, number, conclusion=body.conclusion, comment=body.comment,
                           engine_status=current["status"], evidence_refs=list(evidence), user_id=user.id,
                           user_name=user.full_name, valid_months=body.valid_months, severity=body.severity)
    db.commit()
    return {"id": review.id, "valid_until": review.valid_until.isoformat(), "finding_id": review.finding_id,
            "evidence_refs": review.evidence_refs}


@router.get("/qualiopi/indicateurs/{number}/revues")
def list_reviews(number: int, db: DB, _: Reader) -> list[dict]:
    rows = db.scalars(select(IndicatorReview).where(IndicatorReview.indicator_number == number).order_by(IndicatorReview.reviewed_at.desc()))
    return [{"conclusion": r.conclusion, "comment": r.comment, "by": r.reviewed_by, "at": r.reviewed_at.isoformat(),
             "valid_until": r.valid_until.isoformat(), "engine_status": r.engine_status, "evidence_refs": r.evidence_refs} for r in rows]
