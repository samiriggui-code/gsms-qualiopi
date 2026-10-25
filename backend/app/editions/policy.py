"""Politique des documents professionnels : ce qu'une personne peut faire sur un document, maintenant.

Même ordre que les autres domaines : permission, puis état, puis conditions (vérifications du contenu).
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import permissions_of
from app.editions import service
from app.editions.models import STATUSES, Project
from app.platform.decisions import ALLOW, Decision, deny

# action → (permission, statuts de départ, statut visé, saisie demandée)
ACTIONS: dict[str, tuple[str, tuple[str, ...], str, tuple[str, ...]]] = {
    "soumettre": ("documents.write", ("BROUILLON",), "EN_RELECTURE", ()),
    "renvoyer": ("documents.validate", ("EN_RELECTURE",), "BROUILLON", ("motif",)),
    "valider": ("documents.validate", ("EN_RELECTURE",), "VALIDE", ()),
    "envoyer": ("documents.write", ("VALIDE",), "ENVOYE", ("date",)),
    "reprendre": ("documents.write", ("VALIDE", "ENVOYE"), "BROUILLON", ("motif",)),
    "archiver": ("documents.validate", ("VALIDE", "ENVOYE"), "ARCHIVE", ()),
    "abandonner": ("documents.write", ("BROUILLON", "EN_RELECTURE", "VALIDE", "ENVOYE"), "ABANDONNE", ("motif",)),
}
LABELS = {
    "soumettre": "Envoyer en relecture",
    "renvoyer": "Renvoyer en préparation",
    "valider": "Valider et archiver",
    "envoyer": "Marquer comme envoyé",
    "reprendre": "Reprendre (nouvelle version)",
    "archiver": "Archiver",
    "abandonner": "Abandonner",
}
NEEDS_CHECKS = ("soumettre", "valider")


class EditionPolicy:
    def __init__(self, db: Session, user: User | None, today: date | None = None):
        self.db = db
        self.user = user
        self.today = today or date.today()

    def _has(self, permission: str) -> bool:
        return self.user is None or permission in permissions_of(self.db, self.user)

    def can_edit(self, project: Project) -> Decision:
        if not self._has("documents.write"):
            return deny("PERMISSION_MISSING", "Permission « documents.write » requise")
        if project.status != "BROUILLON":
            return deny("NOT_DRAFT", f"Document {STATUSES[project.status].lower()} : le reprendre pour le modifier")
        return ALLOW

    def decide(self, project: Project, action: str, issues: list[dict] | None = None) -> Decision:
        spec = ACTIONS.get(action)
        if spec is None:
            return deny("UNKNOWN_ACTION", f"Action inconnue : {action}")
        permission, sources, _, _ = spec
        if not self._has(permission):
            return deny("PERMISSION_MISSING", f"Permission « {permission} » requise")
        if project.status not in sources:
            return deny("INVALID_TRANSITION", f"Document {STATUSES[project.status].lower()}")
        if action in NEEDS_CHECKS:
            issues = service.checks(self.db, project, self.today) if issues is None else issues
            if issues:
                return deny("CHECKS_FAILED", f"{len(issues)} point(s) à corriger avant validation", issues)
        return ALLOW

    def capabilities(self, project: Project, issues: list[dict]) -> dict[str, dict]:
        out = {"modifier": self.can_edit(project).to_dict()}
        for name, (_, _, _, inputs) in ACTIONS.items():
            d = self.decide(project, name, issues).to_dict()
            d["libelle"] = LABELS[name]
            if inputs:
                d["a_saisir"] = list(inputs)
            out[name] = d
        return out
