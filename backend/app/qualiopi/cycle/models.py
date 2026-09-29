"""Cycle de certification : la période sur laquelle un auditeur regarde l'activité."""

from datetime import date

from sqlalchemy import Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, new_id

CYCLE_KINDS = ("INITIAL", "SURVEILLANCE", "RENOUVELLEMENT", "INTERNE")


class CertificationCycle(TimestampMixin, Base):
    __tablename__ = "certification_cycle"
    __table_args__ = {"schema": "qualite"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    label: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)  # vide = jusqu'à aujourd'hui
    audit_on: Mapped[date | None] = mapped_column(Date)
    certifier: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
