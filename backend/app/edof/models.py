"""Référencement CPF (EDOF) : dossier de l'établissement, dossiers des formations (schéma `edof`).

GSMS prépare et suit les démarches ; il ne dépose rien sur EDOF et ne décide de rien. Le dépôt,
les compléments et la décision de la Caisse des Dépôts sont saisis par une personne, avec leur date.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id

E = {"schema": "edof"}

DOSSIER_KINDS = ("ETABLISSEMENT", "FORMATION")
# États enregistrés. « Incomplet » et « prêt pour validation interne » sont calculés par les contrôles
# tant que le dossier est EN_PREPARATION.
DOSSIER_STATUSES = ("EN_PREPARATION", "VALIDE_INTERNE", "DEPOSE", "COMPLEMENTS_DEMANDES", "DECISION_RECUE")
DECISIONS = ("ACCEPTEE", "REFUSEE")
STRUCTURE_TYPES = ("ENTREPRISE", "ENTREPRISE_ARTISANALE_LIBERALE", "ASSOCIATION")
REPRESENTATIVE_KINDS = ("PERSONNE_PHYSIQUE", "PERSONNE_MORALE")
EFP_CONNECT_STATUSES = ("AUCUN", "COMPTE_CREE", "HABILITATION_DEMANDEE", "HABILITE")
PIECE_STATUSES = ("A_VALIDER", "VALIDEE", "REJETEE")
COMPLEMENT_STATUSES = ("DEMANDEE", "FOURNIE", "ANNULEE")
ACCOMPANIMENT_KINDS = ("WEBINAIRE", "PARCOURS", "DOCUMENTATION", "AUTRE")


class Establishment(TimestampMixin, Base):
    """Situation administrative de l'établissement (SIRET) qui demande le référencement."""

    __tablename__ = "establishment"
    __table_args__ = E

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("formation.organization.id", ondelete="CASCADE"), unique=True)
    legal_name: Mapped[str | None] = mapped_column(String(250))
    legal_form: Mapped[str | None] = mapped_column(String(80))
    structure_type: Mapped[str | None] = mapped_column(String(40))  # STRUCTURE_TYPES
    address: Mapped[str | None] = mapped_column(String(300))
    naf_code: Mapped[str | None] = mapped_column(String(10))
    identity_source: Mapped[str | None] = mapped_column(String(300))  # où l'identité a été relevée
    identity_checked_on: Mapped[date | None] = mapped_column(Date)
    representative_kind: Mapped[str | None] = mapped_column(String(30))  # REPRESENTATIVE_KINDS
    representative_name: Mapped[str | None] = mapped_column(String(200))
    representative_role: Mapped[str | None] = mapped_column(String(120))
    nda_checked_on: Mapped[date | None] = mapped_column(Date)  # NDA vu actif sur Mon Activité Formation
    qualiopi_certificate: Mapped[str | None] = mapped_column(String(80))
    qualiopi_certifier: Mapped[str | None] = mapped_column(String(200))
    qualiopi_valid_until: Mapped[date | None] = mapped_column(Date)
    qualiopi_categories: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")
    qualiopi_checked_on: Mapped[date | None] = mapped_column(Date)
    efp_connect_status: Mapped[str] = mapped_column(String(30), default="AUCUN", server_default="AUCUN")
    efp_connect_updated_on: Mapped[date | None] = mapped_column(Date)
    obligations_checked_on: Mapped[date | None] = mapped_column(Date)  # obligations légales, fiscales, sociales
    bpf_last_year: Mapped[int | None] = mapped_column(Integer)  # dernier bilan pédagogique et financier transmis
    cgu_version_read: Mapped[str | None] = mapped_column(String(20))
    cgu_read_on: Mapped[date | None] = mapped_column(Date)
    uses_subcontracting: Mapped[bool | None] = mapped_column(Boolean)
    note: Mapped[str | None] = mapped_column(Text)


class Dossier(TimestampMixin, Base):
    __tablename__ = "dossier"
    __table_args__ = (UniqueConstraint("kind", "program_id"), E)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(20))  # DOSSIER_KINDS
    organization_id: Mapped[str] = mapped_column(ForeignKey("formation.organization.id", ondelete="CASCADE"))
    program_id: Mapped[str | None] = mapped_column(ForeignKey("formation.program.id", ondelete="CASCADE"))
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("edof.dossier.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(30), default="EN_PREPARATION", server_default="EN_PREPARATION")
    validated_by: Mapped[str | None] = mapped_column(String(200))
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Dépôt déclaré par une personne (la transmission se fait sur EDOF, pas depuis GSMS).
    submitted_on: Mapped[date | None] = mapped_column(Date)
    submitted_by: Mapped[str | None] = mapped_column(String(200))
    cdc_reference: Mapped[str | None] = mapped_column(String(80))
    program_version_id: Mapped[str | None] = mapped_column(ForeignKey("formation.program_version.id", ondelete="SET NULL"))
    # Ce qui a été transmis, figé au dépôt : version du programme, pièces et empreintes, contrôles.
    submission_snapshot: Mapped[dict | None] = mapped_column(JSON)
    decision: Mapped[str | None] = mapped_column(String(20))  # DECISIONS
    decision_on: Mapped[date | None] = mapped_column(Date)
    decision_note: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)

    pieces: Mapped[list[Piece]] = relationship(back_populates="dossier", cascade="all, delete-orphan")
    complements: Mapped[list[Complement]] = relationship(back_populates="dossier", cascade="all, delete-orphan",
                                                         order_by="Complement.requested_on")
    accompaniments: Mapped[list[Accompaniment]] = relationship(back_populates="dossier", cascade="all, delete-orphan",
                                                               order_by="Accompaniment.planned_on")


class Piece(TimestampMixin, Base):
    """Rattachement d'un document à une pièce attendue d'un dossier.

    Le fichier est un `formation.document` (version, empreinte) : une pièce commune déposée une fois
    peut être rattachée à plusieurs dossiers sans copie. La validation est propre à chaque dossier.
    Une pièce remplacée reste dans l'historique (`replaced_at`).
    """

    __tablename__ = "piece"
    __table_args__ = E

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    dossier_id: Mapped[str] = mapped_column(ForeignKey("edof.dossier.id", ondelete="CASCADE"), index=True)
    requirement: Mapped[str] = mapped_column(String(60))
    document_id: Mapped[str] = mapped_column(ForeignKey("formation.document.id", ondelete="RESTRICT"))
    shared: Mapped[bool] = mapped_column(Boolean, default=False)  # document d'un autre dossier, référencé
    issued_on: Mapped[date | None] = mapped_column(Date)  # date portée par le document
    valid_until: Mapped[date | None] = mapped_column(Date)  # fin de validité portée par le document
    siret_on_document: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="A_VALIDER")
    validated_by: Mapped[str | None] = mapped_column(String(200))
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    replaced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    dossier: Mapped[Dossier] = relationship(back_populates="pieces")


class Complement(TimestampMixin, Base):
    """Pièce ou information demandée par la Caisse des Dépôts pendant l'instruction."""

    __tablename__ = "complement"
    __table_args__ = E

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    dossier_id: Mapped[str] = mapped_column(ForeignKey("edof.dossier.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(300))
    requirement: Mapped[str | None] = mapped_column(String(60))  # pièce du référentiel si elle y figure
    requested_on: Mapped[date] = mapped_column(Date)
    due_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="DEMANDEE")
    piece_id: Mapped[str | None] = mapped_column(ForeignKey("edof.piece.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(Text)

    dossier: Mapped[Dossier] = relationship(back_populates="complements")


class Accompaniment(TimestampMixin, Base):
    """Suivi de l'accompagnement dédié et obligatoire proposé par la Caisse des Dépôts (CP OF, art. 2)."""

    __tablename__ = "accompaniment"
    __table_args__ = E

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    dossier_id: Mapped[str] = mapped_column(ForeignKey("edof.dossier.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="WEBINAIRE")
    label: Mapped[str] = mapped_column(String(250))
    planned_on: Mapped[date | None] = mapped_column(Date)
    done_on: Mapped[date | None] = mapped_column(Date)
    participant: Mapped[str | None] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(Text)

    dossier: Mapped[Dossier] = relationship(back_populates="accompaniments")
