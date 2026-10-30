"""Liens personnels signés (questionnaire, espace, document) : rien à deviner, rien de secret stocké en base.

Jeton = valeur + signature HMAC-SHA256 tronquée à 128 bits. Le lien ne donne accès qu'à un seul objet.

- Questionnaire et espace : clé JWT_SECRET, préfixe par usage ; l'objet porte lui-même son expiration
  (invitation, fin de session).
- Document (convocation, attestation) : la valeur signée porte sa date d'expiration
  (`DOCUMENT_LINK_DAYS` après l'émission du lien) et la clé est **dérivée** de JWT_SECRET pour cet usage
  seul (HMAC-SHA256 de JWT_SECRET sur un libellé d'usage) : une signature de lien ne peut servir ailleurs.
  Les liens envoyés avant ce format (sans date, clé JWT_SECRET) restent lus tant que le document a été
  émis il y a moins de `DOCUMENT_LINK_DAYS` jours (handler/questionnaires.py) : ils s'éteignent seuls.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.config.config import get_settings

DOCUMENT_PURPOSE = "document"
# Durée de validité d'un lien de document, par défaut ; chaque relance ou ouverture de l'espace en émet un neuf.
DOCUMENT_LINK_DAYS = 60
_DOCUMENT_KEY_LABEL = b"gsms-qualiopi/liens-publics/document/v2"


def _hmac(key: bytes, purpose: str, value: str) -> str:
    return hmac.new(key, f"{purpose}:{value}".encode(), hashlib.sha256).hexdigest()[:32]


def _sig(purpose: str, value: str) -> str:
    return _hmac(get_settings().jwt_secret.encode(), purpose, value)


def _document_key() -> bytes:
    return hmac.new(get_settings().jwt_secret.encode(), _DOCUMENT_KEY_LABEL, hashlib.sha256).digest()


def sign(purpose: str, value: str) -> str:
    return f"{value}.{_sig(purpose, value)}"


def verify(purpose: str, token: str) -> str | None:
    value, _, sig = (token or "").rpartition(".")
    if not value or not hmac.compare_digest(sig, _sig(purpose, value)):
        return None
    return value


@dataclass(frozen=True)
class DocumentLink:
    enrollment_id: str
    document_id: str
    expires_at: datetime | None  # None : lien d'avant l'expiration signée (période de transition)


def sign_document(enrollment_id: str, document_id: str, now: datetime | None = None) -> str:
    expires = int(((now or datetime.now(UTC)) + timedelta(days=DOCUMENT_LINK_DAYS)).timestamp())
    value = f"{enrollment_id}:{document_id}:{expires}"
    return f"{value}.{_hmac(_document_key(), DOCUMENT_PURPOSE, value)}"


def verify_document(token: str) -> DocumentLink | None:
    """Lien de document authentique (sans juger de son expiration), ou None."""
    value, _, sig = (token or "").rpartition(".")
    parts = value.split(":")
    if len(parts) == 3 and parts[2].isdigit() and hmac.compare_digest(sig, _hmac(_document_key(), DOCUMENT_PURPOSE, value)):
        return DocumentLink(parts[0], parts[1], datetime.fromtimestamp(int(parts[2]), UTC))
    legacy = verify(DOCUMENT_PURPOSE, token)
    if legacy and len(parts) == 2:
        return DocumentLink(parts[0], parts[1], None)
    return None
