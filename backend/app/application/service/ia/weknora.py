"""Client HTTP minimal de l'API du moteur IA (fork WeKnora), sans dépendance supplémentaire.

Toutes les requêtes vers le moteur passent par `call` : les tests le remplacent par un moteur simulé.
"""

import http.client
import json
import secrets
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


def upload(path: str, fields: dict[str, str], file_name: str, content: bytes, mime: str, token: str,
           timeout: float = 120) -> tuple[int, dict]:
    """Envoi d'un fichier (multipart/form-data) au moteur IA ; mêmes retours et erreurs que `call`."""
    boundary = "gsms-" + secrets.token_hex(16)
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
             for name, value in fields.items()]
    quoted = file_name.replace('"', "'").replace("\r", " ").replace("\n", " ")
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{quoted}"\r\n'
                 f"Content-Type: {mime}\r\n\r\n".encode() + content + b"\r\n")
    data = b"".join(parts) + f"--{boundary}--\r\n".encode()
    url = get_settings().weknora_url.rstrip("/") + path
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}", "Accept-Language": "fr-FR",
        "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (URL fixée par la configuration)
            return resp.status, _decode(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, _decode(e.read())
    except (OSError, http.client.HTTPException) as e:
        raise IAUnavailable(f"Moteur IA injoignable : {e}") from e


def stream_answer(path: str, payload: dict, token: str, timeout: float = 300) -> str:
    """Réponse d'une discussion du moteur IA lue dans son flux (événements SSE), jusqu'à la fin du flux.

    Ne garde que le texte de la réponse (`answer`) ; une erreur du moteur lève IAUnavailable avec son message.
    `timeout` borne chaque lecture : un moteur muet plus longtemps arrête l'attente au lieu de la prolonger."""
    url = get_settings().weknora_url.rstrip("/") + path
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST", headers={
        "Content-Type": "application/json", "Accept": "text/event-stream", "Accept-Language": "fr-FR",
        "Authorization": f"Bearer {token}"})
    answer: list[str] = []
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (URL fixée par la configuration)
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                event = _decode(line[5:].strip().encode())
                kind = event.get("response_type")
                if kind == "error":
                    raise IAUnavailable(f"Le moteur IA a refusé la demande : {event.get('content') or 'sans détail'}")
                if kind == "answer":
                    answer.append(str(event.get("content") or ""))
                if kind == "complete" or (kind == "answer" and event.get("done")):
                    break
    except urllib.error.HTTPError as e:
        raise IAUnavailable(f"Le moteur IA a refusé la demande : {message_of(_decode(e.read()))} (HTTP {e.code})") from e
    except (OSError, http.client.HTTPException) as e:
        raise IAUnavailable(f"Moteur IA injoignable ou trop lent : {e}") from e
    return "".join(answer)


def message_of(body: dict) -> str:
    """Message d'erreur lisible d'une réponse WeKnora (formes `error.message`, `message` ou `error`)."""
    err = body.get("error")
    if isinstance(err, dict):
        detail = err.get("details") or err.get("message") or ""
        return str(err.get("message") or "") + (f" ({detail})" if detail and detail != err.get("message") else "")
    return str(body.get("message") or err or "réponse sans détail")
