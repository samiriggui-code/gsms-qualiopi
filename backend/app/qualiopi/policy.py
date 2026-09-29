"""Politique du domaine qualité : décisions motivées, réglages lus via ConfigurationService."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.platform.decisions import ALLOW, Decision, deny
from app.platform.settings import ConfigurationService


class QualityPolicy:
    def __init__(self, db: Session, today: date | None = None):
        self.db = db
        self.today = today or date.today()
        self.config = ConfigurationService(db)

    def can_validate_own_piece(self) -> Decision:
        """Valider une pièce qu'on a soi-même déposée."""
        if self.config.get("quality.allow_self_validation", at=self.today):
            return ALLOW
        return deny("SELF_VALIDATION_FORBIDDEN",
                    "Vous avez déposé cette pièce : un autre membre de l'équipe doit la valider "
                    "(l'organisme n'autorise pas l'auto-validation)")
