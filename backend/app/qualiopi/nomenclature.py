"""Noms d'affichage des critères et indicateurs (config/qualiopi/nomenclature.yaml).

Le nom affiché ne remplace pas le libellé officiel : il s'y ajoute. Sans nom configuré (indicateur
d'une version future par exemple), on retombe sur le titre du référentiel.
"""

from __future__ import annotations

import unicodedata
from functools import lru_cache
from pathlib import Path

import yaml

FILE = Path(__file__).resolve().parents[2] / "config" / "qualiopi" / "nomenclature.yaml"

CATEGORY_LABELS = {
    "AF": "actions de formation", "BC": "bilans de compétences", "VAE": "validation des acquis de l'expérience",
    "APPRENTISSAGE": "apprentissage",
}


@lru_cache
def _load() -> dict:
    raw = yaml.safe_load(FILE.read_text(encoding="utf-8"))
    return {"criteres": {int(k): v for k, v in raw["criteres"].items()},
            "indicateurs": {int(k): v for k, v in raw["indicateurs"].items()}}


def criterion_name(number: int) -> str:
    c = _load()["criteres"].get(number)
    return c["nom"] if c else f"Critère {number}"


def criterion_range(number: int) -> tuple[int, int] | None:
    c = _load()["criteres"].get(number)
    return tuple(c["indicateurs"]) if c else None  # type: ignore[return-value]


def indicator_name(number: int, fallback: str | None = None) -> str:
    return _load()["indicateurs"].get(number) or fallback or f"Indicateur {number}"


def search_keys(number: int, name: str, official: str) -> str:
    """Texte de recherche : nom, libellé, « indicateur 4 », « i04 », « i4 », sans accents."""
    text = f"{name} {official} indicateur {number} i{number:02d} i{number}"
    return "".join(ch for ch in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(ch) != "Mn")


def not_applicable_reason(rule: dict, org_categories: list[str], certifying_exists: bool) -> str | None:
    """Justification lisible d'un indicateur sans objet pour l'organisme (mêmes règles que le moteur)."""
    cats = rule.get("action_categories")
    if cats and not set(cats) & set(org_categories or ["AF"]):
        wanted = ", ".join(CATEGORY_LABELS.get(c, c) for c in cats)
        mine = ", ".join(CATEGORY_LABELS.get(c, c) for c in (org_categories or ["AF"]))
        return f"Réservé à : {wanted}. L'organisme déclare : {mine}."
    if rule.get("certifying_only") and not certifying_exists:
        return "Réservé aux formations conduisant à une certification professionnelle ; aucune au catalogue."
    return None
