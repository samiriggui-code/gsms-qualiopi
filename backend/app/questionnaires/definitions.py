"""Questionnaires (config/questionnaires/*.yaml) : chargement, affichage personnalisé, contrôle des réponses."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

import yaml
from pydantic import BaseModel, Field, model_validator

from app.core.config import BACKEND_DIR
from app.core.errors import InvalidStateError

QUESTIONNAIRES_DIR = BACKEND_DIR / "config" / "questionnaires"


class Question(BaseModel):
    id: str
    libelle: str
    type: Literal["texte", "choix", "note", "oui_non"]
    requis: bool = False
    options: list[str] = Field(default_factory=list)
    aide: str | None = None
    si: dict[str, bool | str] | None = None  # affichée seulement si une autre réponse vaut cette valeur

    @model_validator(mode="after")
    def coherent(self) -> "Question":
        if self.type == "choix" and not self.options:
            raise ValueError(f"{self.id} : options obligatoires pour un choix")
        return self


class Questionnaire(BaseModel):
    code: str
    version: int
    titre: str
    introduction: str = ""
    questions: list[Question]


@lru_cache
def load(code: str) -> Questionnaire:
    for path in QUESTIONNAIRES_DIR.glob("*.yaml"):
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        if raw["code"] == code:
            q = Questionnaire(**raw)
            ids = [x.id for x in q.questions]
            if len(ids) != len(set(ids)):
                raise ValueError(f"{code} : identifiant de question en double")
            return q
    raise KeyError(code)


def personalised(q: Questionnaire, values: dict[str, str]) -> dict:
    """Le questionnaire tel qu'affiché (prérequis de la formation, nom du stagiaire…)."""
    def fill(text: str) -> str:
        for k, v in values.items():
            text = text.replace("{" + k + "}", v)
        return text

    return {
        "code": q.code, "version": q.version, "titre": q.titre, "introduction": fill(q.introduction),
        "questions": [x.model_dump(exclude_none=True) | {"libelle": fill(x.libelle)} for x in q.questions],
    }


def check(q: Questionnaire, answers: dict) -> dict:
    """Réponses nettoyées, ou refus précis (champ par champ)."""
    clean: dict = {}
    errors: dict[str, str] = {}
    for x in q.questions:
        if x.si and any(answers.get(k) != v for k, v in x.si.items()):
            continue  # question non affichée
        v = answers.get(x.id)
        if v in (None, "") or (isinstance(v, str) and not v.strip()):
            if x.requis:
                errors[x.id] = "Réponse obligatoire"
            continue
        if x.type == "note" and not (isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 5):
            errors[x.id] = "Note de 1 à 5 attendue"
        elif x.type == "oui_non" and not isinstance(v, bool):
            errors[x.id] = "Oui ou non attendu"
        elif x.type == "choix" and v not in x.options:
            errors[x.id] = "Choix non proposé"
        elif x.type == "texte":
            if not isinstance(v, str):
                errors[x.id] = "Texte attendu"
            elif len(v) > 4000:
                errors[x.id] = "4 000 caractères au plus"
            else:
                v = v.strip()
        clean[x.id] = v
    if errors:
        err = InvalidStateError("Certaines réponses sont à compléter")
        err.details = [{"question": k, "message": m} for k, m in errors.items()]
        raise err
    return clean
