"""Jours ouvrés (lundi-vendredi hors jours fériés nationaux de métropole)."""

from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache


def _easter(year: int) -> date:
    """Dimanche de Pâques (algorithme de Meeus)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    day = (h + l_ - 7 * m + 114) % 31 + 1
    return date(year, month, day)


@lru_cache
def holidays(year: int) -> frozenset[date]:
    easter = _easter(year)
    fixed = [(1, 1), (5, 1), (5, 8), (7, 14), (8, 15), (11, 1), (11, 11), (12, 25)]
    moving = [easter + timedelta(days=1), easter + timedelta(days=39), easter + timedelta(days=50)]  # lundi de Pâques, Ascension, lundi de Pentecôte
    return frozenset([date(year, m, d) for m, d in fixed] + moving)


def is_business_day(d: date) -> bool:
    return d.isoweekday() <= 5 and d not in holidays(d.year)


def add_business_days(start: date, n: int) -> date:
    """`n` jours ouvrés après (n > 0) ou avant (n < 0) `start`."""
    step = 1 if n >= 0 else -1
    d, left = start, abs(n)
    while left:
        d += timedelta(days=step)
        if is_business_day(d):
            left -= 1
    return d
