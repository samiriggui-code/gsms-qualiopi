"""Outbox : chaque écriture métier enregistre son événement dans la même transaction.

Le moteur Qualiopi consomme cette table (en ligne après la requête, ou via le worker).
Pas de bus externe : PostgreSQL suffit à ce volume.
"""

from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, Identity, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, utcnow


class OutboxEvent(Base):
    __tablename__ = "outbox_event"
    __table_args__ = {"schema": "formation"}

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(36))
    # Portée utile au moteur pour une réévaluation ciblée.
    session_id: Mapped[str | None] = mapped_column(String(36), index=True)
    program_id: Mapped[str | None] = mapped_column(String(36))
    actor_id: Mapped[str | None] = mapped_column(String(36))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    error: Mapped[str | None] = mapped_column(Text)
