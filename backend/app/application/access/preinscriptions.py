"""Politique des demandes de préinscription : ce qu'une personne peut faire sur une demande, maintenant.

Ordre d'évaluation : permission, état de la demande, puis (conversion) les règles d'inscription de la
session, reprises telles quelles de TrainingPolicy : aucune règle d'inscription n'est recodée ici.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.access.training import TrainingPolicy
from app.application.service.platform.decisions import ALLOW, Decision, deny
from app.middleware.auth import permissions_of
from app.types import training as t
from app.types.auth import User
from app.types.preinscriptions import OPEN_STATUSES, STATUSES, Preinscription

# Statut visé → statuts de départ possibles. CONVERTIE ne s'atteint que par la conversion.
TRANSITIONS: dict[str, tuple[str, ...]] = {
    "EN_COURS": ("NOUVELLE", "REFUSEE"),
    "REFUSEE": ("NOUVELLE", "EN_COURS"),
}
TRANSITION_LABELS = {"EN_COURS": "Prendre en charge", "REFUSEE": "Refuser"}


def same_learner(db: Session, p: Preinscription) -> t.Learner | None:
    """Stagiaire déjà connu sous la même adresse e-mail : la conversion le reprend au lieu d'en créer un autre."""
    return db.scalar(select(t.Learner).where(func.lower(t.Learner.email) == p.email.lower()).order_by(t.Learner.created_at))


class PreinscriptionPolicy:
    def __init__(self, db: Session, user: User | None, today: date | None = None):
        self.db = db
        self.user = user
        self.today = today or date.today()

    def _has(self, permission: str) -> bool:
        return self.user is None or permission in permissions_of(self.db, self.user)

    def change_status(self, p: Preinscription, target: str) -> Decision:
        if not self._has("leads.write"):
            return deny("PERMISSION_MISSING", "Permission « leads.write » requise")
        if target not in TRANSITIONS:
            return deny("UNKNOWN_STATUS", f"Statut impossible à choisir : {target} (la conversion a sa propre action)")
        if p.status not in TRANSITIONS[target]:
            return deny("INVALID_TRANSITION",
                        f"Demande {STATUSES[p.status].lower()} : passage à « {STATUSES[target].lower()} » impossible")
        return ALLOW

    def convert(self, p: Preinscription, session: t.TrainingSession | None) -> Decision:
        """Toutes les raisons qui empêchent la conversion, pas seulement la première."""
        reasons: list[dict] = []
        for permission in ("leads.write", "sessions.write"):
            if not self._has(permission):
                reasons.append({"code": "PERMISSION_MISSING", "message": f"Permission « {permission} » requise"})
        if p.status not in OPEN_STATUSES:
            reasons.append({"code": "INVALID_TRANSITION", "message": f"Demande {STATUSES[p.status].lower()} : rien à convertir"})
        if session is not None:
            enroll = TrainingPolicy(self.db, self.user, self.today).decide(session, "enroll")
            if not enroll.allowed and enroll.code != "PERMISSION_MISSING":  # permission déjà signalée
                reasons.append({"code": enroll.code, "message": f"Session {session.reference} : {enroll.message}"})
            learner = same_learner(self.db, p)
            if learner is not None and any(e.learner_id == learner.id for e in session.enrollments):
                reasons.append({"code": "ALREADY_ENROLLED",
                                "message": f"{learner.full_name} est déjà inscrit(e) à la session {session.reference}"})
        if reasons:
            return deny("CONVERSION_IMPOSSIBLE", "Conversion impossible : " + " ; ".join(r["message"] for r in reasons), reasons)
        return ALLOW

    def capabilities(self, p: Preinscription) -> dict[str, dict]:
        out = {}
        for target, label in TRANSITION_LABELS.items():
            out[target] = self.change_status(p, target).to_dict() | {"libelle": label}
        out["REFUSEE"]["a_saisir"] = ["motif"]
        out["convertir"] = self.convert(p, None).to_dict() | {"libelle": "Convertir en stagiaire"}
        return out
