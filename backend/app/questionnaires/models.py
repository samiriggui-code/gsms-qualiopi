"""Invitation à un questionnaire en ligne : une par personne et par questionnaire, réutilisée par les relances."""

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, new_id

KINDS = ("BESOIN_POSITIONNEMENT", "SATISFACTION_CHAUD", "SATISFACTION_FROID", "ENTREPRISE_FROID")


class Invitation(TimestampMixin, Base):
    __tablename__ = "questionnaire_invitation"
    __table_args__ = (UniqueConstraint("enrollment_id", "kind"), {"schema": "communication"})

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(40))
    enrollment_id: Mapped[str] = mapped_column(String(36), index=True)
    session_id: Mapped[str] = mapped_column(String(36), index=True)
    respondent: Mapped[str] = mapped_column(String(20))  # STAGIAIRE | ENTREPRISE
    expires_on: Mapped[date] = mapped_column(Date)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    questionnaire_version: Mapped[int | None] = mapped_column(Integer)
    answers: Mapped[dict | None] = mapped_column(JSON)  # réponses brutes, figées avec la version du questionnaire
