"""API du parcours du stagiaire."""

from fastapi import APIRouter, Body
from fastapi.responses import Response

from app.auth.security import DB, SessionsReader
from app.core.errors import NotFoundError
from app.documents import storage
from app.journey import documents, service
from app.training import models as t
from app.training.access import visible_session

router = APIRouter(prefix="/api/v1", tags=["parcours"])


def _enrollment(db, user, enrollment_id: str) -> t.Enrollment:  # noqa: ANN001
    e = db.get(t.Enrollment, enrollment_id)
    if e is None:
        raise NotFoundError("Inscription introuvable")
    visible_session(db, user, e.session_id)  # hors portée : introuvable
    return e


@router.get("/sessions/{session_id}/parcours")
def session_journey(session_id: str, db: DB, user: SessionsReader) -> dict:
    """Stagiaires × étapes : ce qui est fait, et les actions possibles pour chacun."""
    return service.session_journey(db, visible_session(db, user, session_id), user)


@router.get("/inscriptions/{enrollment_id}/parcours")
def journey(enrollment_id: str, db: DB, user: SessionsReader) -> dict:
    return service.journey_view(db, _enrollment(db, user, enrollment_id), user)


@router.post("/inscriptions/{enrollment_id}/parcours/{action}")
def act(enrollment_id: str, action: str, db: DB, user: SessionsReader, body: dict = Body(default_factory=dict)) -> dict:  # noqa: B008
    """Une étape du parcours. Refus motivé (409, code et détail) si elle n'est pas possible maintenant."""
    e = _enrollment(db, user, enrollment_id)
    produced = service.apply(db, e, action, body, user)
    db.commit()
    return {"produit": produced, "parcours": service.journey_view(db, e, user)}


@router.get("/inscriptions/{enrollment_id}/documents/{document_id}")
def document(enrollment_id: str, document_id: str, db: DB, user: SessionsReader) -> Response:
    """Document rédigé par le moteur (convocation, attestation), vérifié contre son empreinte."""
    e = _enrollment(db, user, enrollment_id)
    doc = db.get(t.Document, document_id)
    if doc is None or doc.entity_type != documents.ENTITY or doc.entity_id != e.id or not doc.storage_path:
        raise NotFoundError("Document introuvable")
    content = storage.read(doc.storage_path, expected_sha256=doc.sha256)
    return Response(content, media_type=doc.mime_type,
                    headers={"Content-Disposition": f'inline; filename="{doc.original_name}"', "X-Content-SHA256": doc.sha256 or ""})
