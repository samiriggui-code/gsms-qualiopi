"""Evidence Engine : une preuve est un pointeur daté, empreint et traçable vers une donnée métier.

Statuts (cycle de vie de la preuve, distinct de la conformité) :
  DETECTEE    la donnée métier existe
  DOCUMENTEE  un document ou un enregistrement probant y est rattaché
  EXPLOITABLE les contrôles de forme passent (daté, bonne portée, signé si requis)
  VALIDEE     relue et acceptée par un humain
  EXPIREE     date de validité dépassée
  REJETEE     refusée par un humain (motif obligatoire)
"""

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id, utcnow

Q = {"schema": "qualite"}

EVIDENCE_STATUSES = ("DETECTEE", "DOCUMENTEE", "EXPLOITABLE", "VALIDEE", "EXPIREE", "REJETEE")
USABLE_STATUSES = ("EXPLOITABLE", "VALIDEE")


class Evidence(TimestampMixin, Base):
    __tablename__ = "evidence"
    __table_args__ = (UniqueConstraint("evidence_type", "source_table", "source_id"), Q)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(40), unique=True)  # EV-000123
    evidence_type: Mapped[str] = mapped_column(String(60), index=True)
    label: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="DETECTEE", index=True)
    # Portée (QUOI, POUR QUI)
    scope: Mapped[str] = mapped_column(String(20))  # ORGANISME | FORMATION | SESSION | APPRENANT | FORMATEUR
    program_id: Mapped[str | None] = mapped_column(String(36), index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), index=True)
    enrollment_id: Mapped[str | None] = mapped_column(String(36), index=True)
    learner_id: Mapped[str | None] = mapped_column(String(36))
    trainer_id: Mapped[str | None] = mapped_column(String(36))
    # Source (D'OÙ, QUI, QUAND)
    source_table: Mapped[str] = mapped_column(String(60))
    source_id: Mapped[str] = mapped_column(String(36))
    source_hash: Mapped[str] = mapped_column(String(64))
    document_id: Mapped[str | None] = mapped_column(String(36))
    document_sha256: Mapped[str | None] = mapped_column(String(64))
    produced_by: Mapped[str | None] = mapped_column(String(200))
    produced_on: Mapped[date | None] = mapped_column(Date)
    valid_until: Mapped[date | None] = mapped_column(Date)
    facts: Mapped[dict] = mapped_column(JSON, default=dict)
    form_issues: Mapped[list[str]] = mapped_column(JSON, default=list)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    links: Mapped[list["EvidenceIndicatorLink"]] = relationship(back_populates="evidence", cascade="all, delete-orphan")
    history: Mapped[list["EvidenceEvent"]] = relationship(back_populates="evidence", cascade="all, delete-orphan", order_by="EvidenceEvent.at")


class EvidenceIndicatorLink(Base):
    __tablename__ = "evidence_indicator_link"
    __table_args__ = (UniqueConstraint("evidence_id", "version_id", "indicator_number"), Q)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("qualite.evidence.id", ondelete="CASCADE"))
    version_id: Mapped[str] = mapped_column(String(36))
    indicator_number: Mapped[int] = mapped_column()
    origin: Mapped[str] = mapped_column(String(20), default="AUTO")  # AUTO | MANUEL | SUGGESTION
    status: Mapped[str] = mapped_column(String(20), default="ACTIF")  # ACTIF | SUGGERE | REJETE
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    evidence: Mapped[Evidence] = relationship(back_populates="links")


class EvidenceValidation(Base):
    __tablename__ = "evidence_validation"
    __table_args__ = Q

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("qualite.evidence.id", ondelete="CASCADE"))
    decision: Mapped[str] = mapped_column(String(20))  # VALIDEE | REJETEE
    comment: Mapped[str | None] = mapped_column(Text)
    # Réponses à la grille de relecture de la pièce, avec la question telle qu'elle était posée.
    checklist: Mapped[dict | None] = mapped_column(JSON)
    # La personne qui valide est aussi celle qui a déposé (admis seulement si l'organisme l'autorise).
    self_validated: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    source_hash: Mapped[str] = mapped_column(String(64))  # l'état exact validé
    by_user_id: Mapped[str] = mapped_column(String(36))
    by_name: Mapped[str] = mapped_column(String(200))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EvidenceEvent(Base):
    """Historique en ajout seul."""

    __tablename__ = "evidence_event"
    __table_args__ = Q

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("qualite.evidence.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))  # DETECTED | SOURCE_CHANGED | STATUS_CHANGED | VALIDATED | REJECTED | EXPIRED | SOURCE_DELETED
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str | None] = mapped_column(String(20))
    detail: Mapped[str | None] = mapped_column(Text)
    actor: Mapped[str | None] = mapped_column(String(200))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    evidence: Mapped[Evidence] = relationship(back_populates="history")
