"""Journal des modifications métier (idée reprise du `Version` de Frappe).

Chaque création, modification ou suppression d'une donnée métier est enregistrée avec
l'auteur, la date et le détail champ par champ. Le moteur sait déjà qu'une preuve a changé
(empreinte de la source) ; le journal dit QUI a changé la donnée, et QUOI.

L'auteur est porté par la session SQLAlchemy (`set_actor`) : l'authentification le pose sur la
session de la requête, la CLI et le worker posent le leur. Sans auteur explicite : « système ».
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, BigInteger, DateTime, Identity, String, event, inspect
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.db import Base, utcnow

DEFAULT_ACTOR = "système"
IGNORED_FIELDS = {"created_at", "updated_at", "created_by"}
MASKED_FIELDS = {"password_hash"}
# Tables écrites par des humains en dehors du schéma `formation` (le moteur a son propre historique).
JOURNALED_OUTSIDE_FORMATION = {"iam.user", "qualite.capa_action", "qualite.audit", "qualite.audit_item", "qualite.indicator_review", "qualite.certification_cycle"}
NOT_JOURNALED = {"formation.outbox_event", "formation.change_log"}


class ChangeLog(Base):
    __tablename__ = "change_log"
    __table_args__ = {"schema": "formation"}

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    table_name: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(20))  # CREATION | MODIFICATION | SUPPRESSION
    changes: Mapped[dict] = mapped_column(JSON, default=dict)  # {champ: [avant, après]}
    actor: Mapped[str] = mapped_column(String(200))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


def set_actor(session: Session, actor: str) -> None:
    session.info["actor"] = actor


def actor_of(session: Session) -> str:
    return session.info.get("actor") or DEFAULT_ACTOR


def _table(obj: object) -> str | None:
    table = getattr(obj, "__table__", None)
    if table is None:
        return None
    full = f"{table.schema}.{table.name}" if table.schema else table.name
    if full in NOT_JOURNALED:
        return None
    if table.schema == "formation" or full in JOURNALED_OUTSIDE_FORMATION:
        return full
    return None


def _json(value: object) -> object:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _snapshot(obj: object) -> dict:
    state = inspect(obj)
    out = {}
    for attr in state.mapper.column_attrs:
        key = attr.key
        if key in IGNORED_FIELDS:
            continue
        value = getattr(obj, key)
        if value is None:
            continue
        out[key] = [None, "***" if key in MASKED_FIELDS else _json(value)]
    return out


def _diff(obj: object) -> dict:
    state = inspect(obj)
    out = {}
    for attr in state.mapper.column_attrs:
        key = attr.key
        if key in IGNORED_FIELDS:
            continue
        hist = state.attrs[key].history
        if not hist.has_changes():
            continue
        before = hist.deleted[0] if hist.deleted else None
        after = hist.added[0] if hist.added else None
        if before == after:
            continue
        if key in MASKED_FIELDS:
            out[key] = ["***", "***"]
        else:
            out[key] = [_json(before), _json(after)]
    return out


def _entity_id(obj: object) -> str:
    return str(inspect(obj).identity[0] if inspect(obj).identity else getattr(obj, "id", ""))


@event.listens_for(Session, "before_flush")
def _before_flush(session: Session, flush_context, instances) -> None:  # noqa: ANN001
    actor = actor_of(session)
    pending: list[tuple[object, str, dict]] = []
    for obj in list(session.new):
        if _table(obj) is None:
            continue
        # Traçabilité « qui a produit » : created_by se remplit tout seul.
        if hasattr(obj, "created_by") and getattr(obj, "created_by", None) is None:
            obj.created_by = actor
        pending.append((obj, "CREATION", {}))
    for obj in list(session.dirty):
        if _table(obj) is None or not session.is_modified(obj, include_collections=False):
            continue
        changes = _diff(obj)
        if changes:
            session.add(ChangeLog(table_name=_table(obj), entity_id=_entity_id(obj), action="MODIFICATION", changes=changes, actor=actor))
    for obj in list(session.deleted):
        if _table(obj) is None:
            continue
        session.add(ChangeLog(table_name=_table(obj), entity_id=_entity_id(obj), action="SUPPRESSION", changes=_snapshot(obj), actor=actor))
    # Les créations sont journalisées après le flush, quand l'identifiant est connu.
    session.info.setdefault("_journal_new", []).extend(pending)


@event.listens_for(Session, "after_flush_postexec")
def _after_flush(session: Session, flush_context) -> None:  # noqa: ANN001
    pending = session.info.pop("_journal_new", [])
    for obj, action, _ in pending:
        session.add(ChangeLog(table_name=_table(obj), entity_id=_entity_id(obj), action=action, changes=_snapshot(obj), actor=actor_of(session)))
