"""Modèles de dossiers de pièces attendues (config/dossiers/*.yaml)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from app.core.config import BACKEND_DIR
from app.core.errors import InvalidStateError, NotFoundError

DOSSIERS_DIR = BACKEND_DIR / "config" / "dossiers"
MODELES_DIR = DOSSIERS_DIR / "modeles"
SUBJECTS = ("ORGANISME", "FORMATEUR")
EXIGENCES = ("REFERENTIEL", "REGLEMENTAIRE", "GSMS")
ANSWERS = ("OUI", "NON", "SANS_OBJET")


class GridPoint(BaseModel):
    """Point coché au dépôt de la pièce, puis confirmé par la personne qui la valide."""

    code: str
    question: str
    exigence: str  # REFERENTIEL (énoncé Qualiopi) | REGLEMENTAIRE (autre texte) | GSMS (bonne pratique)
    source: str
    condition: str | None = None  # point officiel qui ne s'applique que dans ce cas (« si modules à distance »)

    @property
    def may_be_not_applicable(self) -> bool:
        return self.exigence == "GSMS" or self.condition is not None


class RequirementItem(BaseModel):
    code: str
    label: str
    evidence: str
    indicators: list[int] = Field(default_factory=list)
    validity_days: int | None = None
    required: bool = True
    modele: str | None = None  # trame de rédaction dans config/dossiers/modeles/
    grille: list[GridPoint] = Field(default_factory=list)


class DossierTemplate(BaseModel):
    subject: str
    label: str
    items: list[RequirementItem]


@lru_cache
def load_templates(name: str = "standard") -> dict[str, DossierTemplate]:
    raw = yaml.safe_load(Path(DOSSIERS_DIR / f"{name}.yaml").read_text(encoding="utf-8"))["dossiers"]
    out = {}
    for subject, spec in raw.items():
        if subject not in SUBJECTS:
            raise ValueError(f"dossier {subject} : sujet inconnu ({', '.join(SUBJECTS)})")
        tpl = DossierTemplate(subject=subject, label=spec["label"], items=spec["items"])
        codes = [i.code for i in tpl.items]
        if len(codes) != len(set(codes)):
            raise ValueError(f"dossier {subject} : codes de pièce en double")
        for item in tpl.items:
            if item.modele and not (MODELES_DIR / item.modele).is_file():
                raise ValueError(f"{item.code} : modèle introuvable {item.modele}")
            points = [g.code for g in item.grille]
            if len(points) != len(set(points)):
                raise ValueError(f"{item.code} : points de grille en double")
            if any(g.exigence not in EXIGENCES for g in item.grille):
                raise ValueError(f"{item.code} : exigence attendue {', '.join(EXIGENCES)}")
        out[subject] = tpl
    return out


def find_item(subject: str, code: str) -> RequirementItem:
    tpl = load_templates().get(subject)
    item = next((i for i in tpl.items if i.code == code), None) if tpl else None
    if item is None:
        raise NotFoundError(f"Pièce inconnue pour le dossier {subject} : {code}")
    return item


def modele_text(subject: str, code: str) -> str:
    item = find_item(subject, code)
    if not item.modele:
        raise NotFoundError(f"Pas de modèle de rédaction pour {code}")
    return (MODELES_DIR / item.modele).read_text(encoding="utf-8")


def check_answers(grid: list[GridPoint], checklist: dict[str, str], note: str | None) -> tuple[dict, list[GridPoint]]:
    """Contrôle les réponses à une grille. Renvoie (réponses figées avec leur question, points NON).

    Tous les points doivent avoir une réponse OUI, NON ou SANS_OBJET. « Sans objet » n'est admis que
    pour un point GSMS ou un point officiel conditionnel, et doit être motivé.
    """
    codes = {g.code for g in grid}
    unknown = set(checklist) - codes
    if unknown:
        raise InvalidStateError(f"Points inconnus : {', '.join(sorted(unknown))}")
    missing = [g.code for g in grid if g.code not in checklist]
    if missing:
        raise InvalidStateError(f"Points sans réponse : {', '.join(missing)}")
    if any(a not in ANSWERS for a in checklist.values()):
        raise InvalidStateError(f"Réponse attendue : {', '.join(ANSWERS)}")
    for g in grid:
        if checklist[g.code] != "SANS_OBJET":
            continue
        if not g.may_be_not_applicable:
            raise InvalidStateError(f"{g.code} vient de l'énoncé officiel : il ne peut pas être sans objet")
        if not (note or "").strip():
            raise InvalidStateError("Un point sans objet doit être motivé dans le commentaire")
    frozen = {g.code: {"reponse": checklist[g.code], "question": g.question, "exigence": g.exigence} for g in grid}
    return frozen, [g for g in grid if checklist[g.code] == "NON"]
