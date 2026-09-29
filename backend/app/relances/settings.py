"""Réglages des relances (datés et journalisés comme tous les réglages de l'organisme)."""

from typing import Annotated

from pydantic import Field

from app.platform.settings import SettingDef

SETTINGS = (
    SettingDef(
        "relances.validation_externe",
        "Messages aux stagiaires et aux entreprises : validation avant envoi",
        bool, True, "relances",
        help="Au démarrage, chaque message externe attend un clic. Les alertes internes partent sans validation.",
    ),
    SettingDef(
        "relances.adresse_reponse",
        "Adresse de réponse des messages (vide : pas d'adresse de réponse)",
        Annotated[str, Field(max_length=255)], "", "relances",
    ),
    SettingDef(
        "relances.rattrapage_jours",
        "Rattrapage : un message dont la date est passée depuis au plus N jours est encore envoyé",
        Annotated[int, Field(ge=0, le=14)], 2, "relances",
        help="Évite qu'un arrêt du serveur fasse sauter une relance, sans relancer de vieilles sessions.",
    ),
    SettingDef(
        "relances.regles_desactivees",
        "Règles de relance désactivées",
        list[str], [], "relances",
    ),
)
