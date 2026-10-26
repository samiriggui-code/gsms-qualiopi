"""Session du moteur IA pour le back-office.

Le back-office reprend les écrans WeKnora tels quels ; ils parlent directement au moteur IA (préfixe /ia/).
Une seule connexion pour l'utilisateur : après s'être connecté à GSMS, le front demande ici une session
WeKnora, et GSMS la lui ouvre.

Deux sortes de comptes WeKnora, pour que le navigateur ne détienne jamais les droits d'administration de l'espace :

- le **compte de service** (`WEKNORA_SERVICE_EMAIL`), propriétaire de l'espace de l'organisme : il reste côté
  serveur (déclaration du serveur MCP, bases de connaissances, membres) et son jeton n'est jamais renvoyé ;
- un **compte WeKnora par compte GSMS** (`<service>+u-<empreinte>@…`), membre « contributeur » de cet espace : il lit
  tout, crée ses bases et ses agents, discute, mais ne règle ni les modèles, ni les services MCP, ni les membres.
  WeKnora range les conversations par compte : chacun ne voit que les siennes. L'adresse est dérivée de
  l'identifiant GSMS (stable, sans le révéler) ; le mot de passe est dérivé du mot de passe de service (jamais
  stocké ni communiqué).

Le front reçoit la réponse de connexion de ce compte **sans jeton de renouvellement** : pour prolonger la
session, il rappelle `POST /api/v1/ia/session`, qui revérifie le compte GSMS (actif, permission `ia.use`).
"""

import hashlib
import hmac
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit

from app.application.service.ia.weknora import IAUnavailable, call, message_of
from app.config.config import get_settings

__all__ = ["IASession", "IAUnavailable", "browser_email", "open_service_session", "open_session"]

BROWSER_ROLE = "contributor"


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
    """Connexion du compte de service ; inscription libre au tout premier appel (installation neuve, voir docs/API.md)."""
    credentials = {"email": email, "password": password}
    status, body = _post("/api/v1/auth/login", credentials)
    if status == 200 and body.get("token"):
        return body
    status, reg = _post("/api/v1/auth/register", {"username": username, **credentials})
    if status == 403:
        raise IAUnavailable(f"Compte {email} absent du moteur IA et inscription libre fermée : "
                            "voir « Première installation » dans docs/API.md")
    status, body = _post("/api/v1/auth/login", credentials)
    if not (status == 200 and body.get("token")):
        raise IAUnavailable("Connexion au moteur IA refusée")
    return body


def _login(email: str, password: str) -> dict | None:
    status, body = _post("/api/v1/auth/login", {"email": email, "password": password})
    return body if status == 200 and body.get("token") else None


def _register_by_invite(service: dict, email: str, password: str, username: str) -> None:
    """Crée le compte d'une personne par une invitation « contributeur » de l'espace, révoquée aussitôt.

    L'inscription libre reste fermée (mode `invite_register` du moteur IA) : seul le propriétaire de l'espace, c'est-à-dire
    le compte de service côté serveur, peut émettre une invitation. Un lien d'invitation accepte plusieurs inscriptions
    jusqu'à son expiration : il est donc révoqué dans tous les cas, même si l'inscription échoue."""
    tenant_id, token = _tenant_id(service), service["token"]
    status, body = _post(f"/api/v1/tenants/{tenant_id}/invite-links",
                         {"role": BROWSER_ROLE, "message": "Compte GSMS Qualiopi"}, token=token)
    link = body.get("data") or {}
    invite = parse_qs(urlsplit(link.get("invite_url") or "").query).get("token", [""])[0]
    if status not in (200, 201) or not (invite and link.get("id")):
        raise IAUnavailable(f"Invitation refusée par le moteur IA : {message_of(body)} (HTTP {status})")
    try:
        status, body = _post("/api/v1/auth/register-by-invite",
                             {"token": invite, "email": email, "username": username, "password": password})
    finally:
        call("DELETE", f"/api/v1/tenants/{tenant_id}/invitations/{link['id']}", token=token, timeout=15)
    if status == 403:
        raise IAUnavailable("Création des comptes du moteur IA fermée : le moteur doit être en mode « invite_register » "
                            "(ia/config/config.yaml, sans DISABLE_REGISTRATION=true), voir docs/API.md")
    if status not in (200, 201) or body.get("success") is False:
        raise IAUnavailable(f"Compte WeKnora non créé : {message_of(body)} (HTTP {status})")


def open_service_session() -> dict:
    """Connexion du compte de service (propriétaire de l'espace). Réservé au serveur."""
    _configured()
    s = get_settings()
    return _login_or_register(s.weknora_service_email, s.weknora_service_password, s.weknora_service_name)


def _user_key(user_id: str) -> str:
    return hashlib.sha256(f"gsms-weknora-compte:{user_id}".encode()).hexdigest()[:16]


def browser_email(user_id: str) -> str:
    """Adresse du compte WeKnora d'un compte GSMS (dérivée de son identifiant, qui n'y apparaît pas)."""
    local, _, domain = get_settings().weknora_service_email.partition("@")
    return f"{local}+u-{_user_key(user_id)}@{domain}"


def _browser_password(user_id: str) -> str:
    """Dérivé du mot de passe de service : 29 caractères, majuscule, minuscules, chiffre et signe (règles WeKnora)."""
    secret = get_settings().weknora_service_password.encode()
    return "Gs1!-" + hmac.new(secret, f"gsms-weknora-utilisateur:{user_id}".encode(), hashlib.sha256).hexdigest()[:24]


def _browser_name(full_name: str, user_id: str) -> str:
    """Nom affiché dans WeKnora (unique : WeKnora refuse deux comptes du même nom), 50 caractères au plus."""
    return f"{(full_name or 'GSMS').strip()[:40]} · {_user_key(user_id)[:6]}"


def _tenant_id(body: dict) -> object:
    """Espace actif d'une réponse de connexion WeKnora (`active_tenant`)."""
    return (body.get("active_tenant") or body.get("tenant") or {}).get("id")


def _ensure_member(service: dict, email: str) -> None:
    """Compte ajouté comme « contributeur » de l'espace du compte de service."""
    status, body = _post(f"/api/v1/tenants/{_tenant_id(service)}/members", {"email": email, "role": BROWSER_ROLE},
                         token=service["token"])
    if status not in (200, 201) or body.get("success") is False:
        raise IAUnavailable(f"Compte WeKnora non ajouté à l'espace : {message_of(body)} (HTTP {status})")


def _without_refresh(body: dict) -> dict:
    return {k: v for k, v in body.items() if k != "refresh_token"}


def open_session(user_id: str, full_name: str) -> IASession:
    """Session WeKnora du compte GSMS, dans l'espace de l'organisme ; le jeton de service reste au serveur."""
    service = open_service_session()
    tenant_id = _tenant_id(service)
    if tenant_id is None:
        raise IAUnavailable("Espace de l'organisme inconnu dans la réponse du moteur IA")
    email, password = browser_email(user_id), _browser_password(user_id)
    browser = _login(email, password)
    if browser is None:  # première session IA de cette personne
        try:
            _register_by_invite(service, email, password, _browser_name(full_name, user_id))
        except IAUnavailable:
            # Deux premières sessions simultanées (deux onglets) : l'autre a pu créer le compte entre-temps.
            browser = _login(email, password)
            if browser is None:
                raise
        else:
            browser = _login(email, password)
        if browser is None:
            raise IAUnavailable("Connexion au moteur IA refusée")
    if _tenant_id(browser) != tenant_id:
        if not any(m.get("tenant_id") == tenant_id for m in browser.get("memberships") or []):
            _ensure_member(service, email)
        # Bascule dans l'espace de l'organisme ; WeKnora retient ce choix pour les connexions suivantes.
        status, switched = _post("/api/v1/auth/switch-tenant", {"tenant_id": tenant_id}, token=browser["token"])
        if not (status == 200 and switched.get("token")):
            raise IAUnavailable(f"Bascule dans l'espace de l'organisme refusée : {message_of(switched)} (HTTP {status})")
        browser = switched
    return IASession(service_token=service["token"], browser=_without_refresh(browser))
