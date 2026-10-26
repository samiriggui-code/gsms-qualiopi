"""Session du moteur IA pour le back-office.

Le back-office reprend les écrans WeKnora tels quels ; ils parlent directement au moteur IA (préfixe /ia/).
Une seule connexion pour l'utilisateur : après s'être connecté à GSMS, le front demande ici une session
WeKnora. GSMS ouvre celle du compte de service de l'organisme (créé au premier appel) et renvoie la
réponse de connexion WeKnora telle quelle, que le front enregistre comme le ferait l'écran WeKnora.
"""

from app.application.service.ia.weknora import IAUnavailable, call
from app.config.config import get_settings

__all__ = ["IAUnavailable", "open_session"]


def _post(path: str, payload: dict) -> tuple[int, dict]:
    return call("POST", path, payload, timeout=15)


def open_session() -> dict:
    """Connexion WeKnora du compte de service ; inscription automatique au tout premier appel."""
    s = get_settings()
    if not (s.weknora_url and s.weknora_service_email and s.weknora_service_password):
        raise IAUnavailable("Moteur IA non configuré (WEKNORA_URL, WEKNORA_SERVICE_EMAIL, WEKNORA_SERVICE_PASSWORD)")
    credentials = {"email": s.weknora_service_email, "password": s.weknora_service_password}
    status, body = _post("/api/v1/auth/login", credentials)
    if not (status == 200 and body.get("token")):
        _post("/api/v1/auth/register", {"username": s.weknora_service_name, **credentials})
        status, body = _post("/api/v1/auth/login", credentials)
    if not (status == 200 and body.get("token")):
        raise IAUnavailable("Connexion au moteur IA refusée")
    return body
