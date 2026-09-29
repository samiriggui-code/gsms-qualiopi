"""Liens personnels signés (questionnaire, document) : rien à deviner, rien de secret stocké en base.

Jeton = identifiant + signature HMAC-SHA256 (clé : JWT_SECRET, avec un préfixe par usage). Le lien
ne donne accès qu'à un seul objet ; l'invitation porte son expiration et sa réponse unique.
"""

from __future__ import annotations

import hashlib
import hmac

from app.core.config import get_settings


def _sig(purpose: str, value: str) -> str:
    key = get_settings().jwt_secret.encode()
    return hmac.new(key, f"{purpose}:{value}".encode(), hashlib.sha256).hexdigest()[:32]


def sign(purpose: str, value: str) -> str:
    return f"{value}.{_sig(purpose, value)}"


def verify(purpose: str, token: str) -> str | None:
    value, _, sig = (token or "").rpartition(".")
    if not value or not hmac.compare_digest(sig, _sig(purpose, value)):
        return None
    return value
