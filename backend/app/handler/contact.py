"""Formulaire de contact du site (`landing/app/widgets.tsx`) : `POST /api/v1/public/contact`, sans compte.

Le message est transmis à l'équipe par le journal des communications (`relances/contact.py`). Refus au format
de la préinscription : `{error, detail, message}`, `message` étant le texte affiché par le formulaire. Rien de
la personne n'est journalisé (ni nom, ni adresse, ni contenu).
"""

from __future__ import annotations

import json
import math
import re

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.application.service.relances import contact
from app.common.journal import set_actor
from app.common.limites import Limite, client_ip
from app.handler.preinscriptions import PUBLIC_ACTOR, _refusal
from app.middleware.auth import DB

router = APIRouter(prefix="/api/v1/public", tags=["public"])

MAX_BODY_BYTES = 16 * 1024
EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
# 5 messages valides par adresse sur 10 min, comme la préinscription.
CONTACT_PAR_ADRESSE = Limite(5, 600.0)
FIELD_LABELS = {"name": "nom", "email": "e-mail", "subject": "objet", "message": "message"}
OK = {"message": "Message envoyé : l'organisme vous répond rapidement."}


class ContactIn(BaseModel):
    """Corps envoyé par le formulaire (mêmes noms de champs, mêmes longueurs minimales)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=3, max_length=200)
    subject: str = Field(min_length=5, max_length=200)
    message: str = Field(min_length=10, max_length=5000)
    trap: str = Field("", alias="_trap", max_length=200)  # champ caché : rempli par un robot seulement

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        if not EMAIL.match(value):
            raise ValueError("adresse e-mail invalide")
        return value.lower()

    @field_validator("name", "subject")
    @classmethod
    def _one_line(cls, value: str) -> str:
        return " ".join(value.split())  # pas de retour à la ligne dans l'objet de l'e-mail


def _details(exc: ValidationError) -> list[dict]:
    out = []
    for err in exc.errors():
        field = str(err["loc"][0]) if err["loc"] else ""
        label = FIELD_LABELS.get(field, field or "formulaire")
        kind = err["type"]
        if kind == "missing":
            reason = "à renseigner"
        elif kind == "extra_forbidden":
            reason = "champ inconnu"
        elif kind == "string_too_short":
            reason = f"{err['ctx']['min_length']} caractères au moins"
        elif kind == "string_too_long":
            reason = f"{err['ctx']['max_length']} caractères au plus"
        else:
            reason = str(err.get("ctx", {}).get("error", "")) or "valeur invalide"
        out.append({"champ": field, "message": f"{label.capitalize()} : {reason}"})
    return out


@router.post("/contact", status_code=201)
async def send(request: Request, db: DB) -> JSONResponse:
    """Message envoyé par le formulaire de contact du site."""
    too_big = _refusal(413, "trop_volumineux", "Message trop long : raccourcissez-le.")
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        return too_big
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            return too_big
        chunks.append(chunk)
    try:
        body = json.loads(b"".join(chunks) or b"null")
    except ValueError:
        body = None
    if not isinstance(body, dict):
        return _refusal(400, "illisible", "Message illisible : renvoyez le formulaire.")
    try:
        data = ContactIn.model_validate(body)
    except ValidationError as exc:
        details = _details(exc)
        return _refusal(422, "invalid_state", details[0]["message"] if len(details) == 1
                        else f"{len(details)} champs à corriger : {' ; '.join(d['message'] for d in details)}", details)
    if data.trap:
        return JSONResponse(status_code=201, content=OK)  # robot : même réponse, rien n'est transmis
    ip = client_ip(request)
    if wait := CONTACT_PAR_ADRESSE.attente(ip):
        refused = _refusal(429, "trop_de_demandes", "Trop de messages envoyés depuis cette adresse : réessayez dans quelques minutes.")
        refused.headers["Retry-After"] = str(math.ceil(wait))
        return refused
    CONTACT_PAR_ADRESSE.compter(ip)

    def save() -> None:
        set_actor(db, PUBLIC_ACTOR)
        contact.submit(db, data.name, data.email, data.subject, data.message)
        db.commit()

    await run_in_threadpool(save)
    return JSONResponse(status_code=201, content=OK)
