"""Briques communes des documents A4 imprimables (carnet d'audit, documents professionnels).

Le navigateur imprime ou enregistre en PDF : l'en-tête (logo) et le pied (organisme, date, page) vivent dans
les zones de marge de `@page`, d'où les chaînes CSS et le logo en image de fond.
"""

from __future__ import annotations

import base64
from datetime import date
from pathlib import Path

from markupsafe import Markup

MONTHS = ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
          "novembre", "décembre")
LOGO = Path(__file__).resolve().parents[2] / "config" / "organisme" / "logo.png"


def date_fr(iso: str | None) -> str:
    """« 13 octobre 2026 » depuis une date ISO (ou chaîne vide)."""
    if not iso:
        return ""
    d = date.fromisoformat(iso[:10])
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def css_string(text: str) -> Markup:
    """Texte sûr dans une chaîne CSS (content: "…"), non réencodé par l'échappement HTML."""
    return Markup(text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " "))


def logo_css() -> Markup:
    """Logo de l'organisme pour l'en-tête (image de fond de la zone de marge, mise à l'échelle par le CSS)."""
    if not LOGO.exists():
        return Markup("none")
    return Markup(f'url("data:image/png;base64,{base64.b64encode(LOGO.read_bytes()).decode()}")')
