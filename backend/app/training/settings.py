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

# Parcours du stagiaire.
JOURNEY_SETTINGS = (
    SettingDef(
        "journey.confirm_requires_agreement",
        "Confirmation d'une inscription : convention ou contrat signé exigé",
        bool, False, "training",
        help="Bonne pratique, pas une règle générale : avec le CPF, la validation sur EDOF tient lieu d'engagement.",
    ),
    SettingDef(
        "journey.certificate_requires_assessment",
        "Attestation de fin : au moins une évaluation des acquis enregistrée",
        bool, True, "training", regulatory=True,
        help="L'attestation mentionne les résultats de l'évaluation des acquis (code du travail, L. 6353-1).",
    ),
    SettingDef(
        "journey.cold_survey_min_days",
        "Satisfaction à froid : nombre de jours minimum après la fin de la session",
        int, 30, "training",
        help="Choix de l'organisme ; l'échéancier l'attend à 45 jours.",
    ),
)
SETTINGS = SETTINGS + JOURNEY_SETTINGS
