"""Limites de débit des routes exposées sans compte ou à la devinette (connexion, liens publics, émargement).

Compteurs en mémoire du processus, fenêtre glissante. Le déploiement prévu est mono-instance (un seul
processus uvicorn, sans `--workers`, derrière Caddy ou Traefik) : un compteur local suffit, sans table
ni migration. Avec plusieurs processus, chacun compterait de son côté (la limite serait multipliée
d'autant) ; il faudrait alors un compteur partagé (PostgreSQL). Rien de la personne n'est stocké :
seulement une clé (adresse ou identifiant) et des horodatages, oubliés à la fin de la fenêtre.
"""

from __future__ import annotations

import ipaddress
import math
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status

_MAX_KEYS = 10_000  # au-delà, on repart de zéro plutôt que de laisser grossir la mémoire
_ALL: list[Limite] = []


class Limite:
    """Au plus `maximum` évènements par clé sur `fenetre` secondes."""

    def __init__(self, maximum: int, fenetre: float) -> None:
        self.maximum = maximum
        self.fenetre = fenetre
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = {}
        _ALL.append(self)

    def _recent(self, key: str, now: float) -> deque[float]:
        if len(self._hits) > _MAX_KEYS:
            self._hits.clear()
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] > self.fenetre:
            hits.popleft()
        return hits

    def attente(self, key: str, now: float | None = None) -> float:
        """Secondes à attendre avant le prochain évènement autorisé (0 si la limite n'est pas atteinte)."""
        now = time.monotonic() if now is None else now
        with self._lock:
            hits = self._recent(key, now)
            return 0.0 if len(hits) < self.maximum else max(self.fenetre - (now - hits[0]), 1.0)

    def compter(self, key: str, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        with self._lock:
            self._recent(key, now).append(now)

    def allow(self, key: str, now: float | None = None) -> bool:
        """Enregistre un évènement pour `key` ; False (rien d'enregistré) si la limite est déjà atteinte."""
        now = time.monotonic() if now is None else now
        with self._lock:
            hits = self._recent(key, now)
            if len(hits) >= self.maximum:
                return False
            hits.append(now)
            return True

    def oublier(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def reset_all() -> None:
    """Remet tous les compteurs à zéro (tests)."""
    for limite in _ALL:
        limite.reset()


def trop_de_demandes(message: str, attente: float) -> HTTPException:
    return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, message, headers={"Retry-After": str(math.ceil(attente))})


def client_ip(request: Request) -> str:
    """Adresse du client.

    Derrière le reverse proxy (connexion venant d'une adresse privée ou locale), c'est la **dernière**
    adresse de `X-Forwarded-For`, celle que le proxy a lui-même ajoutée : le client ne peut pas la choisir.
    Une connexion directe depuis une adresse publique garde son adresse et l'en-tête est ignoré.
    """
    host = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for", "")
    last = forwarded.split(",")[-1].strip() if forwarded else ""
    try:
        behind_proxy = not ipaddress.ip_address(host).is_global
    except ValueError:  # pas une adresse (client de test, socket Unix)
        behind_proxy = True
    return (last if behind_proxy and last else host) or "?"


def par_adresse(limite: Limite, message: str):  # noqa: ANN201
    """Dépendance FastAPI : compte la requête pour l'adresse du client, 429 au-delà de la limite."""

    def dependance(request: Request) -> None:
        ip = client_ip(request)
        attente = limite.attente(ip)
        if attente:
            raise trop_de_demandes(message, attente)
        limite.compter(ip)

    return dependance
