"""Demande de pièce : qui doit fournir quoi, pour quand (idée de DocumentRequest, gsms-school-aps)."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, new_id

REQUEST_STATUSES = ("OUVERTE", "SATISFAITE", "ANNULEE")


class DocumentRequest(TimestampMixin, Base):
    __tablename__ = "document_request"
    __table_args__ = {"schema": "formation"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    subject: Mapped[str] = mapped_column(String(20))  # ORGANISME | FORMATEUR
    subject_id: Mapped[str] = mapped_column(String(36), index=True)
    requirement: Mapped[str] = mapped_column(String(60))
    requested_from: Mapped[str] = mapped_column(String(200))  # personne ou service sollicité
    message: Mapped[str | None] = mapped_column(Text)
    due_on: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="OUVERTE", index=True)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fulfilled_document_id: Mapped[str | None] = mapped_column(String(36))
