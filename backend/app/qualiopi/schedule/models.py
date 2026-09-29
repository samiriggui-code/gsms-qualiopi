"""Échéancier : état de chaque jalon du circuit pour chaque session (calculé par le moteur)."""

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, new_id, utcnow

# A_VENIR     échéance lointaine
# A_ECHEANCE  dans la fenêtre d'alerte, pas encore fait
# EN_RETARD   échéance dépassée, pas fait
# FAIT        une preuve exploitable pour chaque personne concernée
# SANS_OBJET  personne n'est concerné (ex. aucun apprenant terminé)
MILESTONE_STATUSES = ("A_VENIR", "A_ECHEANCE", "EN_RETARD", "FAIT", "SANS_OBJET")


class MilestoneStatus(Base):
    __tablename__ = "milestone_status"
    __table_args__ = (UniqueConstraint("session_id", "key"), {"schema": "qualite"})

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    circuit: Mapped[str] = mapped_column(String(40))
    session_id: Mapped[str] = mapped_column(String(36), index=True)
    key: Mapped[str] = mapped_column(String(80))
    label: Mapped[str] = mapped_column(String(200))
    owner: Mapped[str] = mapped_column(String(20))
    due_on: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    done: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    missing: Mapped[list[dict]] = mapped_column(JSON, default=list)
    indicators: Mapped[list[int]] = mapped_column(JSON, default=list)
    explanation: Mapped[str] = mapped_column(String(500))
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
