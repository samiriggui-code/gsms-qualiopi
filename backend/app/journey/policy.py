"""Politique du parcours du stagiaire : ce qu'on peut faire sur une inscription, maintenant, et sinon pourquoi.

Ordre d'évaluation (le même pour l'API et pour l'affichage) :
1. permission, puis portée (un formateur n'agit que sur ses sessions) ;
2. état de la session et de l'inscription ;
3. conditions métier, avec le détail de ce qui manque.

Les conditions remplies par une saisie (date, motif, note) ne bloquent pas l'affichage : l'écran
sait qu'il doit les demander (`a_saisir`), l'API les exige au moment de l'action.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.attendance.policy import expected_on, recorded, signature_of
from app.auth.models import User
from app.auth.security import permissions_of
from app.platform.decisions import ALLOW, Decision, deny
from app.platform.settings import ConfigurationService
from app.training import models as t
from app.training.access import can_see
from app.training.lifecycle import LOCKED_STATES

OPEN = ("INSCRIT", "CONFIRME")
ENDED = ("TERMINE", "ABANDON")
PERIODS = {"MATIN": "matin", "APRES_MIDI": "après-midi"}
STATUS_LABELS = {"INSCRIT": "inscrite", "CONFIRME": "confirmée", "TERMINE": "terminée", "ABANDON": "abandonnée", "ANNULE": "annulée"}


@dataclass(frozen=True)
class Step:
    label: str
    permission: str
    inputs: tuple[str, ...] = ()


ACTIONS: dict[str, Step] = {
    # Statut de l'inscription
    "confirmer": Step("Confirmer l'inscription", "enrollments.write"),
    "annuler": Step("Annuler l'inscription", "enrollments.write", ("motif",)),
    "abandonner": Step("Enregistrer un abandon", "enrollments.write", ("date", "motif")),
    "terminer": Step("Constater la fin de formation", "enrollments.write"),
    # Avant la formation
    "analyse_besoin": Step("Analyse du besoin", "enrollments.write", ("date", "synthese")),
    "positionnement": Step("Positionnement à l'entrée", "learners.assess", ("date", "methode")),
    "convention_envoyer": Step("Envoyer la convention ou le contrat", "enrollments.write"),
    "convention_signer": Step("Enregistrer la signature de la convention", "enrollments.write", ("date", "signataire")),
    "convocation": Step("Émettre la convocation", "enrollments.write"),
    # Pendant et après
    "evaluation": Step("Enregistrer une évaluation des acquis", "learners.assess", ("date", "intitule")),
    "attestation": Step("Émettre l'attestation de fin de formation", "enrollments.write"),
    "satisfaction_chaud": Step("Satisfaction à chaud", "learners.assess", ("date", "note")),
    "satisfaction_froid": Step("Satisfaction à froid", "enrollments.write", ("date", "note")),
}


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def presences(e: t.Enrollment) -> int:
    return sum(1 for sig in e.signatures if sig.present and sig.signed_at is not None)


def missing_attendance(e: t.Enrollment, today: date) -> list[str]:
    """Demi-journées passées où l'on attendait ce stagiaire et où rien n'est noté."""
    out = []
    for sl in sorted(e.session.attendance_slots, key=lambda x: (x.day, x.period != "MATIN")):
        if sl.day <= today and expected_on(sl, e) and not recorded(signature_of(sl, e.id)):
            out.append(f"{_fmt(sl.day)} {PERIODS.get(sl.period, sl.period.lower())}")
    return out


def survey_of(db: Session, e: t.Enrollment, audience: str) -> t.SatisfactionSurvey | None:
    return db.scalar(select(t.SatisfactionSurvey).where(
        t.SatisfactionSurvey.enrollment_id == e.id, t.SatisfactionSurvey.audience == audience))


class JourneyPolicy:
    def __init__(self, db: Session, user: User | None, today: date | None = None):
        self.db = db
        self.user = user
        self.today = today or date.today()
        self.config = ConfigurationService(db)

    def decide(self, e: t.Enrollment, action: str, for_display: bool = False) -> Decision:
        step = ACTIONS.get(action)
        if step is None:
            return deny("UNKNOWN_ACTION", f"Action inconnue : {action}")
        if self.user is not None:
            perms = permissions_of(self.db, self.user)
            if step.permission not in perms:
                return deny("PERMISSION_MISSING", f"Permission « {step.permission} » requise")
            if not can_see(self.db, self.user, e.session):
                return deny("OUT_OF_SCOPE", "Session hors de votre portée")
        s = e.session
        if s.status in LOCKED_STATES:
            return deny("SESSION_LOCKED", f"Session {s.status.lower()} : le parcours ne se modifie plus")
        if e.status == "ANNULE":
            return deny("ENROLLMENT_CANCELLED", "Inscription annulée")
        return getattr(self, f"_{action}")(e, s)

    def capabilities(self, e: t.Enrollment) -> dict[str, dict]:
        out = {}
        for name, step in ACTIONS.items():
            d = self.decide(e, name, for_display=True).to_dict()
            d["libelle"] = step.label
            if step.inputs:
                d["a_saisir"] = list(step.inputs)
            out[name] = d
        return out

    # ── Statut ───────────────────────────────────────────────────────────────────

    def _require_open(self, e: t.Enrollment) -> Decision | None:
        if e.status not in OPEN:
            return deny("ENROLLMENT_ENDED", f"Inscription {STATUS_LABELS.get(e.status, e.status.lower())}")
        return None

    def _confirmer(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if e.status != "INSCRIT":
            return deny("INVALID_TRANSITION", f"Inscription déjà {STATUS_LABELS.get(e.status, e.status.lower())}")
        if self.config.get("journey.confirm_requires_agreement", at=self.today) and not (e.agreement and e.agreement.signed_on):
            return deny("AGREEMENT_NOT_SIGNED", "Réglage de l'organisme : la convention ou le contrat doit être signé")
        return ALLOW

    def _annuler(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if (d := self._require_open(e)) is not None:
            return d
        if presences(e):
            return deny("ATTENDANCE_RECORDED", f"{presences(e)} présence(s) émargée(s) : enregistrez un abandon, pas une annulation")
        return ALLOW

    def _abandonner(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if (d := self._require_open(e)) is not None:
            return d
        if self.today < s.start_date:
            return deny("NOT_STARTED_YET", f"La session commence le {_fmt(s.start_date)} : avant, c'est une annulation")
        return ALLOW

    def _terminer(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if (d := self._require_open(e)) is not None:
            return d
        if self.today < s.end_date:
            return deny("NOT_ENDED_YET", f"La session se termine le {_fmt(s.end_date)}")
        if not presences(e):
            return deny("NO_ATTENDANCE", "Aucune présence émargée : annulation ou abandon, pas une fin de formation")
        return ALLOW

    # ── Avant la formation ───────────────────────────────────────────────────────

    def _analyse_besoin(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        return self._require_open(e) or ALLOW

    def _positionnement(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        return self._require_open(e) or ALLOW

    def _convention_envoyer(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if (d := self._require_open(e)) is not None:
            return d
        if e.agreement and e.agreement.signed_on:
            return deny("AGREEMENT_SIGNED", f"{e.agreement.kind.title()} déjà signé(e) le {_fmt(e.agreement.signed_on)}")
        return ALLOW

    def _convention_signer(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if (d := self._require_open(e)) is not None:
            return d
        ag = e.agreement
        if ag is None or ag.sent_on is None:
            return deny("AGREEMENT_NOT_SENT", "Envoyez d'abord la convention ou le contrat")
        if ag.signed_on:
            return deny("AGREEMENT_SIGNED", f"Déjà signé(e) le {_fmt(ag.signed_on)}")
        return ALLOW

    def _convocation(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if (d := self._require_open(e)) is not None:
            return d
        if self.today > s.start_date:
            return deny("SESSION_STARTED", f"La session a commencé le {_fmt(s.start_date)}")
        missing = []
        if not s.location:
            missing.append("lieu de la session")
        if not any(sl.start_time for sl in s.attendance_slots):
            missing.append("demi-journées planifiées (elles donnent les horaires)")
        if missing:
            return deny("CONVOCATION_INCOMPLETE", "À renseigner avant la convocation : " + " ; ".join(missing), missing)
        return ALLOW

    # ── Pendant et après ─────────────────────────────────────────────────────────

    def _evaluation(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if self.today < s.start_date:
            return deny("NOT_STARTED_YET", f"La session commence le {_fmt(s.start_date)} : avant, c'est un positionnement")
        return ALLOW

    def _attestation(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if e.status not in ENDED:
            return deny("ENROLLMENT_NOT_ENDED", "Constatez d'abord la fin de formation ou l'abandon")
        details = []
        holes = missing_attendance(e, self.today)
        if holes:
            details.append({"type": "EMARGEMENT_MANQUANT", "demi_journees": holes})
        if self.config.get("journey.certificate_requires_assessment", at=s.end_date) and not e.assessments:
            details.append({"type": "EVALUATION_MANQUANTE"})
        if details:
            parts = []
            if holes:
                parts.append(f"{len(holes)} demi-journée(s) sans présence ni absence notée (la durée suivie serait fausse)")
            if any(d["type"] == "EVALUATION_MANQUANTE" for d in details):
                parts.append("aucune évaluation des acquis (L. 6353-1 : l'attestation en donne les résultats)")
            return deny("CERTIFICATE_REQUIREMENTS_MISSING", "À réunir : " + " ; ".join(parts), details)
        return ALLOW

    def _satisfaction_chaud(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if self.today < s.end_date:
            return deny("NOT_ENDED_YET", f"À recueillir en fin de session ({_fmt(s.end_date)})")
        if e.status not in (*OPEN, *ENDED):
            return deny("ENROLLMENT_ENDED", f"Inscription {STATUS_LABELS.get(e.status, e.status.lower())}")
        return ALLOW

    def _satisfaction_froid(self, e: t.Enrollment, s: t.TrainingSession) -> Decision:
        if e.status != "TERMINE":
            return deny("ENROLLMENT_NOT_ENDED", "Seulement pour un stagiaire ayant terminé")
        days = self.config.get("journey.cold_survey_min_days", at=self.today)
        start = s.end_date + timedelta(days=days)
        if self.today < start:
            return deny("TOO_EARLY", f"À froid : à partir du {_fmt(start)} ({days} jours après la fin)")
        return ALLOW
