"""Enregistrer une revue humaine et en déduire l'état « revue » d'un indicateur."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError, NotFoundError
from app.qualiopi.common import next_reference
from app.qualiopi.evaluation.models import Finding
from app.qualiopi.referential.models import ReferentialVersion
from app.qualiopi.review.models import CONCLUSIONS, IndicatorReview

MIN_COMMENT = 20


def record_review(db: Session, version: ReferentialVersion, number: int, *, conclusion: str, comment: str,
                  engine_status: str, evidence_refs: list[str], user_id: str, user_name: str,
                  valid_months: int = 12, severity: str = "mineure", today: date | None = None) -> IndicatorReview:
    today = today or date.today()
    ind = next((i for i in version.indicators if i.number == number), None)
    if ind is None:
        raise NotFoundError(f"Indicateur {number} absent de {version.code} {version.version}")
    if conclusion not in CONCLUSIONS:
        raise InvalidStateError(f"Conclusion attendue : {', '.join(CONCLUSIONS)}")
    if len((comment or "").strip()) < MIN_COMMENT:
        raise InvalidStateError(f"Justifiez la revue ({MIN_COMMENT} caractères minimum) : ce que vous avez vérifié et sur quoi")
    if not 1 <= valid_months <= 36:
        raise InvalidStateError("Validité d'une revue : entre 1 et 36 mois")
    review = IndicatorReview(
        version_id=version.id, indicator_number=number, conclusion=conclusion, comment=comment.strip(),
        engine_status=engine_status, evidence_refs=sorted(set(evidence_refs)), reviewed_by_id=user_id,
        reviewed_by=user_name, valid_until=today + timedelta(days=30 * valid_months),
    )
    db.add(review)
    db.flush()
    if conclusion == "INSUFFISANT":
        f = Finding(
            reference=next_reference(db, "CST"), key=f"revue:{review.id}", origin="REVUE",
            indicator_number=number, target_type="ORGANISME", target_id=review.id, readiness=engine_status,
            severity="majeure" if severity == "majeure" else "mineure",
            title=f"I{number:02d} — revue humaine insuffisante ({user_name})", explanation=review.comment,
            remediation="Définir une action corrective ; la clôture exigera une nouvelle vérification humaine.",
        )
        db.add(f)
        db.flush()
        review.finding_id = f.id
    return review


def latest_reviews(db: Session, version: ReferentialVersion) -> dict[int, IndicatorReview]:
    rows = db.scalars(select(IndicatorReview).where(IndicatorReview.version_id == version.id).order_by(IndicatorReview.reviewed_at))
    return {r.indicator_number: r for r in rows}


def review_state(review: IndicatorReview | None, needs_review: bool, today: date | None = None) -> dict:
    """Seconde dimension d'un indicateur : REQUISE, FAITE, EXPIREE, INSUFFISANTE ou SANS_OBJET."""
    today = today or date.today()
    if review is None:
        return {"state": "REQUISE" if needs_review else "SANS_OBJET"}
    info = {"by": review.reviewed_by, "at": review.reviewed_at.isoformat(), "valid_until": review.valid_until.isoformat(),
            "conclusion": review.conclusion, "comment": review.comment}
    if review.valid_until < today:
        return {"state": "EXPIREE", **info}
    if review.conclusion == "INSUFFISANT":
        return {"state": "INSUFFISANTE", **info}
    return {"state": "FAITE", **info}
