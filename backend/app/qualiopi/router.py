"""API du moteur Qualiopi (lecture de l'état de préparation, import du référentiel, validation humaine)."""

from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth.security import DB, EvidenceValidator, QualityWriter, Reader, ReferentialManager
from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.qualiopi.engine import refresh_all
from app.qualiopi.evaluation.report import session_dossier
from app.qualiopi.evaluation.service import indicator_readiness
from app.qualiopi.evidence.service import validate
from app.qualiopi.referential.importer import active_version, import_referential

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
