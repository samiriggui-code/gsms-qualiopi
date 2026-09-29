"""Réglages du domaine formation."""

from app.platform.settings import SettingDef

SETTINGS = (
    SettingDef(
        "training.close_requires_trainer_validation",
        "Clôture : chaque demi-journée doit être validée par le formateur",
        bool, True, "training", regulatory=True,
        help="Les financeurs demandent des émargements contresignés par le formateur (guide EDOF, Opco EP).",
    ),
    SettingDef(
        "training.close_requires_certificates",
        "Clôture : chaque stagiaire ayant terminé a reçu son attestation",
        bool, True, "training", regulatory=True,
        help="Attestation de fin de formation (code du travail, L. 6353-1) et preuve de l'indicateur 11.",
    ),
)
