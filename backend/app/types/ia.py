"""Traces des analyses demandées au moteur IA (contrat `gsms.ia.analyse-indicateur`).

Une ligne par analyse : qui l'a demandée, sur quoi, avec quelle version du référentiel, quels documents ont été
consultés, combien de temps, avec quel résultat technique. Jamais le texte des documents ni la question posée :
seule son empreinte, pour rapprocher deux demandes identiques sans garder de données personnelles.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.db import Base, new_id, utcnow

# Résultat technique de la recherche documentaire (pas un état de préparation Qualiopi).
REFERENCE_STATUSES = ("REFERENCES_RETROUVEES", "AUCUNE_REFERENCE", "ERREUR_TECHNIQUE")
# Validation humaine de l'analyse : aucune proposition n'est encore produite, rien n'est à valider.
VALIDATION_STATUSES = ("NON_DEMANDEE",)


class IAAnalysis(Base):
    __tablename__ = "ia_analyse"
    __table_args__ = {"schema": "qualite"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)  # identifiant de corrélation
    contract: Mapped[str] = mapped_column(String(60))
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    indicator_number: Mapped[int] = mapped_column(Integer, index=True)
    referential_version: Mapped[str] = mapped_column(String(20))
    engine_status: Mapped[str] = mapped_column(String(30))  # état de préparation rendu par le moteur Qualiopi
    question_sha256: Mapped[str | None] = mapped_column(String(64))
    allowed_documents: Mapped[list[str]] = mapped_column(JSON, default=list)
    consulted_documents: Mapped[list[str]] = mapped_column(JSON, default=list)
    chunk_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    rejected_references: Mapped[int] = mapped_column(Integer, default=0)
    embedding_model: Mapped[str | None] = mapped_column(String(120))
    reference_status: Mapped[str] = mapped_column(String(30))
    error: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[int] = mapped_column(Integer)
    validation_status: Mapped[str] = mapped_column(String(30), default="NON_DEMANDEE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
