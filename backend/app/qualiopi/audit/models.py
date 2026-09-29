"""Audit interne : photo figée (version du référentiel, échantillon, résultats) + jugement humain."""

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id

Q = {"schema": "qualite"}

JUDGMENTS = ("CONFORME", "NC_MINEURE", "NC_MAJEURE", "NON_APPLICABLE")


class Audit(TimestampMixin, Base):
    __tablename__ = "audit"
    __table_args__ = Q

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(40), unique=True)  # AUD-2026-001
    title: Mapped[str] = mapped_column(String(250))
    kind: Mapped[str] = mapped_column(String(20), default="INTERNE")  # INTERNE | BLANC
    version_id: Mapped[str] = mapped_column(String(36))
    referential_label: Mapped[str] = mapped_column(String(80))
    planned_on: Mapped[date | None] = mapped_column(Date)
    auditor_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="EN_COURS")  # EN_COURS | CLOS
    sample_session_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    conclusion: Mapped[str | None] = mapped_column(Text)

    items: Mapped[list["AuditItem"]] = relationship(back_populates="audit", cascade="all, delete-orphan", order_by="AuditItem.indicator_number")


class AuditItem(Base):
    __tablename__ = "audit_item"
    __table_args__ = (UniqueConstraint("audit_id", "indicator_number"), Q)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    audit_id: Mapped[str] = mapped_column(ForeignKey("qualite.audit.id", ondelete="CASCADE"))
    indicator_number: Mapped[int] = mapped_column(Integer)
    indicator_title: Mapped[str] = mapped_column(String(250))
    engine_readiness: Mapped[str] = mapped_column(String(30))
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)  # résultats, preuves, constats au moment T
    judgment: Mapped[str | None] = mapped_column(String(20))
    comment: Mapped[str | None] = mapped_column(Text)
    judged_by: Mapped[str | None] = mapped_column(String(200))
    judged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    audit: Mapped[Audit] = relationship(back_populates="items")


class Sequence(Base):
    """Compteurs pour les références lisibles (EV-, CST-, CAPA-, AUD-)."""

    __tablename__ = "sequence"
    __table_args__ = Q

    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0)
