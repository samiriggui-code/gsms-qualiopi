"""Client HTTP minimal de l'API du moteur IA (fork WeKnora), sans dépendance supplémentaire.

Toutes les requêtes vers le moteur passent par `call` : les tests le remplacent par un moteur simulé.
"""

import http.client
import json
import urllib.error
import urllib.request

from app.config.config import get_settings


class IAUnavailable(Exception):
    """Moteur IA non configuré ou injoignable."""


def _decode(raw: bytes) -> dict:
    """Corps JSON objet, ou {} (page HTML d'un proxy, liste, valeur seule…)."""
    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def call(method: str, path: str, payload: dict | None = None, token: str | None = None,
         timeout: float = 30) -> tuple[int, dict]:
    """Appel JSON au moteur IA ; renvoie (statut HTTP, corps décodé). Lève IAUnavailable s'il ne répond pas."""
    url = get_settings().weknora_url.rstrip("/") + path
    headers = {"Content-Type": "application/json", "Accept-Language": "fr-FR"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (URL fixée par la configuration)
            return resp.status, _decode(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, _decode(e.read())
    except (OSError, http.client.HTTPException) as e:  # URLError, délai, connexion coupée, lecture incomplète
        raise IAUnavailable(f"Moteur IA injoignable : {e}") from e


def message_of(body: dict) -> str:
    """Message d'erreur lisible d'une réponse WeKnora (formes `error.message`, `message` ou `error`)."""
    err = body.get("error")
    if isinstance(err, dict):
        detail = err.get("details") or err.get("message") or ""
        return str(err.get("message") or "") + (f" ({detail})" if detail and detail != err.get("message") else "")
    return str(body.get("message") or err or "réponse sans détail")
