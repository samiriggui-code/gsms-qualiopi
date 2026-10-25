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


@router.get("/recent")
def recent(db: DB, _: JournalReader, table: str | None = None, acteur: str | None = None,
           avant: int | None = None, limite: int = 100) -> dict:
    """Le fil des dernières modifications, toutes données confondues (écran « Journal d'activité »).

    Pagination par `avant` (identifiant de la dernière ligne reçue) : stable même si le journal grandit."""
    size = max(1, min(limite, 200))
    q = select(ChangeLog).order_by(ChangeLog.id.desc()).limit(size)
    if table:
        q = q.where(ChangeLog.table_name == table)
    if acteur:
        q = q.where(ChangeLog.actor == acteur)
    if avant is not None:
        q = q.where(ChangeLog.id < avant)
    rows = list(db.scalars(q))
    tables = sorted(db.scalars(select(ChangeLog.table_name).distinct()))
    return {
        "lignes": [{"id": r.id, "table": r.table_name, "entite": r.entity_id, "action": r.action,
                    "champs": sorted(r.changes or {}), "changes": r.changes, "actor": r.actor, "at": r.at.isoformat()}
                   for r in rows],
        "tables": tables,
        "suite": rows[-1].id if len(rows) == size else None,  # page pleine : il peut en rester
    }
