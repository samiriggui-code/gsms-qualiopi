"""Journal des communications : chaque message prévu, validé, envoyé ou annulé, et pourquoi.

Un message est rédigé au moment où il est planifié : ce que la personne valide est exactement ce qui
part. L'empreinte SHA-256 du contenu est conservée ; la clé d'occurrence rend la planification
idempotente (une règle, une personne, une échéance → un seul message, jamais de doublon).
"""

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, new_id

S = {"schema": "communication"}

# A_VALIDER   rédigé, attend un clic avant d'être envoyé (messages aux stagiaires et entreprises, au début)
# PREVU       partira au prochain passage du worker (à sa date)
# ENVOYE      accepté par le serveur d'envoi
# ECHEC       refusé après plusieurs tentatives
# ANNULE      devenu sans objet (déjà fait) ou annulé par une personne, avec le motif
# SANS_ADRESSE  personne à prévenir sans adresse e-mail : rien ne part, c'est signalé
MESSAGE_STATUSES = ("A_VALIDER", "PREVU", "ENVOYE", "ECHEC", "ANNULE", "SANS_ADRESSE")


class Message(TimestampMixin, Base):
    __tablename__ = "message"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(40), unique=True)  # MSG-000001
    occurrence_key: Mapped[str] = mapped_column(String(300), unique=True)
    rule_key: Mapped[str] = mapped_column(String(80), index=True)
    template: Mapped[str] = mapped_column(String(80))
    template_version: Mapped[int] = mapped_column(Integer)
    channel: Mapped[str] = mapped_column(String(20), default="EMAIL")
    external: Mapped[bool] = mapped_column(default=False)  # destinataire hors de l'organisme
    recipient_kind: Mapped[str] = mapped_column(String(30))  # STAGIAIRE, ENTREPRISE, FORMATEUR, GESTION, QUALITE
    recipient_name: Mapped[str | None] = mapped_column(String(200))
    recipient_email: Mapped[str | None] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(300))
    body_html: Mapped[str] = mapped_column(Text)
    body_text: Mapped[str] = mapped_column(Text)
    body_sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), index=True)
    due_on: Mapped[date] = mapped_column(Date, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), index=True)
    enrollment_id: Mapped[str | None] = mapped_column(String(36), index=True)
    milestone_key: Mapped[str | None] = mapped_column(String(80))
    indicators: Mapped[list[int]] = mapped_column(JSON, default=list)
    validated_by: Mapped[str | None] = mapped_column(String(200))
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_message_id: Mapped[str | None] = mapped_column(String(300))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    cancel_reason: Mapped[str | None] = mapped_column(Text)
