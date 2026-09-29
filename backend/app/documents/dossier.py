"""Modèles de dossiers de pièces attendues (config/dossiers/*.yaml)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from app.core.config import BACKEND_DIR
from app.core.errors import NotFoundError

DOSSIERS_DIR = BACKEND_DIR / "config" / "dossiers"
SUBJECTS = ("ORGANISME", "FORMATEUR")


class RequirementItem(BaseModel):
    code: str
    label: str
    evidence: str
    indicators: list[int] = Field(default_factory=list)
    validity_days: int | None = None
    required: bool = True


class DossierTemplate(BaseModel):
    subject: str
    label: str
    items: list[RequirementItem]


@lru_cache
def load_templates(name: str = "standard") -> dict[str, DossierTemplate]:
    raw = yaml.safe_load(Path(DOSSIERS_DIR / f"{name}.yaml").read_text(encoding="utf-8"))["dossiers"]
    out = {}
    for subject, spec in raw.items():
        if subject not in SUBJECTS:
            raise ValueError(f"dossier {subject} : sujet inconnu ({', '.join(SUBJECTS)})")
        tpl = DossierTemplate(subject=subject, label=spec["label"], items=spec["items"])
        codes = [i.code for i in tpl.items]
        if len(codes) != len(set(codes)):
            raise ValueError(f"dossier {subject} : codes de pièce en double")
        out[subject] = tpl
    return out


def find_item(subject: str, code: str) -> RequirementItem:
    tpl = load_templates().get(subject)
    item = next((i for i in tpl.items if i.code == code), None) if tpl else None
    if item is None:
        raise NotFoundError(f"Pièce inconnue pour le dossier {subject} : {code}")
    return item
