"""Documents professionnels (schéma `edition`) : projet de document, lignes de devis, historique du circuit.

Un projet se prépare en brouillon, passe en relecture, puis est validé : la validation rédige le document et
le fige dans l'archive commune (`formation.document`, empreinte SHA-256, version précédente « remplacée »).
Un document commercial n'est jamais une preuve Qualiopi : il ne porte aucun indicateur.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id

ED = {"schema": "edition"}

# Types prévus dans l'analyse ; seuls ceux de `service.BUILT` peuvent être créés aujourd'hui.
KINDS = {
    "DEVIS": "Devis",
    "PROPOSITION": "Proposition commerciale",
    "PROGRAMME_PERSONNALISE": "Programme personnalisé",
    "RAPPORT_AUDIT": "Rapport d'audit",
    "PLAN_ACTIONS": "Plan d'actions correctives",
    "DOSSIER_CONTROLE": "Dossier préparatoire au contrôle",
    "PRESENTATION": "Présentation commerciale",
}
STATUSES = {
    "BROUILLON": "Brouillon",
    "EN_RELECTURE": "En relecture",
    "VALIDE": "Validé",
    "ENVOYE": "Envoyé",
    "ARCHIVE": "Archivé",
    "ABANDONNE": "Abandonné",
}
UNITS = {"STAGIAIRE": "stagiaire", "GROUPE": "groupe", "JOUR": "jour", "HEURE": "heure", "FORFAIT": "forfait"}


class Project(TimestampMixin, Base):
    """Un document en préparation et son état. Le contenu figé vit dans `formation.document`."""

    __tablename__ = "projet"
    __table_args__ = ED

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(40), unique=True)  # DEV-SECU69-001
    kind: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(250))
    status: Mapped[str] = mapped_column(String(20), default="BROUILLON")
    company_id: Mapped[str | None] = mapped_column(ForeignKey("formation.company.id", ondelete="RESTRICT"), index=True)
    # Sections libres relues par une personne : [{"titre", "texte"}].
    sections: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")
    valid_until: Mapped[date | None] = mapped_column(Date)
    version: Mapped[int] = mapped_column(Integer, default=0)  # dernière version archivée (0 : jamais validé)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("formation.document.id", ondelete="SET NULL"))
    sent_on: Mapped[date | None] = mapped_column(Date)
    author_id: Mapped[str | None] = mapped_column(String(36))

    lines: Mapped[list[QuoteLine]] = relationship(back_populates="project", cascade="all, delete-orphan",
                                                  order_by="QuoteLine.position")
    steps: Mapped[list[Step]] = relationship(back_populates="project", cascade="all, delete-orphan",
                                             order_by="Step.done_at")


class QuoteLine(Base):
    """Ligne de devis. Le prix est saisi ou repris de la formation ; il n'est jamais deviné."""

    __tablename__ = "ligne"
    __table_args__ = ED

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("edition.projet.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    program_id: Mapped[str | None] = mapped_column(ForeignKey("formation.program.id", ondelete="SET NULL"))
    label: Mapped[str] = mapped_column(String(300))
    detail: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=1)
    unit: Mapped[str] = mapped_column(String(20), default="STAGIAIRE")
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))  # HT ; vide tant qu'il n'est pas connu
    discount_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)

    project: Mapped[Project] = relationship(back_populates="lines")


class Step(Base):
    """Historique du circuit : qui a fait quoi, quand, avec quel motif."""

    __tablename__ = "etape"
    __table_args__ = ED

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("edition.projet.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(30))
    from_status: Mapped[str] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    done_by: Mapped[str] = mapped_column(String(200))
    done_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int | None] = mapped_column(Integer)

    project: Mapped[Project] = relationship(back_populates="steps")
