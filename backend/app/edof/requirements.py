"""Pièces du référencement EDOF (config/edof/referencement.yaml) et conditions qui les rendent applicables."""

from __future__ import annotations

from collections.abc import Callable
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from app.core.config import BACKEND_DIR
from app.core.errors import NotFoundError

CONFIG = BACKEND_DIR / "config" / "edof" / "referencement.yaml"
SCOPES = ("ETABLISSEMENT", "FORMATION")
STAGES = ("FORMULAIRE", "AVANT_DEPOT", "COMPLEMENT", "SUIVI")
STAGE_LABELS = {
    "FORMULAIRE": "Formulaire de référencement",
    "AVANT_DEPOT": "À justifier avant le dépôt",
    "COMPLEMENT": "Peut être demandée par la Caisse des Dépôts",
    "SUIVI": "Pièce reçue pendant le suivi de la demande",
}


class Facts(BaseModel):
    """Ce que l'on sait de la situation. None = pas encore renseigné."""

    structure_type: str | None = None
    representative_kind: str | None = None
    uses_subcontracting: bool | None = None
    certification_basis: str | None = None
    habilitation: str | None = None
    has_job_authorization: bool | None = None


# Chaque condition rend True, False, ou None quand l'information manque.
CONDITIONS: dict[str, tuple[str, Callable[[Facts], bool | None]]] = {
    "entreprise": ("si l'établissement est une entreprise",
                   lambda f: None if f.structure_type is None else f.structure_type == "ENTREPRISE"),
    "entreprise_ou_artisanale": ("si l'établissement est une entreprise (y compris artisanale ou libérale)",
                                 lambda f: None if f.structure_type is None
                                 else f.structure_type in ("ENTREPRISE", "ENTREPRISE_ARTISANALE_LIBERALE")),
    "association": ("si l'établissement est une association",
                    lambda f: None if f.structure_type is None else f.structure_type == "ASSOCIATION"),
    "representant_personne_physique": ("si le représentant légal est une personne physique",
                                       lambda f: None if f.representative_kind is None
                                       else f.representative_kind == "PERSONNE_PHYSIQUE"),
    "representant_personne_morale": ("si le représentant légal est une personne morale",
                                     lambda f: None if f.representative_kind is None
                                     else f.representative_kind == "PERSONNE_MORALE"),
    "sous_traitance": ("si l'organisme recourt à la sous-traitance", lambda f: f.uses_subcontracting),
    "certifiante": ("si la formation vise une certification RNCP ou RS",
                    lambda f: None if f.certification_basis in (None, "A_DETERMINER")
                    else f.certification_basis in ("RNCP", "RS")),
    "habilite_former_seulement": ("si l'établissement est habilité à former mais pas à évaluer",
                                  lambda f: None if f.habilitation in (None, "A_VERIFIER") else f.habilitation == "FORMER"),
    "autorisation_metier": ("si le métier exige une autorisation d'exercice", lambda f: f.has_job_authorization),
}


class PieceSpec(BaseModel):
    code: str
    label: str
    scope: str
    stage: str
    when: list[str] = Field(default_factory=list)
    group: str | None = None
    max_age_days: int | None = None
    expires: bool = False
    siret: bool = False
    sensitive: bool = False
    generated: bool = False
    provided_by: str
    source: str
    note: str | None = None

    def applies(self, facts: Facts) -> bool | None:
        """True, False, ou None si une information manque pour le dire."""
        unknown = False
        for name in self.when:
            value = CONDITIONS[name][1](facts)
            if value is False:
                return False
            if value is None:
                unknown = True
        return None if unknown else True

    def conditions_text(self) -> list[str]:
        return [CONDITIONS[c][0] for c in self.when]


class Referential(BaseModel):
    version: str
    sources: dict[str, str]
    pieces: list[PieceSpec]

    def for_scope(self, scope: str) -> list[PieceSpec]:
        return [p for p in self.pieces if p.scope == scope]

    def get(self, code: str) -> PieceSpec:
        for p in self.pieces:
            if p.code == code:
                return p
        raise NotFoundError(f"Pièce EDOF inconnue : {code}")


@lru_cache
def load(path: Path = CONFIG) -> Referential:
    ref = Referential(**yaml.safe_load(path.read_text(encoding="utf-8")))
    codes = [p.code for p in ref.pieces]
    if len(codes) != len(set(codes)):
        raise ValueError("referencement.yaml : codes de pièce en double")
    for p in ref.pieces:
        if p.scope not in SCOPES or p.stage not in STAGES:
            raise ValueError(f"{p.code} : scope ou stage inconnu")
        if p.source not in ref.sources:
            raise ValueError(f"{p.code} : source inconnue {p.source}")
        unknown = [c for c in p.when if c not in CONDITIONS]
        if unknown:
            raise ValueError(f"{p.code} : conditions inconnues {unknown}")
    return ref
