"""Dossier de financement d'une inscription et ses sources (schéma `financement`).

Cinq rôles séparés sur chaque source : bénéficiaire (le stagiaire de l'inscription),
financeur, signataire, destinataire de la facture, payeur.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id

F = {"schema": "financement"}
INACTIVE = ("REFUSEE", "ANNULEE", "ANNULE")


class FundingCase(TimestampMixin, Base):
    __tablename__ = "funding_case"
    __table_args__ = F

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    enrollment_id: Mapped[str] = mapped_column(ForeignKey("formation.enrollment.id", ondelete="CASCADE"), unique=True)
    cost_eur: Mapped[Decimal] = mapped_column(Numeric(10, 2))  # coût de l'action pour ce stagiaire (TTC)

    sources: Mapped[list["FundingSource"]] = relationship(back_populates="case", cascade="all, delete-orphan",
                                                          order_by="FundingSource.created_at")


class FundingSource(TimestampMixin, Base):
    __tablename__ = "funding_source"
    __table_args__ = F

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(ForeignKey("financement.funding_case.id", ondelete="CASCADE"), index=True)
    scheme: Mapped[str] = mapped_column(String(30))  # code du dispositif (dispositifs.yaml)
    scheme_version: Mapped[str] = mapped_column(String(20))  # version du circuit au moment de la création
    state: Mapped[str] = mapped_column(String(30))
    provider_name: Mapped[str | None] = mapped_column(String(200))  # financeur : « Opco EP », « France Travail »…
    signatory: Mapped[str | None] = mapped_column(String(200))  # qui signe la convention ou le contrat
    invoice_recipient: Mapped[str | None] = mapped_column(String(200))
    payer_kind: Mapped[str] = mapped_column(String(20))  # FINANCEUR | ENTREPRISE | STAGIAIRE
    payer_name: Mapped[str | None] = mapped_column(String(200))
    amount_requested: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    amount_granted: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    amount_paid: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    external_ref: Mapped[str | None] = mapped_column(String(80))  # n° de dossier EDOF, d'accord OPCO, de devis Kairos
    invoice_ref: Mapped[str | None] = mapped_column(String(80))
    reason: Mapped[str | None] = mapped_column(Text)  # motif de refus ou d'annulation

    case: Mapped[FundingCase] = relationship(back_populates="sources")
    steps: Mapped[list["FundingStep"]] = relationship(back_populates="source", cascade="all, delete-orphan",
                                                      order_by="FundingStep.created_at")


class FundingStep(TimestampMixin, Base):
    """Historique des actions d'une source : qui a fait quoi, quand, avec quelle référence externe."""

    __tablename__ = "funding_step"
    __table_args__ = F

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(ForeignKey("financement.funding_source.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(40))
    from_state: Mapped[str] = mapped_column(String(30))
    to_state: Mapped[str] = mapped_column(String(30))
    done_on: Mapped[date] = mapped_column(Date)
    portal: Mapped[str | None] = mapped_column(String(80))
    note: Mapped[str | None] = mapped_column(Text)

    source: Mapped[FundingSource] = relationship(back_populates="steps")
