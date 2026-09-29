"""Réglages généraux de l'organisme."""

from typing import Annotated, Literal

from pydantic import StringConstraints

from app.platform.settings import SettingDef

SETTINGS = (
    SettingDef("general.timezone", "Fuseau horaire", Literal["Europe/Paris", "America/Cayenne", "Indian/Reunion",
                                                               "America/Martinique", "America/Guadeloupe"],
               "Europe/Paris", "core"),
    SettingDef("general.language", "Langue des documents", Literal["fr"], "fr", "core"),
    SettingDef("general.brand_color", "Couleur principale de l'interface (identité de l'organisme)",
               Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")], "#0369a1", "core",
               help="Couleur des boutons et liens. Choisir une teinte assez foncée pour rester lisible sur fond blanc."),
    SettingDef("general.brand_short_name", "Nom court affiché dans l'application", Annotated[str, StringConstraints(max_length=40)],
               "", "core", help="Vide : nom de l'organisme."),
)
