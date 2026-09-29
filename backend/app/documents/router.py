"""API des dossiers de pièces."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.auth.models import User
from app.auth.security import DB, PERMISSIONS, CurrentUser, Reader
from app.core.errors import NotFoundError
from app.documents import storage
from app.documents.service import dossier_status, request_document, upload
from app.training import models as t

router = APIRouter(prefix="/api/v1", tags=["dossiers"])

# Qui peut déposer ou demander une pièce, selon le dossier.
WRITE_PERMISSION = {"ORGANISME": "write_quality", "FORMATEUR": "write_training"}


def _require_for(user: User, subject: str) -> None:
    perm = WRITE_PERMISSION.get(subject)
    if perm is None or perm not in PERMISSIONS.get(user.role, set()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Permission « {perm or 'inconnue'} » requise pour ce dossier")


@router.post("/dossiers/{subject}/{subject_id}/pieces/{requirement}")
async def upload_piece(subject: str, subject_id: str, requirement: str, db: DB, user: CurrentUser,
                       file: Annotated[UploadFile, File()]) -> dict:
    _require_for(user, subject)
    content = await file.read(storage.MAX_BYTES + 1)
    doc = upload(db, subject=subject, subject_id=subject_id, requirement=requirement, content=content,
                 filename=file.filename or requirement, mime=file.content_type or "", actor_id=user.id)
    db.commit()
    return {"id": doc.id, "version": doc.version, "sha256": doc.sha256, "size": doc.size_bytes}


@router.get("/dossiers/{subject}/{subject_id}")
def get_dossier(subject: str, subject_id: str, db: DB, _: Reader) -> dict:
    return dossier_status(db, subject, subject_id)


@router.get("/documents/{document_id}/contenu")
def download(document_id: str, db: DB, _: Reader) -> Response:
    doc = db.get(t.Document, document_id)
    if doc is None or not doc.storage_path:
        raise NotFoundError("Document introuvable")
    content = storage.read(doc.storage_path, expected_sha256=doc.sha256)
    name = (doc.original_name or doc.title).replace('"', "")
    return Response(content, media_type=doc.mime_type,
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "X-Content-SHA256": doc.sha256 or ""})


class RequestIn(BaseModel):
    requested_from: str
    due_on: date
    message: str | None = None


@router.post("/dossiers/{subject}/{subject_id}/demandes/{requirement}")
def ask_piece(subject: str, subject_id: str, requirement: str, body: RequestIn, db: DB, user: CurrentUser) -> dict:
    _require_for(user, subject)
    req = request_document(db, subject=subject, subject_id=subject_id, requirement=requirement,
                           requested_from=body.requested_from, due_on=body.due_on, message=body.message)
    db.commit()
    return {"id": req.id, "status": req.status, "due_on": req.due_on.isoformat()}
