"""Revue humaine attestée d'un indicateur : ce que le moteur ne peut pas juger seul."""

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, new_id, utcnow

# SATISFAISANT   le responsable qualité atteste que l'exigence est tenue sur le fond
# A_AMELIORER    tenue, mais une amélioration est décidée (pas de constat)
# INSUFFISANT    non tenue : un constat est ouvert (circuit CAPA)
CONCLUSIONS = ("SATISFAISANT", "A_AMELIORER", "INSUFFISANT")


class IndicatorReview(TimestampMixin, Base):
    __tablename__ = "indicator_review"
    __table_args__ = {"schema": "qualite"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    version_id: Mapped[str] = mapped_column(String(36))
    indicator_number: Mapped[int] = mapped_column(Integer, index=True)
    conclusion: Mapped[str] = mapped_column(String(20))
    comment: Mapped[str] = mapped_column(Text)
    engine_status: Mapped[str] = mapped_column(String(30))  # état calculé au moment de la revue
    evidence_refs: Mapped[list[str]] = mapped_column(JSON, default=list)  # preuves consultées
    reviewed_by_id: Mapped[str] = mapped_column(String(36))
    reviewed_by: Mapped[str] = mapped_column(String(200))
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    valid_until: Mapped[date] = mapped_column(Date)
    finding_id: Mapped[str | None] = mapped_column(String(36))
