"""Politique des actions correctives : ce qu'une personne peut faire sur une action, maintenant.

Même ordre que les autres domaines : permission, puis état, puis conditions. Une action issue d'un
contrôle n'est jamais close par un humain : on demande au moteur de réévaluer, et c'est lui qui clôt
si l'écart a disparu.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import permissions_of
from app.platform.decisions import ALLOW, Decision, deny
from app.qualiopi.capa.models import CapaAction
from app.qualiopi.capa.service import TRANSITIONS
from app.qualiopi.evaluation.models import Finding

# action → (permission, statut visé, saisie demandée)
ACTIONS: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "demarrer": ("quality.write", "EN_COURS", ()),
    "realiser": ("quality.write", "A_VERIFIER", ("note",)),
    "verifier": ("evidence.validate", "CLOTUREE", ()),
    "annuler": ("quality.write", "ANNULEE", ("motif",)),
}
LABELS = {
    "demarrer": "Démarrer",
    "realiser": "Déclarer réalisée",
    "verifier": "Vérifier l'efficacité",
    "annuler": "Annuler l'action",
}
STATUS_LABELS = {"OUVERTE": "ouverte", "EN_COURS": "en cours", "A_VERIFIER": "à vérifier", "CLOTUREE": "clôturée", "ANNULEE": "annulée"}


def is_late(capa: CapaAction, today: date) -> bool:
    return capa.status in ("OUVERTE", "EN_COURS") and capa.due_on < today


class CapaPolicy:
    def __init__(self, db: Session, user: User | None, today: date | None = None):
        self.db = db
        self.user = user
        self.today = today or date.today()

    def can_open(self, finding: Finding) -> Decision:
        if self.user is not None and "quality.write" not in permissions_of(self.db, self.user):
            return deny("PERMISSION_MISSING", "Permission « quality.write » requise")
        if finding.status in ("RESOLU", "FAUX_POSITIF"):
            return deny("FINDING_CLOSED", "Écart résolu : pas d'action à ouvrir")
        return ALLOW

    def decide(self, capa: CapaAction, action: str) -> Decision:
        spec = ACTIONS.get(action)
        if spec is None:
            return deny("UNKNOWN_ACTION", f"Action inconnue : {action}")
        permission, target, _ = spec
        if self.user is not None and permission not in permissions_of(self.db, self.user):
            return deny("PERMISSION_MISSING", f"Permission « {permission} » requise")
        if capa.status in ("CLOTUREE", "ANNULEE"):
            return deny("CAPA_CLOSED", f"Action {STATUS_LABELS[capa.status]}")
        if action == "realiser" and capa.status not in ("OUVERTE", "EN_COURS"):
            return deny("INVALID_TRANSITION", f"Action {STATUS_LABELS[capa.status]}")
        if action != "realiser" and target not in TRANSITIONS[capa.status]:
            return deny("INVALID_TRANSITION", f"Action {STATUS_LABELS[capa.status]}")
        if action == "verifier":
            if any(e.kind == "VERIFICATION_REQUESTED" for e in capa.events[-1:]):
                return deny("VERIFICATION_PENDING", "Vérification demandée : le moteur réévalue le contrôle")
        return ALLOW

    def capabilities(self, capa: CapaAction) -> dict[str, dict]:
        out = {}
        for name, (_, _, inputs) in ACTIONS.items():
            d = self.decide(capa, name).to_dict()
            d["libelle"] = LABELS[name]
            if inputs:
                d["a_saisir"] = list(inputs)
            out[name] = d
        return out
