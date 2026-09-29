"""Évaluation : résultats de contrôles, état de préparation par indicateur, constats.

États de préparation (produits par le moteur, jamais « conforme ») :
  NON_APPLICABLE        l'indicateur ne s'applique pas (catégorie d'action, non certifiant…)
  NON_EVALUE            aucun contrôle automatisé : revue humaine uniquement
  NON_EVALUABLE         données insuffisantes pour conclure (jamais de faux positif)
  PREUVES_INSUFFISANTES exigence applicable, preuves attendues absentes
  A_RISQUE              couverture partielle, preuve bientôt expirée, à surveiller
  DEMONTRABLE           les contrôles trouvent les preuves attendues
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, new_id, utcnow

Q = {"schema": "qualite"}

READINESS = ("NON_APPLICABLE", "NON_EVALUE", "NON_EVALUABLE", "PREUVES_INSUFFISANTES", "A_RISQUE", "DEMONTRABLE")
# Du pire au meilleur, pour l'agrégation.
READINESS_RANK = {
    "PREUVES_INSUFFISANTES": 0,
    "A_RISQUE": 1,
    "NON_EVALUABLE": 2,
    "NON_EVALUE": 3,
    "DEMONTRABLE": 4,
    "NON_APPLICABLE": 5,
}


class EvaluationRun(Base):
    __tablename__ = "evaluation_run"
    __table_args__ = Q

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    version_id: Mapped[str] = mapped_column(String(36))
    trigger: Mapped[str] = mapped_column(String(80))  # manuel | event:<name> | planifie
    scope: Mapped[str] = mapped_column(String(20))  # TOUT | SESSION | FORMATION | ORGANISME
    target_id: Mapped[str | None] = mapped_column(String(36))
    indicators: Mapped[list[int] | None] = mapped_column(JSON)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    results_count: Mapped[int] = mapped_column(Integer, default=0)


class ControlResult(Base):
    """Dernier résultat d'un contrôle pour une cible (remplacé à chaque évaluation, historisé par run)."""

    __tablename__ = "control_result"
    __table_args__ = (UniqueConstraint("control_id", "target_type", "target_id"), Q)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36))
    version_id: Mapped[str] = mapped_column(String(36))
    control_id: Mapped[str] = mapped_column(ForeignKey("qualite.control_definition.id", ondelete="CASCADE"))
    control_key: Mapped[str] = mapped_column(String(120))
    control_version: Mapped[int] = mapped_column(Integer)
    indicator_number: Mapped[int] = mapped_column(Integer, index=True)
    target_type: Mapped[str] = mapped_column(String(20))  # ORGANISME | FORMATION | SESSION
    target_id: Mapped[str] = mapped_column(String(36))
    session_id: Mapped[str | None] = mapped_column(String(36), index=True)
    status: Mapped[str] = mapped_column(String(30))
    human_validation_required: Mapped[bool] = mapped_column(Boolean, default=False)
    expected: Mapped[str] = mapped_column(Text)
    observed: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text)
    evidence_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    missing: Mapped[list[dict]] = mapped_column(JSON, default=list)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ControlResultHistory(Base):
    __tablename__ = "control_result_history"
    __table_args__ = Q

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), index=True)
    control_key: Mapped[str] = mapped_column(String(120))
    indicator_number: Mapped[int] = mapped_column(Integer)
    target_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(30))
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


FINDING_STATUSES = ("OUVERT", "EN_TRAITEMENT", "RESOLU", "ACCEPTE", "FAUX_POSITIF")


class Finding(TimestampMixin, Base):
    """Constat (écart) : né d'un contrôle non satisfait, clé stable pour éviter les doublons."""

    __tablename__ = "finding"
    __table_args__ = Q

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(40), unique=True)  # CST-000042
    key: Mapped[str] = mapped_column(String(300), unique=True)  # control_key|target_type|target_id
    origin: Mapped[str] = mapped_column(String(20), default="CONTROLE")  # CONTROLE | AUDIT
    indicator_number: Mapped[int] = mapped_column(Integer, index=True)
    control_key: Mapped[str | None] = mapped_column(String(120))
    target_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[str] = mapped_column(String(36))
    session_id: Mapped[str | None] = mapped_column(String(36), index=True)
    readiness: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text)
    missing: Mapped[list[dict]] = mapped_column(JSON, default=list)
    remediation: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="OUVERT", index=True)
    decision_comment: Mapped[str | None] = mapped_column(Text)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    audit_item_id: Mapped[str | None] = mapped_column(String(36))
