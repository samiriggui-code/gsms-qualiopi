"""Photos de la médiathèque : téléversement (personnes, formations) et lecture publique.

Une photo téléversée est contrôlée et débarrassée de ses métadonnées (app/common/images.py), puis rangée sous un nom
aléatoire de 128 bits. La route rend le chemin de médiathèque à mettre dans `photo_url` ou `image_url`
(« media/photos/<nom> »), que le back-office sert sous /app/media/photos/ (relais vers la lecture ci-dessous : proxy de
Vite en dev, Caddy en production).

La lecture est PUBLIQUE, sans compte : les photos de l'équipe sont affichées sur le site. Une photo de stagiaire est
donc lisible par quiconque connaît son adresse ; le nom n'est pas devinable et aucune liste n'est exposée, mais ce
n'est pas un contrôle d'accès. À dire à l'organisme avant d'en déposer.
"""

from __future__ import annotations

import re
import secrets
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from app.common.images import MAX_BYTES, ImageRefusee, clean_image
from app.common.limites import Limite, trop_de_demandes
from app.config.config import get_settings
from app.middleware.auth import require_any
from app.types.auth import User

router = APIRouter(prefix="/api/v1/medias", tags=["Médiathèque"])

# Stagiaire et formation (sessions.write), personnel (staff.write), comptes (users.manage).
Uploader = Annotated[User, Depends(require_any("sessions.write", "staff.write", "users.manage"))]
DEBIT = Limite(maximum=30, fenetre=600)  # par compte : 30 photos en 10 minutes
NAME = re.compile(r"[0-9a-f]{32}\.(jpg|png|webp)")
MIMES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def photos_dir() -> Path:
    """Dans le volume des documents (persistant) : <documents_dir>/_medias/photos."""
    return Path(get_settings().documents_dir) / "_medias" / "photos"


@router.post("/photos", status_code=201)
async def upload_photo(file: Annotated[UploadFile, File()], user: Uploader) -> dict:
    attente = DEBIT.attente(user.id)
    if attente:
        raise trop_de_demandes("Trop de photos envoyées : réessayez dans quelques minutes", attente)
    DEBIT.compter(user.id)
    data = await file.read(MAX_BYTES + 1)
    try:
        image = await run_in_threadpool(clean_image, data)  # analyse et écriture hors de la boucle d'évènements
    except ImageRefusee as exc:
        raise HTTPException(422, str(exc)) from None
    name = f"{secrets.token_hex(16)}.{image.extension}"
    await run_in_threadpool(_store, name, image.content)
    return {"chemin": f"media/photos/{name}", "type": image.mime, "largeur": image.width, "hauteur": image.height,
            "taille": len(image.content)}


def _store(name: str, content: bytes) -> None:
    folder = photos_dir()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(content)


@router.get("/photos/{name}")
def read_photo(name: str) -> FileResponse:
    if not NAME.fullmatch(name):
        raise HTTPException(404, "Photo introuvable")
    path = photos_dir() / name
    if not path.is_file():
        raise HTTPException(404, "Photo introuvable")
    return FileResponse(path, media_type=MIMES[name.rsplit(".", 1)[1]], headers={
        "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})
