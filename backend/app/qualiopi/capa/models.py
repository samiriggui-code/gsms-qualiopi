"""CAPA : action corrective / préventive reliée à un constat, jusqu'à la vérification d'efficacité."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id, utcnow

Q = {"schema": "qualite"}

CAPA_STATUSES = ("OUVERTE", "EN_COURS", "A_VERIFIER", "CLOTUREE", "ANNULEE")


class CapaAction(TimestampMixin, Base):
    __tablename__ = "capa_action"
    __table_args__ = Q

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(40), unique=True)  # CAPA-000007
    finding_id: Mapped[str] = mapped_column(ForeignKey("qualite.finding.id", ondelete="RESTRICT"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="CORRECTIVE")  # CORRECTIVE | PREVENTIVE
    title: Mapped[str] = mapped_column(String(300))
    root_cause: Mapped[str | None] = mapped_column(Text)
    action_plan: Mapped[str] = mapped_column(Text)
    owner_name: Mapped[str] = mapped_column(String(200))
    due_on: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="OUVERTE", index=True)
    completion_note: Mapped[str | None] = mapped_column(Text)
    completed_on: Mapped[date | None] = mapped_column(Date)
    verification_result: Mapped[str | None] = mapped_column(Text)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_by: Mapped[str | None] = mapped_column(String(200))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    events: Mapped[list["CapaEvent"]] = relationship(back_populates="capa", cascade="all, delete-orphan", order_by="CapaEvent.at")


class CapaEvent(Base):
    __tablename__ = "capa_event"
    __table_args__ = Q

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    capa_id: Mapped[str] = mapped_column(ForeignKey("qualite.capa_action.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str | None] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(200))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    capa: Mapped[CapaAction] = relationship(back_populates="events")
