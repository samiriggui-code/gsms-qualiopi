"""Routes publiques (sans compte) : questionnaire et document d'un stagiaire, par lien signé."""

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends
from fastapi.responses import Response

from app.application.service.documents import storage
from app.application.service.questionnaires import service, tokens
from app.common.downloads import content_disposition
from app.common.limites import Limite, par_adresse
from app.errors.errors import NotFoundError
from app.middleware.auth import DB
from app.types import training as t

# Pages publiques par lien signé : 300 requêtes par adresse sur 10 min (une salle derrière une même box reste servie).
PUBLIC_PAR_ADRESSE = Limite(300, 600.0)
router = APIRouter(prefix="/api/v1/public", tags=["public"], dependencies=[Depends(par_adresse(
    PUBLIC_PAR_ADRESSE, "Trop de demandes depuis cette adresse : réessayez dans quelques minutes."))])


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
    link = tokens.verify_document(token)
    doc = db.get(t.Document, link.document_id) if link else None
    if doc is None or doc.entity_id != link.enrollment_id or not doc.storage_path:
        raise NotFoundError("Lien invalide")
    now = datetime.now(UTC)
    # Lien d'avant l'expiration signée : valable jusqu'à DOCUMENT_LINK_DAYS après l'émission du document.
    expires_at = link.expires_at or doc.created_at + timedelta(days=tokens.DOCUMENT_LINK_DAYS)
    if now >= expires_at:
        raise service.LinkClosed("Ce lien a expiré. Ouvrez votre espace stagiaire ou contactez l'organisme de formation "
                                 "pour recevoir le document.")
    content = storage.read(doc.storage_path, expected_sha256=doc.sha256)
    return Response(content, media_type=doc.mime_type,
                    headers={"Content-Disposition": content_disposition(doc.original_name, inline=True), "X-Content-SHA256": doc.sha256 or ""})


@router.get("/espace/{token}")
def espace(token: str, db: DB) -> dict:
    """Espace du stagiaire : sa formation, ce qui reste à faire, ses documents (journey/espace.py)."""
    from app.application.service.journey import espace as espace_view

    return espace_view.public_view(db, token)
