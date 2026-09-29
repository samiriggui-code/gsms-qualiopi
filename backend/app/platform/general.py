"""Réglages généraux de l'organisme."""

from typing import Literal

from app.platform.settings import SettingDef

SETTINGS = (
    SettingDef("general.timezone", "Fuseau horaire", Literal["Europe/Paris", "America/Cayenne", "Indian/Reunion",
                                                               "America/Martinique", "America/Guadeloupe"],
               "Europe/Paris", "core"),
    SettingDef("general.language", "Langue des documents", Literal["fr"], "fr", "core"),
)
