"""Facturation (schéma `facturation`) : factures, avoirs, lignes et encaissements.

Une facture se prépare en brouillon, sans numéro. Son numéro (séquence chronologique et continue) lui est
attribué à l'émission, dans la même transaction que le figeage : un brouillon supprimé ne laisse donc aucun
trou. Une fois émise, elle ne change plus (texte HTML figé, empreinte SHA-256) ; on la corrige par un avoir,
qui est lui-même une facture rectificative numérotée (CGI, art. 289, I-5). Sources : docs/facturation/SOURCES.md.

Les montants sont des centimes entiers (jamais de nombre à virgule flottante).
Une contrainte en base (déclencheur, migration 0022) refuse aussi toute modification d'une pièce émise.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, BigInteger, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.db import Base, TimestampMixin, new_id

FA = {"schema": "facturation"}

KINDS = {"FACTURE": "Facture", "AVOIR": "Avoir"}
STATUSES = {
    "BROUILLON": "Brouillon",
    "EMISE": "Émise",
    "PAYEE_PARTIELLEMENT": "Payée partiellement",
    "PAYEE": "Payée",
    "ANNULEE": "Annulée par avoir",
}
ISSUED = ("EMISE", "PAYEE_PARTIELLEMENT", "PAYEE", "ANNULEE")
CLIENT_KINDS = {"ENTREPRISE": "Entreprise", "STAGIAIRE": "Stagiaire", "FINANCEUR": "Financeur"}
# Client professionnel : les mentions du code de commerce (pénalités, indemnité de 40 €) s'impriment.
PROFESSIONAL_CLIENTS = ("ENTREPRISE", "FINANCEUR")
PAYMENT_MODES = {
    "VIREMENT": "Virement", "CHEQUE": "Chèque", "CARTE": "Carte bancaire", "PRELEVEMENT": "Prélèvement",
    "ESPECES": "Espèces", "AUTRE": "Autre",
}


class Invoice(TimestampMixin, Base):
    """Facture ou avoir. Les coordonnées du client sont recopiées : la pièce émise ne suit plus la fiche client."""

    __tablename__ = "facture"
    __table_args__ = FA

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(10), default="FACTURE")
    number: Mapped[str | None] = mapped_column(String(40), unique=True)  # FA-2026-0001, attribué à l'émission
    status: Mapped[str] = mapped_column(String(20), default="BROUILLON", index=True)
    title: Mapped[str] = mapped_column(String(250))
    # Client : une entreprise, un stagiaire, ou un financeur (OPCO, France Travail…) saisi ou repris du financement.
    client_kind: Mapped[str] = mapped_column(String(12))
    company_id: Mapped[str | None] = mapped_column(ForeignKey("formation.company.id", ondelete="RESTRICT"), index=True)
    learner_id: Mapped[str | None] = mapped_column(ForeignKey("formation.learner.id", ondelete="RESTRICT"), index=True)
    funding_source_id: Mapped[str | None] = mapped_column(
        ForeignKey("financement.funding_source.id", ondelete="RESTRICT"), index=True)
    quote_id: Mapped[str | None] = mapped_column(ForeignKey("edition.projet.id", ondelete="RESTRICT"))
    client_name: Mapped[str] = mapped_column(String(200))
    client_address: Mapped[str | None] = mapped_column(String(300))
    client_postal_code: Mapped[str | None] = mapped_column(String(10))
    client_city: Mapped[str | None] = mapped_column(String(120))
    client_siret: Mapped[str | None] = mapped_column(String(20))
    purchase_order: Mapped[str | None] = mapped_column(String(80))  # bon de commande du client (L441-9)
    service_from: Mapped[date | None] = mapped_column(Date)
    service_to: Mapped[date | None] = mapped_column(Date)  # date de réalisation (fin) de la prestation
    issued_on: Mapped[date | None] = mapped_column(Date)
    fiscal_year: Mapped[int | None] = mapped_column(Integer)
    due_on: Mapped[date | None] = mapped_column(Date)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    issued_by: Mapped[str | None] = mapped_column(String(200))
    author_id: Mapped[str | None] = mapped_column(String(36))
    note: Mapped[str | None] = mapped_column(Text)  # note interne, jamais imprimée
    # Avoir : la facture qu'il rectifie et le motif imprimé.
    credited_invoice_id: Mapped[str | None] = mapped_column(
        ForeignKey("facturation.facture.id", ondelete="RESTRICT"), index=True)
    reason: Mapped[str | None] = mapped_column(Text)
    total_ht_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    total_vat_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    total_ttc_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    # Décompte par taux figé à l'émission : [{"taux": "20.00" | None, "base": centimes, "tva": centimes}].
    vat_breakdown: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")
    document_id: Mapped[str | None] = mapped_column(ForeignKey("formation.document.id", ondelete="RESTRICT"))

    lines: Mapped[list[InvoiceLine]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceLine.position",
        foreign_keys="InvoiceLine.invoice_id")
    payments: Mapped[list[Payment]] = relationship(back_populates="invoice", order_by="Payment.received_on")


class InvoiceLine(Base):
    """Ligne : quantité, prix unitaire HT en centimes, remise, TVA (taux, ou vide si exonérée)."""

    __tablename__ = "facture_ligne"
    __table_args__ = FA

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("facturation.facture.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    label: Mapped[str] = mapped_column(String(300))
    detail: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=1)
    unit: Mapped[str] = mapped_column(String(20), default="STAGIAIRE")
    unit_price_cents: Mapped[int] = mapped_column(BigInteger)
    discount_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))  # vide : opération exonérée
    amount_ht_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    program_id: Mapped[str | None] = mapped_column(ForeignKey("formation.program.id", ondelete="RESTRICT"))
    session_id: Mapped[str | None] = mapped_column(ForeignKey("formation.session.id", ondelete="RESTRICT"))
    enrollment_id: Mapped[str | None] = mapped_column(ForeignKey("formation.enrollment.id", ondelete="RESTRICT"),
                                                      index=True)
    # Ligne d'avoir : la ligne de facture qu'elle rectifie (plafond par ligne).
    credited_line_id: Mapped[str | None] = mapped_column(
        ForeignKey("facturation.facture_ligne.id", ondelete="RESTRICT"), index=True)

    invoice: Mapped[Invoice] = relationship(back_populates="lines", foreign_keys=[invoice_id])


class Payment(TimestampMixin, Base):
    """Encaissement reçu sur une facture. Une erreur se corrige en l'annulant (motif), jamais en l'effaçant."""

    __tablename__ = "encaissement"
    __table_args__ = FA

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("facturation.facture.id", ondelete="RESTRICT"), index=True)
    amount_cents: Mapped[int] = mapped_column(BigInteger)
    received_on: Mapped[date] = mapped_column(Date)
    mode: Mapped[str] = mapped_column(String(20))
    reference: Mapped[str | None] = mapped_column(String(120))  # n° de chèque, libellé du virement…
    note: Mapped[str | None] = mapped_column(Text)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_by: Mapped[str | None] = mapped_column(String(200))
    cancel_reason: Mapped[str | None] = mapped_column(Text)

    invoice: Mapped[Invoice] = relationship(back_populates="payments")
