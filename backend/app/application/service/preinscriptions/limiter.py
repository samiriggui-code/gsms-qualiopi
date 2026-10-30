"""Limite du nombre d'envois du formulaire public de préinscription, par adresse d'origine.

Mécanisme commun à toutes les routes publiques : `app/common/limites.py` (compteur en mémoire, mono-instance).
"""

from __future__ import annotations

from app.common.limites import Limite

MAX_SUBMISSIONS = 5
WINDOW_SECONDS = 600.0

_limite = Limite(MAX_SUBMISSIONS, WINDOW_SECONDS)
allow = _limite.allow
reset = _limite.reset
