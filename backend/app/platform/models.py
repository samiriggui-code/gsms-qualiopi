"""Tables du socle de configuration (schéma `config`)."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import JSON, Boolean, Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, new_id

C = {"schema": "config"}


class FeatureState(TimestampMixin, Base):
    """Activation d'une fonctionnalité par l'organisme (l'historique est dans le journal)."""

    __tablename__ = "feature_state"
    __table_args__ = C

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    feature: Mapped[str] = mapped_column(String(60), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean)


class SettingValue(TimestampMixin, Base):
    """Valeur d'un réglage à partir d'une date. Table en ajout seul : on ne réécrit jamais une ligne."""

    __tablename__ = "setting_value"
    __table_args__ = C

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(120), index=True)
    value: Mapped[Any] = mapped_column(JSON)
    effective_from: Mapped[date] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(Text)
