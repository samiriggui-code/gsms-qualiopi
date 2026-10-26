"""API Moteur IA : ouverture de la session WeKnora du back-office (une seule connexion pour l'utilisateur)."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.application.service.ia.espace import ensure_mcp_service
from app.application.service.ia.session import IAUnavailable, open_session
from app.middleware.auth import DB, require
from app.types.auth import User

router = APIRouter(prefix="/api/v1/ia", tags=["ia"])
log = logging.getLogger(__name__)


IAUser = Annotated[User, Depends(require("ia.use"))]


@router.post("/session")
def ia_session(user: IAUser, db: DB) -> dict:  # noqa: ARG001 (permission « ia.use » exigée)
    """Réponse de connexion WeKnora du compte navigateur (jeton, utilisateur, espace), sans jeton de renouvellement.

    Le front rappelle cette route pour prolonger la session : le compte GSMS est ainsi revérifié (actif, `ia.use`).
    Au passage, le serveur MCP du moteur Qualiopi est déclaré dans l'espace s'il ne l'est pas (idempotent).
    Un échec de cette déclaration n'empêche jamais la session : il est rendu dans `gsms_mcp`."""
    try:
        session = open_session()
    except IAUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    body = dict(session.browser)
    try:
        body["gsms_mcp"] = ensure_mcp_service(db, session.service_token).view()
    except Exception as e:  # noqa: BLE001 (la session reste utilisable sans les outils Qualiopi)
        db.rollback()
        log.warning("Déclaration du serveur MCP impossible : %s", e)
        body["gsms_mcp"] = {"ok": False, "fait": [], "a_regler": [f"Serveur MCP non déclaré : {e}"]}
    return body
