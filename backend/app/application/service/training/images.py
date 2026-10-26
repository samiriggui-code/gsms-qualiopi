"""Vignettes des formations (config/catalogue/vignettes.yaml) : une seule source pour les écrans, `image_url`."""

from __future__ import annotations

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.media import media_path
from app.config.config import BACKEND_DIR
from app.types import training as t

VIGNETTES = BACKEND_DIR / "config" / "catalogue" / "vignettes.yaml"


def vignettes() -> dict[str, str]:
    """Code du programme → chemin de la médiathèque (validé)."""
    data = yaml.safe_load(VIGNETTES.read_text(encoding="utf-8"))
    return {code: media_path(f"{data['dossier']}/{name}") for code, name in data["vignettes"].items()}


def complete_program_images(db: Session, codes: list[str] | tuple[str, ...]) -> list[str]:
    """Donne sa vignette à chaque formation de `codes` qui n'a pas encore d'image ; ne remplace jamais une image."""
    paths = vignettes()
    wanted = [c for c in codes if c in paths]
    done = []
    for p in db.scalars(select(t.Program).where(t.Program.image_url.is_(None), t.Program.code.in_(wanted))):
        p.image_url = paths[p.code]
        done.append(p.code)
    db.flush()
    return sorted(done)
