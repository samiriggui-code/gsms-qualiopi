"""Chemins de la médiathèque du back-office (photos des personnes, vignettes des formations).

Seul un chemin relatif sous `media/` ou `assets/` est accepté : jamais une adresse externe (pas de schéma, pas de
`//`, pas de `..`), pour qu'une fiche ne fasse charger aucune ressource hors de l'application.
"""

from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator

MEDIA_PATH_MAX = 200
_PATH = re.compile(r"(?:media|assets)(?:/[A-Za-z0-9][A-Za-z0-9._-]*)+")


def media_path(value: str | None) -> str | None:
    """Rend le chemin s'il est valide, None s'il est vide ; lève ValueError sinon."""
    if value is None or not value.strip():
        return None
    value = value.strip()
    if len(value) > MEDIA_PATH_MAX or ".." in value or not _PATH.fullmatch(value):
        raise ValueError("chemin de la médiathèque attendu (media/… ou assets/…), sans adresse externe ni « .. »")
    return value


MediaPath = Annotated[str | None, AfterValidator(media_path)]
