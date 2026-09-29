"""API des communications : suivre, valider, annuler, renvoyer ; planifier à la demande."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from app.auth.models import User
from app.auth.security import DB, require
from app.relances import service
from app.relances.models import Message
from app.relances.planner import plan
from app.relances.rules import load_rules

router = APIRouter(prefix="/api/v1", tags=["communications"])
Manager = Annotated[User, Depends(require("communications.manage"))]


@router.get("/communications")
def list_messages(db: DB, _: Manager, statut: str | None = None, session_id: str | None = None,
                  limite: int = 200) -> dict:
    q = select(Message).order_by(Message.due_on.desc(), Message.created_at.desc())
    if statut:
        q = q.where(Message.status == statut)
    if session_id:
        q = q.where(Message.session_id == session_id)
    counts = dict(db.execute(select(Message.status, func.count()).group_by(Message.status)).all())
    return {"compteurs": counts, "messages": [service.message_view(m) for m in db.scalars(q.limit(min(limite, 500)))]}


@router.get("/communications/regles")
def rules(db: DB, _: Manager) -> list[dict]:
    return [r.model_dump() for r in load_rules()]


@router.get("/communications/{message_id}")
def get_message(message_id: str, db: DB, _: Manager) -> dict:
    return service.message_view(service.get_message(db, message_id), full=True)


@router.get("/communications/{message_id}/apercu", response_class=HTMLResponse)
def preview(message_id: str, db: DB, _: Manager) -> HTMLResponse:
    """Le message exactement tel qu'il part (ou est parti)."""
    return HTMLResponse(service.get_message(db, message_id).body_html)


@router.post("/communications/{message_id}/valider")
def validate(message_id: str, db: DB, user: Manager) -> dict:
    msg = service.validate(db, service.get_message(db, message_id), f"{user.full_name} <{user.email}>")
    db.commit()
    return service.message_view(msg)


class CancelIn(BaseModel):
    motif: str


@router.post("/communications/{message_id}/annuler")
def cancel(message_id: str, body: CancelIn, db: DB, user: Manager) -> dict:
    msg = service.cancel(db, service.get_message(db, message_id), body.motif, user.full_name)
    db.commit()
    return service.message_view(msg)


@router.post("/communications/{message_id}/renvoyer")
def retry(message_id: str, db: DB, _: Manager) -> dict:
    msg = service.retry(db, service.get_message(db, message_id))
    db.commit()
    return service.message_view(msg)


@router.post("/communications/planifier")
def run_now(db: DB, _: Manager, le: date | None = None) -> dict:
    """Passage immédiat du planificateur et de l'envoi (le worker le fait aussi à chaque passage)."""
    result = plan(db, le) | service.dispatch(db, le)
    db.commit()
    return result
