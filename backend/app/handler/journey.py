"""API du parcours du stagiaire."""

from typing import Annotated

from fastapi import APIRouter, Body, Depends
from fastapi.responses import Response
from sqlalchemy import select

from app.application.access.training_scope import can_see, visible_session
from app.application.service.documents import storage
from app.application.service.journey import documents, espace, registry, service
from app.common.downloads import content_disposition
from app.errors.errors import InvalidStateError, NotFoundError
from app.middleware.auth import DB, SessionsReader, permissions_of, require
from app.types import training as t
from app.types.auth import User

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


@router.get("/parcours/synthese")
def journey_summary(db: DB, user: SessionsReader) -> dict:
    """Chiffres de la vue d'ensemble « Parcours apprenant » (mêmes états que les registres)."""
    return registry.summary(db, user)


@router.get("/parcours/registres/{vue}")
def journey_registry(vue: str, db: DB, user: SessionsReader, session_id: str | None = None) -> dict:
    """Une étape (ou les inscriptions, abandons, examens) toutes sessions visibles confondues, ce qui presse d'abord."""
    return registry.registry(db, user, vue, session_id=session_id)


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
                    headers={"Content-Disposition": content_disposition(doc.original_name, inline=True), "X-Content-SHA256": doc.sha256 or ""})


@router.get("/parcours/adaptations")
def adaptations(db: DB, user: SessionsReader) -> list[dict]:
    """Besoins d'adaptation recueillis à l'analyse du besoin (handicap, contrainte), sessions visibles seulement :
    l'écran « Handicap & accessibilité » montre ce qui a été décidé et où on en est (I20, I26).

    Le besoin lui-même touche à la santé : seuls ceux qui mènent le parcours ou forment le lisent ; les autres
    rôles (lecture, financement, RH) n'en voient que le statut."""
    detail = bool({"enrollments.write", "learners.assess"} & permissions_of(db, user))
    rows = db.scalars(
        select(t.NeedsAnalysis).where(t.NeedsAnalysis.adaptation_required.is_(True)).order_by(t.NeedsAnalysis.completed_on.desc())
    )
    out = []
    for na in rows:
        e = na.enrollment
        if not can_see(db, user, e.session):
            continue
        out.append({"inscription": e.id, "session_id": e.session_id, "session": e.session.reference,
                    "stagiaire": e.learner.full_name, "statut": na.adaptation_status,
                    "besoin": na.adaptation_notes if detail else None,
                    "recueilli_le": na.completed_on.isoformat() if na.completed_on else None})
    return out


@router.post("/inscriptions/{enrollment_id}/espace")
def espace_link(enrollment_id: str, db: DB, user: Annotated[User, Depends(require("enrollments.write"))]) -> dict:
    """Lien personnel de l'espace du stagiaire, à lui transmettre (rien n'est envoyé ici)."""
    e = _enrollment(db, user, enrollment_id)
    if e.status == "ANNULE":
        raise InvalidStateError("Inscription annulée : pas d'espace stagiaire")
    return {"lien": espace.link(e), "expire_le": espace.expires_on(e).isoformat()}
