"""Référentiels qualité versionnés.

Trois couches :
- source      : texte officiel importé (indicator_text), jamais modifié, avec empreintes ;
- normative   : applicabilité, preuves attendues, contrôles (écrits par l'OF, relus par la qualité) ;
- exécution   : les contrôles pointent vers une clé de la bibliothèque Python (`check`).
"""

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id, utcnow

Q = {"schema": "qualite"}


class ReferentialVersion(TimestampMixin, Base):
    __tablename__ = "referential_version"
    __table_args__ = (UniqueConstraint("code", "version"), Q)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(40))  # QUALIOPI
    version: Mapped[str] = mapped_column(String(20))  # V9
    title: Mapped[str] = mapped_column(String(250))
    effective_from: Mapped[date] = mapped_column(Date)
    source_label: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(400))
    source_sha256: Mapped[str] = mapped_column(String(64))
    normative_sha256: Mapped[str] = mapped_column(String(64))
    upstream_ref: Mapped[str | None] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    imported_by: Mapped[str | None] = mapped_column(String(36))

    criteria: Mapped[list["Criterion"]] = relationship(back_populates="version", cascade="all, delete-orphan", order_by="Criterion.number")
    indicators: Mapped[list["Indicator"]] = relationship(back_populates="version", cascade="all, delete-orphan", order_by="Indicator.number")


class Criterion(Base):
    __tablename__ = "criterion"
    __table_args__ = (UniqueConstraint("version_id", "number"), Q)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    version_id: Mapped[str] = mapped_column(ForeignKey("qualite.referential_version.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)

    version: Mapped[ReferentialVersion] = relationship(back_populates="criteria")


class Indicator(Base):
    __tablename__ = "indicator"
    __table_args__ = (UniqueConstraint("version_id", "number"), Q)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    version_id: Mapped[str] = mapped_column(ForeignKey("qualite.referential_version.id", ondelete="CASCADE"))
    criterion_number: Mapped[int] = mapped_column(Integer)
    number: Mapped[int] = mapped_column(Integer)
    slug: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(250))
    ponderation: Mapped[str] = mapped_column(String(40))
    new_entrant_adapted: Mapped[bool] = mapped_column(Boolean, default=False)
    subcontracting: Mapped[str] = mapped_column(String(40))
    source_sha256: Mapped[str] = mapped_column(String(64))
    editorial_note: Mapped[str | None] = mapped_column(Text)
    # Couche normative
    scope: Mapped[str] = mapped_column(String(20), default="ORGANISME")  # ORGANISME | FORMATION | SESSION
    applicability: Mapped[dict] = mapped_column(JSON, default=dict)
    expected_evidence: Mapped[list[dict]] = mapped_column(JSON, default=list)
    human_review: Mapped[str] = mapped_column(Text, default="")

    version: Mapped[ReferentialVersion] = relationship(back_populates="indicators")
    texts: Mapped[list["IndicatorText"]] = relationship(back_populates="indicator", cascade="all, delete-orphan", order_by="IndicatorText.position")
    controls: Mapped[list["ControlDefinition"]] = relationship(back_populates="indicator", cascade="all, delete-orphan")

    @property
    def code(self) -> str:
        return f"I{self.number:02d}"


class IndicatorText(Base):
    """Section du guide de lecture, verbatim (Énoncé, Exemples de preuves, Non-conformité…)."""

    __tablename__ = "indicator_text"
    __table_args__ = Q

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    indicator_id: Mapped[str] = mapped_column(ForeignKey("qualite.indicator.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    section: Mapped[str] = mapped_column(String(80))
    body: Mapped[str] = mapped_column(Text)

    indicator: Mapped[Indicator] = relationship(back_populates="texts")


class ControlDefinition(Base):
    __tablename__ = "control_definition"
    __table_args__ = (UniqueConstraint("indicator_id", "key"), Q)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    indicator_id: Mapped[str] = mapped_column(ForeignKey("qualite.indicator.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(120))  # ex. I08.positioning-before-start
    control_version: Mapped[int] = mapped_column(Integer, default=1)
    label: Mapped[str] = mapped_column(Text)
    check: Mapped[str] = mapped_column(String(80))  # clé de la bibliothèque Python
    scope: Mapped[str] = mapped_column(String(20))  # ORGANISME | FORMATION | SESSION
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    severity: Mapped[str] = mapped_column(String(20), default="majeure")  # majeure | mineure
    remediation: Mapped[str] = mapped_column(Text, default="")
    guide_section: Mapped[str | None] = mapped_column(String(80))
    new_entrant_mode: Mapped[str] = mapped_column(String(20), default="same")  # same | procedure

    indicator: Mapped[Indicator] = relationship(back_populates="controls")
