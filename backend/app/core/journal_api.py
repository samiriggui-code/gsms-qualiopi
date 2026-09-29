"""Lecture du journal des modifications d'une donnée métier."""

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.auth.security import DB, JournalReader
from app.core.journal import ChangeLog

router = APIRouter(prefix="/api/v1/journal", tags=["journal"])


@router.get("")
def history(db: DB, _: JournalReader, table: str = Query(..., examples=["formation.positioning"]), entity_id: str = Query(...)) -> list[dict]:
    rows = db.scalars(
        select(ChangeLog).where(ChangeLog.table_name == table, ChangeLog.entity_id == entity_id).order_by(ChangeLog.id)
    )
    return [
        {"action": r.action, "changes": r.changes, "actor": r.actor, "at": r.at.isoformat()}
        for r in rows
    ]
