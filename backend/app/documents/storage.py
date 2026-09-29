"""Stockage des fichiers déposés : adressé par empreinte SHA-256, privé, jamais écrasé.

Le fichier est rangé sous documents_dir/ab/abcdef… (empreinte). Deux dépôts identiques
partagent le même fichier ; une nouvelle version est un nouveau fichier. Frappe utilise MD5
pour `content_hash` : trop faible pour prouver l'intégrité d'une preuve.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import DomainError

MAX_BYTES = 15 * 1024 * 1024
# Type déclaré → signature attendue en tête de fichier.
ALLOWED = {
    "application/pdf": (b"%PDF-",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b"PK\x03\x04",),
    "application/vnd.oasis.opendocument.text": (b"PK\x03\x04",),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b"PK\x03\x04",),
}


class UploadRefused(DomainError):
    status_code = 422
    code = "upload_refused"


@dataclass(frozen=True)
class StoredFile:
    sha256: str
    size: int
    relative_path: str


def check(content: bytes, mime: str) -> None:
    if not content:
        raise UploadRefused("Fichier vide")
    if len(content) > MAX_BYTES:
        raise UploadRefused(f"Fichier trop lourd ({len(content) // 1024} Ko, maximum {MAX_BYTES // 1024 // 1024} Mo)")
    signatures = ALLOWED.get(mime)
    if signatures is None:
        raise UploadRefused(f"Type non accepté : {mime}. Types acceptés : PDF, PNG, JPEG, DOCX, ODT, XLSX")
    if not content.startswith(signatures):
        raise UploadRefused(f"Le contenu ne correspond pas au type déclaré ({mime})")


def store(content: bytes, mime: str) -> StoredFile:
    check(content, mime)
    digest = hashlib.sha256(content).hexdigest()
    relative = f"{digest[:2]}/{digest}"
    target = Path(get_settings().documents_dir) / relative
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".part")
        tmp.write_bytes(content)
        tmp.replace(target)
    return StoredFile(sha256=digest, size=len(content), relative_path=relative)


def read(relative_path: str, expected_sha256: str | None = None) -> bytes:
    root = Path(get_settings().documents_dir).resolve()
    path = (root / relative_path).resolve()
    if not path.is_relative_to(root):
        raise UploadRefused("Chemin de fichier invalide")
    content = path.read_bytes()
    if expected_sha256 and hashlib.sha256(content).hexdigest() != expected_sha256:
        raise DomainError("Intégrité du fichier compromise : l'empreinte ne correspond plus")
    return content
