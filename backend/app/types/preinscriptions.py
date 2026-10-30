"""Demandes de préinscription reçues par le formulaire public du site (landing).

Une demande n'est ni un stagiaire ni une inscription : c'est ce que le candidat a déclaré, tel quel.
L'organisme la prend en charge, la refuse (motif) ou la convertit en stagiaire inscrit à une session.
Schéma PostgreSQL : `formation` (journal des modifications automatique).
"""

import re
from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.db import Base, TimestampMixin, new_id

STATUSES = {
    "NOUVELLE": "Nouvelle",
    "EN_COURS": "En cours de traitement",
    "CONVERTIE": "Convertie en stagiaire",
    "REFUSEE": "Refusée",
}
OPEN_STATUSES = ("NOUVELLE", "EN_COURS")
CIVILITIES = {"M": "Monsieur", "MME": "Madame"}
POSTAL_CODE = re.compile(r"^\d{5}$")


def check_birth_date(value: date) -> date:
    """Date de naissance plausible (passée, après 1900) ; lève ValueError sinon."""
    if value >= date.today() or value.year < 1900:
        raise ValueError("date invalide")
    return value

# Déclarations cochées par le candidat (onglet « Conformité » du formulaire), toutes requises par le formulaire.
COMPLIANCE = {
    "hasValidIdentityDocument": "Pièce d'identité en cours de validité",
    "hasNoIncompatibleConviction": "Aucune condamnation incompatible avec l'activité",
    "meetsFormationPrerequisites": "Prérequis de la formation remplis",
    "acceptsInternalRules": "Règlement intérieur accepté",
    "acknowledgesCnapsHandledBySchool": "Démarches CNAPS menées par l'école",
    "certifiesInformationAccuracy": "Exactitude des informations certifiée",
}


def _fk(table: str) -> ForeignKey:
    return ForeignKey(f"formation.{table}.id", ondelete="SET NULL")


class Preinscription(TimestampMixin, Base):
    __tablename__ = "preinscription"
    __table_args__ = {"schema": "formation"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="NOUVELLE", index=True)  # STATUSES
    # Identité et coordonnées
    civility: Mapped[str] = mapped_column(String(5))
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    usage_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), index=True)
    phone: Mapped[str] = mapped_column(String(40))
    birth_date: Mapped[date] = mapped_column(Date)
    birth_city: Mapped[str] = mapped_column(String(120))
    birth_department: Mapped[str | None] = mapped_column(String(60))
    birth_country: Mapped[str] = mapped_column(String(80))
    nationality: Mapped[str] = mapped_column(String(80))
    address: Mapped[str] = mapped_column(String(300))
    postal_code: Mapped[str] = mapped_column(String(10))
    city: Mapped[str] = mapped_column(String(120))
    # Projet : formation et session souhaitées, financement envisagé, situation
    formation_slug: Mapped[str] = mapped_column(String(80))
    formation_name: Mapped[str | None] = mapped_column(String(250))
    program_id: Mapped[str | None] = mapped_column(_fk("program"))  # formation du catalogue reconnue (catalog_slug)
    session_label: Mapped[str | None] = mapped_column(String(300))  # session choisie ou dates souhaitées, en clair
    funding_mode: Mapped[str] = mapped_column(String(80))  # libellé choisi dans le formulaire
    current_situation: Mapped[str] = mapped_column(String(300))
    experience: Mapped[str | None] = mapped_column(Text)
    motivation: Mapped[str | None] = mapped_column(Text)
    compliance: Mapped[dict] = mapped_column(JSON, default=dict)  # {clé de COMPLIANCE: true}
    consented_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # réception des déclarations cochées
    source_context: Mapped[str | None] = mapped_column(String(80))  # bouton ou page d'origine
    # Traitement
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handled_by: Mapped[str | None] = mapped_column(String(200))
    refusal_reason: Mapped[str | None] = mapped_column(Text)
    session_id: Mapped[str | None] = mapped_column(_fk("session"))  # session d'inscription à la conversion
    learner_id: Mapped[str | None] = mapped_column(_fk("learner"))
    enrollment_id: Mapped[str | None] = mapped_column(_fk("enrollment"))
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"
