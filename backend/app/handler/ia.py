"""API Moteur IA : ouverture de la session WeKnora du back-office (une seule connexion pour l'utilisateur)."""

from fastapi import APIRouter, HTTPException

from app.application.service.ia.session import IAUnavailable, open_session
from app.middleware.auth import CurrentUser

router = APIRouter(prefix="/api/v1/ia", tags=["ia"])


@router.post("/session")
def ia_session(user: CurrentUser) -> dict:  # noqa: ARG001 (réservé aux comptes connectés)
    """Réponse de connexion WeKnora (jeton, utilisateur, espace) pour les écrans IA du back-office."""
    try:
        return open_session()
    except IAUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
