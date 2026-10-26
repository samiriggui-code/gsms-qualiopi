"""Session du moteur IA pour le back-office.

Le back-office reprend les écrans WeKnora tels quels ; ils parlent directement au moteur IA (préfixe /ia/).
Une seule connexion pour l'utilisateur : après s'être connecté à GSMS, le front demande ici une session
WeKnora. GSMS ouvre celle du compte de service de l'organisme (créé au premier appel) et renvoie la
réponse de connexion WeKnora telle quelle, que le front enregistre comme le ferait l'écran WeKnora.
"""

import json
import urllib.error
import urllib.request

from app.config.config import get_settings


class IAUnavailable(Exception):
    """Moteur IA non configuré ou injoignable."""


def _post(path: str, payload: dict) -> tuple[int, dict]:
    url = get_settings().weknora_url.rstrip("/") + path
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Accept-Language": "fr-FR"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (URL fixée par la configuration)
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body or b"{}")
        except ValueError:
            return e.code, {}
    except (urllib.error.URLError, TimeoutError) as e:
        raise IAUnavailable(f"Moteur IA injoignable : {e}") from e


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
