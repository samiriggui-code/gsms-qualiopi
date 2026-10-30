"""En-tête Content-Disposition sûr pour les noms de fichiers accentués (RFC 6266 / 5987)."""

import unicodedata
from urllib.parse import quote


def content_disposition(filename: str, *, inline: bool = False) -> str:
    """Nom ASCII de repli pour les vieux clients, nom exact en UTF-8 pour les autres."""
    fallback = unicodedata.normalize("NFKD", filename).encode("ascii", "ignore").decode().replace('"', "") or "document"
    kind = "inline" if inline else "attachment"
    return f"{kind}; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"
