"""Routes publiques (sans compte) : questionnaire et document d'un stagiaire, par lien signé."""

from typing import Any

from fastapi import APIRouter, Body
from fastapi.responses import Response

from app.auth.security import DB
from app.core.downloads import content_disposition
from app.core.errors import NotFoundError
from app.documents import storage
from app.questionnaires import service, tokens
from app.training import models as t

router = APIRouter(prefix="/api/v1/public", tags=["public"])


@router.get("/questionnaires/{token}")
def questionnaire(token: str, db: DB) -> dict:
    view = service.public_view(db, token)
    db.commit()  # date d'ouverture
    return view


@router.post("/questionnaires/{token}")
def answer(token: str, db: DB, body: dict[str, Any] = Body(...)) -> dict:  # noqa: B008
    result = service.submit(db, token, body.get("reponses") or {})
    db.commit()
    return result


@router.get("/documents/{token}")
def document(token: str, db: DB) -> Response:
    """Convocation ou attestation envoyée au stagiaire : le fichier figé, vérifié contre son empreinte."""
    value = tokens.verify("document", token)
    doc = db.get(t.Document, value.split(":", 1)[1]) if value and ":" in value else None
    if doc is None or doc.entity_id != value.split(":", 1)[0] or not doc.storage_path:
        raise NotFoundError("Lien invalide")
    content = storage.read(doc.storage_path, expected_sha256=doc.sha256)
    return Response(content, media_type=doc.mime_type,
                    headers={"Content-Disposition": content_disposition(doc.original_name, inline=True), "X-Content-SHA256": doc.sha256 or ""})
