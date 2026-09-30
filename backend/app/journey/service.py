"""Parcours du stagiaire : chaque étape passe par JourneyPolicy (enforce), est journalisée et publiée.

Le moteur Qualiopi ne lit pas ces écritures directement : il reçoit l'événement (outbox), relit les
données et recalcule preuves, contrôles et échéancier.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.errors import InvalidStateError
from app.events.publish import publish
from app.journey import documents
from app.journey.policy import ACTIONS, OPEN, JourneyPolicy, missing_attendance, presences, survey_of
from app.platform.decisions import enforce
from app.qualiopi.schedule.service import due_date, load_circuit
from app.questionnaires import service as questionnaires
from app.training import models as t

ASSESSMENT_KINDS = ("FORMATIVE", "SOMMATIVE", "EXAMEN")
AGREEMENT_KINDS = ("CONVENTION", "CONTRAT")


def _text(inputs: dict, key: str, label: str) -> str:
    value = (inputs.get(key) or "").strip() if isinstance(inputs.get(key), str) else ""
    if not value:
        raise InvalidStateError(f"Indiquez : {label}")
    return value


def _date(inputs: dict, today: date, label: str = "la date", default_today: bool = True) -> date:
    raw = inputs.get("date")
    if raw is None:
        if default_today:
            return today
        raise InvalidStateError(f"Indiquez {label}")
    try:
        value = raw if isinstance(raw, date) else date.fromisoformat(str(raw))
    except ValueError as exc:
        raise InvalidStateError(f"Date invalide : {raw}") from exc
    if value > today:
        raise InvalidStateError(f"{label.capitalize()} ne peut pas être dans le futur")
    return value


def _decimal(inputs: dict, key: str, low: int, high: int, label: str) -> Decimal | None:
    raw = inputs.get(key)
    if raw in (None, ""):
        return None
    try:
        value = Decimal(str(raw))
    except InvalidOperation as exc:
        raise InvalidStateError(f"{label} : nombre attendu") from exc
    if not low <= value <= high:
        raise InvalidStateError(f"{label} : entre {low} et {high}")
    return value


def _event(db: Session, name: str, e: t.Enrollment, entity: str, entity_id: str, actor: User, payload: dict | None = None) -> None:
    publish(db, name, entity, entity_id, session_id=e.session_id, program_id=e.session.program_id,
            actor_id=actor.id, payload={"enrollment_id": e.id, **(payload or {})})


def apply(db: Session, e: t.Enrollment, action: str, inputs: dict, actor: User, today: date | None = None) -> dict:
    """Exécute une étape du parcours. Renvoie ce qui a été produit (document compris)."""
    today = today or date.today()
    enforce(JourneyPolicy(db, actor, today).decide(e, action))
    produced = getattr(_Steps(db, e, inputs, actor, today), action)()
    db.flush()
    db.refresh(e)
    return produced or {}


class _Steps:
    def __init__(self, db: Session, e: t.Enrollment, inputs: dict, actor: User, today: date):
        self.db, self.e, self.inputs, self.actor, self.today = db, e, inputs or {}, actor, today
        self.s = e.session

    def _status(self, to: str, payload: dict | None = None) -> dict:
        before = self.e.status
        self.e.status = to
        _event(self.db, "enrollment.updated", self.e, "enrollment", self.e.id, self.actor,
               {"from": before, "to": to, **(payload or {})})
        return {"statut": to}

    # ── Statut ───────────────────────────────────────────────────────────────────

    def confirmer(self) -> dict:
        return self._status("CONFIRME")

    def annuler(self) -> dict:
        self.e.abandon_reason = _text(self.inputs, "motif", "le motif de l'annulation")
        return self._status("ANNULE")

    def abandonner(self) -> dict:
        when = _date(self.inputs, self.today, "la date de départ")
        if not self.s.start_date <= when <= self.s.end_date:
            raise InvalidStateError("La date de départ doit être comprise dans les dates de la session")
        self.e.abandon_reason = _text(self.inputs, "motif", "le motif de l'abandon")
        self.e.abandoned_on = when
        return self._status("ABANDON", {"le": when.isoformat()})

    def terminer(self) -> dict:
        return self._status("TERMINE")

    # ── Avant la formation ───────────────────────────────────────────────────────

    def analyse_besoin(self) -> dict:
        na = self.e.needs_analysis or t.NeedsAnalysis(enrollment_id=self.e.id)
        na.completed_on = _date(self.inputs, self.today, "la date de l'analyse")
        na.summary = _text(self.inputs, "synthese", "la synthèse du besoin")
        na.adaptation_required = bool(self.inputs.get("adaptation"))
        if na.adaptation_required:
            na.adaptation_notes = _text(self.inputs, "adaptation_notes", "le besoin d'adaptation")
            na.adaptation_status = "A_TRAITER" if na.adaptation_status in (None, "AUCUNE") else na.adaptation_status
        else:
            na.adaptation_status = "AUCUNE"
        self.e.needs_analysis = na
        self.db.flush()
        _event(self.db, "needs_analysis.completed", self.e, "needs_analysis", na.id, self.actor)
        late = na.completed_on > self.s.start_date
        return {"analyse_besoin": na.completed_on.isoformat(), "alerte": "réalisée après le démarrage" if late else None}

    def positionnement(self) -> dict:
        pos = self.e.positioning or t.Positioning(enrollment_id=self.e.id)
        pos.completed_on = _date(self.inputs, self.today, "la date du positionnement")
        pos.method = _text(self.inputs, "methode", "la méthode de positionnement")
        pos.level = (self.inputs.get("niveau") or None)
        pos.prerequisites_met = self.inputs.get("prerequis_ok")
        self.e.positioning = pos
        self.db.flush()
        _event(self.db, "positioning.completed", self.e, "positioning", pos.id, self.actor)
        alert = None
        if pos.prerequisites_met is False:
            alert = "prérequis non atteints : décidez d'une adaptation ou d'une réorientation"
        elif pos.completed_on > self.s.start_date:
            alert = "réalisé après le démarrage"
        return {"positionnement": pos.completed_on.isoformat(), "alerte": alert}

    def convention_envoyer(self) -> dict:
        kind = self.inputs.get("type") or ("CONVENTION" if self.e.company_id else "CONTRAT")
        if kind not in AGREEMENT_KINDS:
            raise InvalidStateError(f"Type : {' ou '.join(AGREEMENT_KINDS)}")
        ag = self.e.agreement or t.Agreement(enrollment_id=self.e.id)
        ag.kind = kind
        ag.sent_on = _date(self.inputs, self.today, "la date d'envoi")
        self.e.agreement = ag
        self.db.flush()
        _event(self.db, "enrollment.updated", self.e, "agreement", ag.id, self.actor, {"agreement": "sent"})
        return {"convention": {"type": kind, "envoyee_le": ag.sent_on.isoformat()}}

    def convention_signer(self) -> dict:
        ag = self.e.agreement
        signed = _date(self.inputs, self.today, "la date de signature")
        if signed < ag.sent_on:
            raise InvalidStateError("La signature ne peut pas précéder l'envoi")
        ag.signed_on = signed
        ag.signed_by = _text(self.inputs, "signataire", "le signataire")
        _event(self.db, "agreement.signed", self.e, "agreement", ag.id, self.actor)
        return {"convention": {"type": ag.kind, "signee_le": signed.isoformat(), "par": ag.signed_by}}

    def convocation(self) -> dict:
        doc = documents.issue(self.db, self.e, "CONVOCATION", self.actor.id, self.today, self.inputs.get("motif"))
        conv = self.e.convocation or t.Convocation(enrollment_id=self.e.id)
        conv.sent_on = self.today
        conv.document_id = doc.id
        self.e.convocation = conv
        self.db.flush()
        _event(self.db, "convocation.sent", self.e, "convocation", conv.id, self.actor, {"document_id": doc.id})
        return {"document": documents.doc_view(doc)}

    # ── Pendant et après ─────────────────────────────────────────────────────────

    def evaluation(self) -> dict:
        kind = self.inputs.get("nature") or "SOMMATIVE"
        if kind not in ASSESSMENT_KINDS:
            raise InvalidStateError(f"Nature : {', '.join(ASSESSMENT_KINDS)}")
        when = _date(self.inputs, self.today, "la date de l'évaluation")
        if when < self.s.start_date:
            raise InvalidStateError("Avant le début de la session, c'est un positionnement")
        passed = self.inputs.get("reussi")
        a = t.Assessment(enrollment_id=self.e.id, kind=kind, label=_text(self.inputs, "intitule", "l'intitulé de l'évaluation"),
                         assessed_on=when, score=_decimal(self.inputs, "note", 0, 100, "Note"),
                         passed=passed if isinstance(passed, bool) else None)
        self.e.assessments.append(a)
        self.db.flush()
        _event(self.db, "assessment.completed", self.e, "assessment", a.id, self.actor)
        return {"evaluation": {"id": a.id, "intitule": a.label, "nature": kind}}

    def attestation(self) -> dict:
        cert = self.e.certificate
        reason = (self.inputs.get("motif") or "").strip() or None
        if cert is not None and cert.document_id and not reason:
            raise InvalidStateError("Attestation déjà émise : indiquez le motif de la réémission")
        doc = documents.issue(self.db, self.e, "ATTESTATION_FIN", self.actor.id, self.today, reason)
        if cert is None:
            cert = t.Certificate(enrollment_id=self.e.id)
            self.e.certificate = cert
        cert.kind = "ATTESTATION"
        cert.issued_on = self.today
        cert.document_id = doc.id
        self.db.flush()
        _event(self.db, "certificate.issued", self.e, "certificate", cert.id, self.actor, {"document_id": doc.id})
        return {"document": documents.doc_view(doc)}

    def _survey(self, audience: str) -> dict:
        sv = survey_of(self.db, self.e, audience)
        if sv is None:
            sv = t.SatisfactionSurvey(session_id=self.s.id, enrollment_id=self.e.id, audience=audience)
            self.db.add(sv)
        sv.answered_on = _date(self.inputs, self.today, "la date de réponse")
        sv.score = _decimal(self.inputs, "note", 0, 5, "Note sur 5")
        if sv.score is None:
            raise InvalidStateError("Indiquez la note sur 5")
        sv.comment = (self.inputs.get("commentaire") or None)
        self.db.flush()
        _event(self.db, "survey.completed", self.e, "satisfaction_survey", sv.id, self.actor, {"audience": audience})
        return {"satisfaction": {"public": audience, "note": str(sv.score)}}

    def satisfaction_chaud(self) -> dict:
        return self._survey("APPRENANT_CHAUD")

    def satisfaction_froid(self) -> dict:
        return self._survey("APPRENANT_FROID")


# ── Vue ──────────────────────────────────────────────────────────────────────────


def _d(value: date | None) -> str | None:
    return value.isoformat() if value else None


# Étape du parcours → jalon du circuit (mêmes échéances que l'échéancier Qualiopi).
STEP_MILESTONES = {
    "convention": "J-15.convention", "convocation": "J-10.convocation", "analyse_besoin": "J-5.besoin",
    "positionnement": "J-5.positionnement", "satisfaction_chaud": "FIN.satisfaction-chaud",
    "attestation": "FIN.attestation", "satisfaction_froid": "J+45.satisfaction-froid",
}


def _timing(step: dict, e: t.Enrollment, today: date) -> dict:
    """État d'une étape pour ce stagiaire : FAIT, A_VENIR, A_ECHEANCE, EN_RETARD ou SANS_OBJET."""
    s = e.session
    if step["fait"]:
        return {"etat": "FAIT", "echeance": None}
    if e.status == "ANNULE":
        return {"etat": "SANS_OBJET", "echeance": None}
    if step["etape"] == "emargement":
        if missing_attendance(e, today - timedelta(days=1)):
            return {"etat": "EN_RETARD", "echeance": None}
        return {"etat": "A_ECHEANCE" if step["manque"] else "A_VENIR", "echeance": None}
    milestones = {m.key: m for m in load_circuit().milestones}
    m = milestones.get(STEP_MILESTONES.get(step["etape"], ""))
    if m is not None:
        # Encore en formation : les étapes de fin (attestation, satisfaction) le concerneront.
        if e.status not in m.enrollments and not (e.status in OPEN and "TERMINE" in m.enrollments):
            return {"etat": "SANS_OBJET", "echeance": None}
        due, warn = due_date(m, s), m.warn_days
    else:  # évaluations : avant la fin de la session
        if e.status == "ABANDON":
            return {"etat": "SANS_OBJET", "echeance": None}
        due, warn = s.end_date, 1
    if today > due:
        state = "EN_RETARD"
    elif today >= due - timedelta(days=warn):
        state = "A_ECHEANCE"
    else:
        state = "A_VENIR"
    return {"etat": state, "echeance": due.isoformat()}


def _contact(db: Session, e: t.Enrollment) -> dict:
    """Coordonnées affichées dans la fiche stagiaire."""
    company_id = e.company_id or e.learner.company_id
    company = db.get(t.Company, company_id) if company_id else None
    return {"email": e.learner.email, "telephone": e.learner.phone, "entreprise": company.name if company else None,
            "financement": e.funding, "inscrit_le": _d(e.created_at.date()) if e.created_at else None}


def journey_view(db: Session, e: t.Enrollment, user: User | None, today: date | None = None) -> dict:
    """Où en est le stagiaire, étape par étape, ce qui est possible maintenant, et les documents émis."""
    today = today or date.today()
    s = e.session
    na, pos, ag, conv, cert = e.needs_analysis, e.positioning, e.agreement, e.convocation, e.certificate
    chaud, froid = survey_of(db, e, "APPRENANT_CHAUD"), survey_of(db, e, "APPRENANT_FROID")
    holes = missing_attendance(e, today)
    past = [sl for sl in s.attendance_slots if sl.day <= today]
    steps = [
        {"etape": "analyse_besoin", "fait": bool(na and na.completed_on), "le": _d(na.completed_on) if na else None,
         "detail": (na.summary if na else None), "adaptation": (na.adaptation_status if na and na.adaptation_required else None)},
        {"etape": "positionnement", "fait": bool(pos and pos.completed_on), "le": _d(pos.completed_on) if pos else None,
         "detail": (pos.method if pos else None), "prerequis_ok": pos.prerequisites_met if pos else None},
        {"etape": "convention", "fait": bool(ag and ag.signed_on), "le": _d(ag.signed_on) if ag else None,
         "detail": (f"{ag.kind.lower()} envoyée le {ag.sent_on:%d/%m/%Y}" if ag and ag.sent_on and not ag.signed_on
                    else (f"{ag.kind.lower()} signée par {ag.signed_by}" if ag and ag.signed_on else None))},
        {"etape": "convocation", "fait": bool(conv and conv.sent_on), "le": _d(conv.sent_on) if conv else None,
         "detail": "rédigée par le moteur" if conv and conv.document_id else ("déclarée sans document" if conv else None)},
        {"etape": "emargement", "fait": bool(past) and not holes, "le": None,
         "detail": f"{presences(e)} présence(s) émargée(s)" + (f", {len(holes)} demi-journée(s) sans rien" if holes else ""),
         "manque": holes},
        {"etape": "evaluations", "fait": bool(e.assessments), "le": _d(max((a.assessed_on for a in e.assessments), default=None)),
         "detail": f"{len(e.assessments)} évaluation(s)"},
        {"etape": "attestation", "fait": cert is not None, "le": _d(cert.issued_on) if cert else None,
         "detail": ("rédigée par le moteur" if cert and cert.document_id else ("enregistrée sans document" if cert else None))},
        {"etape": "satisfaction_chaud", "fait": bool(chaud and chaud.answered_on), "le": _d(chaud.answered_on) if chaud else None,
         "detail": f"{chaud.score}/5" if chaud and chaud.score is not None else None},
        {"etape": "satisfaction_froid", "fait": bool(froid and froid.answered_on), "le": _d(froid.answered_on) if froid else None,
         "detail": f"{froid.score}/5" if froid and froid.score is not None else None},
    ]
    for step in steps:
        step.update(_timing(step, e, today))
    return {
        "inscription": e.id, "stagiaire": e.learner.full_name, "session": s.reference, "statut": e.status,
        "contact": _contact(db, e),
        "abandon": {"le": _d(e.abandoned_on), "motif": e.abandon_reason} if e.status in ("ABANDON", "ANNULE") else None,
        "etapes": steps,
        "assiduite": documents.attendance_summary(e),
        "documents": [documents.doc_view(d) for d in documents.history(db, e)],
        "questionnaires": questionnaires.answers_view(db, e.id),  # envoyés en ligne : ouverts, répondus, réponses
        "capabilities": JourneyPolicy(db, user, today).capabilities(e),
    }


def session_journey(db: Session, s: t.TrainingSession, user: User | None, today: date | None = None) -> dict:
    """Tableau de la session : stagiaires × étapes (fait / pas fait), plus ce qui est possible."""
    rows = []
    for e in sorted(s.enrollments, key=lambda x: (x.learner.last_name, x.learner.first_name)):
        v = journey_view(db, e, user, today)
        rows.append({"inscription": e.id, "stagiaire": v["stagiaire"], "statut": v["statut"],
                     "etapes": {st["etape"]: st["fait"] for st in v["etapes"]},
                     "etats": {st["etape"]: st["etat"] for st in v["etapes"]},
                     "possible": [a for a, d in v["capabilities"].items() if d["allowed"]]})
    return {"session": s.reference, "statut": s.status, "stagiaires": rows,
            "etapes": [a for a in ("analyse_besoin", "positionnement", "convention", "convocation", "emargement",
                                   "evaluations", "attestation", "satisfaction_chaud", "satisfaction_froid")],
            "actions": {k: v.label for k, v in ACTIONS.items()}, "ouvertes": list(OPEN)}
