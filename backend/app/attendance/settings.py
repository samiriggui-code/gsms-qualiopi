"""Réglages de l'émargement."""

from datetime import time
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.platform.settings import SettingDef


class SlotDef(BaseModel):
    period: Literal["MATIN", "APRES_MIDI"]
    start: time
    end: time

    @model_validator(mode="after")
    def _order(self) -> "SlotDef":
        if self.end <= self.start:
            raise ValueError("l'heure de fin doit suivre l'heure de début")
        return self


# Pas de fenêtre négative ni supérieure à 4 h.
Minutes = Annotated[int, Field(ge=0, le=240)]

DEFAULT_SLOTS = [SlotDef(period="MATIN", start=time(9, 0), end=time(12, 30)),
                 SlotDef(period="APRES_MIDI", start=time(13, 30), end=time(17, 0))]

SETTINGS = (
    SettingDef("attendance.slots", "Demi-journées et horaires", list[SlotDef], DEFAULT_SLOTS, "attendance"),
    SettingDef("attendance.weekdays", "Jours de formation (1 = lundi … 7 = dimanche)",
               list[Literal[1, 2, 3, 4, 5, 6, 7]], [1, 2, 3, 4, 5], "attendance"),
    SettingDef("attendance.sign_before_minutes", "Signature possible avant le début du créneau (minutes)",
               Minutes, 15, "attendance"),
    SettingDef("attendance.sign_after_minutes", "Signature possible après la fin du créneau (minutes)",
               Minutes, 30, "attendance"),
    SettingDef("attendance.learner_self_sign", "Les stagiaires signent eux-mêmes (code de salle + lien personnel)",
               bool, True, "attendance", regulatory=True,
               help="Désactivé : seul le formateur saisit présences et absences."),
)
