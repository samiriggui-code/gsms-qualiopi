"""Catalogue des règles de relance (config/relances/*.yaml), validé au chargement."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, model_validator

from app.core.config import BACKEND_DIR

RULES_DIR = BACKEND_DIR / "config" / "relances"
WEEKDAYS = {"lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4, "samedi": 5, "dimanche": 6}


class Rule(BaseModel):
    cle: str
    libelle: str
    portee: Literal["INSCRIPTION", "SESSION", "JALON", "HEBDO"]
    destinataire: Literal["STAGIAIRE", "SIGNATAIRE", "FORMATEUR", "GESTION", "QUALITE", "RESPONSABLE_JALON"]
    condition: str
    modele: str
    ancre: Literal["debut", "fin"] | None = None
    decalages: list[int] = Field(default_factory=list)
    jour: str | None = None
    externe: bool = False
    indicateurs: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def coherent(self) -> "Rule":
        if self.portee in ("INSCRIPTION", "SESSION") and (self.ancre is None or not self.decalages):
            raise ValueError(f"{self.cle} : ancre et décalages obligatoires")
        if self.portee == "HEBDO" and self.jour not in WEEKDAYS:
            raise ValueError(f"{self.cle} : jour de la semaine attendu ({', '.join(WEEKDAYS)})")
        return self


@lru_cache
def load_rules(name: str = "standard") -> tuple[Rule, ...]:
    from app.relances.conditions import CONDITIONS
    from app.relances.render import TEMPLATES

    raw = yaml.safe_load(Path(RULES_DIR / f"{name}.yaml").read_text(encoding="utf-8"))
    rules = tuple(Rule(**r) for r in raw["regles"])
    keys = [r.cle for r in rules]
    if len(keys) != len(set(keys)):
        raise ValueError("règles de relance : clé en double")
    for r in rules:
        if r.condition not in CONDITIONS:
            raise ValueError(f"{r.cle} : condition inconnue {r.condition}")
        if r.modele not in TEMPLATES:
            raise ValueError(f"{r.cle} : modèle inconnu {r.modele}")
    return rules


def rule(key: str, name: str = "standard") -> Rule | None:
    return next((r for r in load_rules(name) if r.cle == key), None)
