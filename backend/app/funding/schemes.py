"""Chargement et validation des circuits (config/financement/dispositifs.yaml) et des règles datées."""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, model_validator

from app.core.config import BACKEND_DIR
from app.core.errors import NotFoundError

CONFIG_DIR = BACKEND_DIR / "config" / "financement"
CONDITIONS = ("external_ref", "amount_granted", "amount_paid", "invoice_ref", "agreement_signed", "session_started",
              "learner_present_once", "enrollment_finished", "attendance_complete", "certificate_issued", "retraction_elapsed")
PIECES = ("programme", "convention", "contrat", "emargements", "attestation_fin", "facture")


class Due(BaseModel):
    after: Literal["session_start", "session_end"] | None = None
    before: Literal["session_start"] | None = None
    business_days: int = Field(ge=0, le=60)


class Action(BaseModel):
    label: str
    from_: list[str] = Field(alias="from")
    to: str
    requires: list[str] = Field(default_factory=list)
    reason: bool = False
    portal: str | None = None
    due: Due | None = None


class Scheme(BaseModel):
    code: str
    label: str
    feature: str
    provider: str | None = None
    payer: Literal["FINANCEUR", "ENTREPRISE", "STAGIAIRE"]
    prorata: bool = False
    initial: str
    final: list[str]
    states: list[str]
    actions: dict[str, Action]
    pieces: list[str]

    @model_validator(mode="after")
    def _coherent(self) -> "Scheme":
        known = set(self.states)
        if self.initial not in known or not set(self.final) <= known:
            raise ValueError(f"{self.code} : état initial ou final inconnu")
        for name, a in self.actions.items():
            if not set(a.from_) <= known or a.to not in known:
                raise ValueError(f"{self.code}.{name} : état inconnu")
            unknown = set(a.requires) - set(CONDITIONS)
            if unknown:
                raise ValueError(f"{self.code}.{name} : conditions inconnues {sorted(unknown)}")
        if set(self.pieces) - set(PIECES):
            raise ValueError(f"{self.code} : pièce inconnue")
        return self


@lru_cache
def load() -> tuple[str, dict[str, Scheme]]:
    raw = yaml.safe_load((CONFIG_DIR / "dispositifs.yaml").read_text(encoding="utf-8"))
    return raw["version"], {code: Scheme(code=code, **spec) for code, spec in raw["schemes"].items()}


def schemes() -> dict[str, Scheme]:
    return load()[1]


def scheme(code: str) -> Scheme:
    s = schemes().get(code)
    if s is None:
        raise NotFoundError(f"Dispositif inconnu : {code}")
    return s


@lru_cache
def _rules() -> dict[str, Any]:
    return yaml.safe_load((CONFIG_DIR / "regles.yaml").read_text(encoding="utf-8"))


def rule_at(key: str, at: date) -> dict:
    """Valeur d'une règle datée en vigueur à la date `at`, avec sa source."""
    spec = _rules().get(key)
    if spec is None:
        raise NotFoundError(f"Règle inconnue : {key}")
    valid = [v for v in spec["values"] if v["from"] <= at]
    if not valid:
        raise NotFoundError(f"Règle {key} : aucune valeur en vigueur au {at:%d/%m/%Y}")
    v = max(valid, key=lambda v: v["from"])
    return {"key": key, "value": v["value"], "since": v["from"].isoformat(), "source": v["source"]}
