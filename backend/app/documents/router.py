"""API des dossiers de pièces."""

import json
from datetime import date
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.auth.models import User
from app.auth.security import DB, CurrentUser, QualityReader, permissions_of
from app.core.downloads import content_disposition
from app.core.errors import NotFoundError
from app.documents import storage
from app.documents.dossier import modele_text
from app.documents.service import declare_paper, dossier_status, request_document, upload
from app.training import models as t

router = APIRouter(prefix="/api/v1", tags=["dossiers"])

# Qui peut déposer ou demander une pièce, selon le dossier.
WRITE_PERMISSION = {"ORGANISME": "quality.write", "FORMATEUR": "trainers.write"}


def _require_for(db, user: User, subject: str) -> None:  # noqa: ANN001
    perm = WRITE_PERMISSION.get(subject)
    if perm is None or perm not in permissions_of(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Permission « {perm or 'inconnue'} » requise pour ce dossier")


@router.post("/dossiers/{subject}/{subject_id}/pieces/{requirement}")
async def upload_piece(subject: str, subject_id: str, requirement: str, db: DB, user: CurrentUser,
                       file: Annotated[UploadFile, File()],
                       grille: Annotated[str | None, Form(description='JSON {"POINT": "OUI" | "NON" | "SANS_OBJET"}')] = None,
                       note: Annotated[str | None, Form()] = None) -> dict:
    """Dépôt d'un fichier. `grille` : les points de la pièce cochés par la personne qui dépose."""
    _require_for(db, user, subject)
    try:
        checklist = json.loads(grille) if grille else None
    except json.JSONDecodeError:
        raise HTTPException(422, "grille : JSON invalide") from None
    content = await file.read(storage.MAX_BYTES + 1)
    doc = upload(db, subject=subject, subject_id=subject_id, requirement=requirement, content=content,
                 filename=file.filename or requirement, mime=file.content_type or "", actor_id=user.id,
                 checklist=checklist, note=note)
    db.commit()
    return {"id": doc.id, "version": doc.version, "sha256": doc.sha256, "size": doc.size_bytes}


class PaperIn(BaseModel):
    grille: dict[str, str]
    lieu: str  # où l'original papier est conservé
    note: str | None = None


@router.post("/dossiers/{subject}/{subject_id}/pieces/{requirement}/papier")
def declare_paper_piece(subject: str, subject_id: str, requirement: str, body: PaperIn, db: DB, user: CurrentUser) -> dict:
    """Pièce conservée sur papier : on déclare où elle est et on coche sa grille."""
    _require_for(db, user, subject)
    doc = declare_paper(db, subject=subject, subject_id=subject_id, requirement=requirement, checklist=body.grille,
                        location=body.lieu, note=body.note, actor_id=user.id)
    db.commit()
    return {"id": doc.id, "version": doc.version, "support": doc.support, "sha256": doc.sha256}


@router.get("/dossiers/{subject}/modeles/{requirement}")
def download_modele(subject: str, requirement: str, _: QualityReader) -> Response:
    """Trame de rédaction de la pièce (Markdown), à compléter puis à déposer."""
    return Response(modele_text(subject, requirement), media_type="text/markdown; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{requirement}.md"'})


@router.get("/dossiers/{subject}/{subject_id}")
def get_dossier(subject: str, subject_id: str, db: DB, _: QualityReader) -> dict:
    return dossier_status(db, subject, subject_id)


@router.get("/documents/{document_id}/contenu")
def download(document_id: str, db: DB, user: QualityReader) -> Response:
    doc = db.get(t.Document, document_id)
    if doc is None or not doc.storage_path:
        raise NotFoundError("Document introuvable")
    if doc.entity_type == "EDOF":
        # Pièces de référencement : droits EDOF, et pièces d'identité ou d'honorabilité réservées.
        needed = "edof.sensitive" if doc.kind == "EDOF_SENSIBLE" else "edof.read"
        if needed not in permissions_of(db, user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Pièce de référencement EDOF : accès réservé")
    content = storage.read(doc.storage_path, expected_sha256=doc.sha256)
    name = (doc.original_name or doc.title).replace('"', "")
    return Response(content, media_type=doc.mime_type,
                    headers={"Content-Disposition": content_disposition(name), "X-Content-SHA256": doc.sha256 or ""})


class RequestIn(BaseModel):
    requested_from: str
    due_on: date
    message: str | None = None


@router.post("/dossiers/{subject}/{subject_id}/demandes/{requirement}")
def ask_piece(subject: str, subject_id: str, requirement: str, body: RequestIn, db: DB, user: CurrentUser) -> dict:
    _require_for(db, user, subject)
    req = request_document(db, subject=subject, subject_id=subject_id, requirement=requirement,
                           requested_from=body.requested_from, due_on=body.due_on, message=body.message)
    db.commit()
    return {"id": req.id, "status": req.status, "due_on": req.due_on.isoformat()}
