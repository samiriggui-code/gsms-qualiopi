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


_CSS_STRING = str.maketrans({"\\": "\\\\", '"': '\\"', "\n": " ", "\r": " ",
                              # Échappements hexadécimaux CSS : « </style> » ne peut plus fermer le bloc style.
                              "<": "\\3c ", ">": "\\3e ", "&": "\\26 "})


def css_string(text: str) -> Markup:
    """Texte sûr dans une chaîne CSS (content: "…") d'un bloc <style>, non réencodé par l'échappement HTML.

    Les valeurs viennent de l'organisme (nom, NDA, SIRET) et des références saisies : rien ne doit pouvoir sortir
    de la chaîne (guillemet) ni du bloc style (<, >, &)."""
    return Markup(text.translate(_CSS_STRING))


def logo_css() -> Markup:
    """Logo de l'organisme pour l'en-tête (image de fond de la zone de marge, mise à l'échelle par le CSS)."""
    if not LOGO.exists():
        return Markup("none")
    return Markup(f'url("data:image/png;base64,{base64.b64encode(LOGO.read_bytes()).decode()}")')
