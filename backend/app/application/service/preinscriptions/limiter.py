"""Limite simple du nombre d'envois du formulaire public, par adresse d'origine.

Compteur en mémoire du processus (fenêtre glissante) : il freine un envoi en rafale sans rien stocker
de la personne. Il ne remplace pas une protection du reverse proxy ; avec plusieurs processus, chacun
compte de son côté.
"""

from __future__ import annotations

import threading
import time
from collections import deque

MAX_SUBMISSIONS = 5
WINDOW_SECONDS = 600.0
_MAX_KEYS = 10_000  # au-delà, on repart de zéro plutôt que de laisser grossir la mémoire

_lock = threading.Lock()
_hits: dict[str, deque[float]] = {}


def allow(key: str, now: float | None = None) -> bool:
    """Enregistre un envoi pour `key` ; False si la limite de la fenêtre est déjà atteinte."""
    now = time.monotonic() if now is None else now
    with _lock:
        if len(_hits) > _MAX_KEYS:
            _hits.clear()
        hits = _hits.setdefault(key, deque())
        while hits and now - hits[0] > WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= MAX_SUBMISSIONS:
            return False
        hits.append(now)
        return True


def reset() -> None:
    with _lock:
        _hits.clear()
