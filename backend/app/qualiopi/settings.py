"""Réglages du domaine qualité. Le référentiel et ses exigences ne sont PAS des réglages."""

from app.platform.settings import SettingDef

SETTINGS = (
    SettingDef(
        "quality.allow_self_validation",
        "La personne qui dépose une pièce peut aussi la valider",
        bool, False, "qualiopi", regulatory=True,
        help="Désactivé par défaut : une deuxième personne relit. Pour une petite équipe, chaque auto-validation reste signalée.",
    ),
)
