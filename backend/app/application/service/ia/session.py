"""Session du moteur IA pour le back-office.

Le back-office reprend les écrans WeKnora tels quels ; ils parlent directement au moteur IA (préfixe /ia/).
Une seule connexion pour l'utilisateur : après s'être connecté à GSMS, le front demande ici une session
WeKnora, et GSMS la lui ouvre.

Deux comptes WeKnora, pour que le navigateur ne détienne jamais les droits d'administration de l'espace :

- le **compte de service** (`WEKNORA_SERVICE_EMAIL`), propriétaire de l'espace de l'organisme : il reste côté
  serveur (déclaration du serveur MCP, base « Référentiel Qualiopi », membres) et son jeton n'est jamais renvoyé ;
- le **compte navigateur** (`<service>+navigateur@…`), membre « contributeur » de cet espace : il lit tout,
  crée ses bases et ses agents, discute, mais ne règle ni les modèles, ni les services MCP, ni les membres.
  Son mot de passe est dérivé du mot de passe de service (jamais stocké ni communiqué).

Le front reçoit la réponse de connexion du compte navigateur **sans jeton de renouvellement** : pour prolonger la
session, il rappelle `POST /api/v1/ia/session`, qui revérifie le compte GSMS (actif, permission `ia.use`).
"""

import hashlib
import hmac
from dataclasses import dataclass

from app.application.service.ia.weknora import IAUnavailable, call, message_of
from app.config.config import get_settings

__all__ = ["IASession", "IAUnavailable", "browser_email", "open_service_session", "open_session"]

BROWSER_ROLE = "contributor"
BROWSER_NAME = "GSMS Qualiopi (navigateur)"


@dataclass
class IASession:
    service_token: str  # reste côté serveur
    browser: dict  # réponse de connexion à remettre au front (sans refresh_token)


def _post(path: str, payload: dict, token: str | None = None) -> tuple[int, dict]:
    return call("POST", path, payload, token=token, timeout=15)


def _configured() -> None:
    s = get_settings()
    if not (s.weknora_url and s.weknora_service_email and s.weknora_service_password):
        raise IAUnavailable("Moteur IA non configuré (WEKNORA_URL, WEKNORA_SERVICE_EMAIL, WEKNORA_SERVICE_PASSWORD)")


def _login_or_register(email: str, password: str, username: str) -> dict:
    """Connexion WeKnora ; inscription au tout premier appel (possible tant que l'inscription est ouverte)."""
    credentials = {"email": email, "password": password}
    status, body = _post("/api/v1/auth/login", credentials)
    if status == 200 and body.get("token"):
        return body
    status, reg = _post("/api/v1/auth/register", {"username": username, **credentials})
    if status == 403:
        raise IAUnavailable(f"Compte {email} absent du moteur IA et inscription fermée (DISABLE_REGISTRATION) : "
                            "voir « Première installation » dans docs/API.md")
    status, body = _post("/api/v1/auth/login", credentials)
    if not (status == 200 and body.get("token")):
        raise IAUnavailable("Connexion au moteur IA refusée")
    return body


def open_service_session() -> dict:
    """Connexion du compte de service (propriétaire de l'espace). Réservé au serveur."""
    _configured()
    s = get_settings()
    return _login_or_register(s.weknora_service_email, s.weknora_service_password, s.weknora_service_name)


def browser_email() -> str:
    s = get_settings()
    if s.weknora_browser_email:
        return s.weknora_browser_email
    local, _, domain = s.weknora_service_email.partition("@")
    return f"{local}+navigateur@{domain}"


def _browser_password() -> str:
    """Dérivé du mot de passe de service : 29 caractères, majuscule, minuscules, chiffre et signe (règles WeKnora)."""
    secret = get_settings().weknora_service_password.encode()
    return "Gs1!-" + hmac.new(secret, b"gsms-weknora-navigateur", hashlib.sha256).hexdigest()[:24]


def _tenant_id(body: dict) -> object:
    """Espace actif d'une réponse de connexion WeKnora (`active_tenant`)."""
    return (body.get("active_tenant") or body.get("tenant") or {}).get("id")


def _ensure_member(service: dict, email: str) -> None:
    """Compte navigateur membre « contributeur » de l'espace du compte de service (ajouté une fois)."""
    token, tenant_id = service["token"], _tenant_id(service)
    status, body = call("GET", "/api/v1/tenants/current/members?page=1&page_size=100", token=token)
    if status != 200:
        raise IAUnavailable(f"Membres de l'espace illisibles : {message_of(body)} (HTTP {status})")
    members = (body.get("data") or {}).get("members") or []
    if any((m.get("email") or "").lower() == email.lower() for m in members):
        return
    status, body = _post(f"/api/v1/tenants/{tenant_id}/members", {"email": email, "role": BROWSER_ROLE}, token=token)
    if status not in (200, 201) or body.get("success") is False:
        raise IAUnavailable(f"Compte navigateur non ajouté à l'espace : {message_of(body)} (HTTP {status})")


def _without_refresh(body: dict) -> dict:
    return {k: v for k, v in body.items() if k != "refresh_token"}


def open_session() -> IASession:
    """Session du compte navigateur, dans l'espace de l'organisme ; le jeton de service reste au serveur."""
    service = open_service_session()
    email, password = browser_email(), _browser_password()
    browser = _login_or_register(email, password, BROWSER_NAME)
    tenant_id = _tenant_id(service)
    if tenant_id is None:
        raise IAUnavailable("Espace de l'organisme inconnu dans la réponse du moteur IA")
    if _tenant_id(browser) != tenant_id:
        _ensure_member(service, email)
        # Bascule dans l'espace de l'organisme ; WeKnora retient ce choix pour les connexions suivantes.
        status, switched = _post("/api/v1/auth/switch-tenant", {"tenant_id": tenant_id}, token=browser["token"])
        if not (status == 200 and switched.get("token")):
            raise IAUnavailable(f"Bascule dans l'espace de l'organisme refusée : {message_of(switched)} (HTTP {status})")
        browser = switched
    return IASession(service_token=service["token"], browser=_without_refresh(browser))
