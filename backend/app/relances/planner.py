"""Planificateur des relances : qui reçoit quoi, et quand. Appelé par le worker (et à la demande).

Idempotent : chaque occurrence (règle, personne, échéance) a une clé unique ; un second passage le
même jour ne crée rien. Un message est rédigé à la planification ; sa condition est relue avant
l'envoi. Rattrapage limité : une échéance passée depuis plus de N jours n'est plus envoyée.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import permissions_of
from app.core.config import get_settings
from app.platform.features import is_enabled
from app.platform.settings import ConfigurationService
from app.qualiopi.capa.models import CapaAction
from app.qualiopi.capa.policy import is_late
from app.qualiopi.common import next_reference
from app.qualiopi.evaluation.models import Finding
from app.qualiopi.schedule.models import MilestoneStatus
from app.relances.conditions import CONDITIONS, Ctx
from app.relances.models import Message
from app.relances.render import render
from app.relances.rules import WEEKDAYS, Rule, load_rules
from app.training import models as t

WEEKDAY_NAMES = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
INVITATIONS = {  # questionnaire → (objet, phrase d'accroche, durée)
    "BESOIN_POSITIONNEMENT": ("Préparez votre formation", "Pour adapter la formation à votre situation, merci de répondre "
                              "à quelques questions sur vos attentes et votre niveau avant le démarrage.", "3 minutes"),
    "SATISFACTION_CHAUD": ("Votre avis sur la formation", "Vous venez de terminer votre formation : votre avis nous aide "
                           "à l'améliorer.", "2 minutes"),
    "SATISFACTION_FROID": ("Que vous reste-t-il de la formation ?", "Quelques semaines ont passé : avez-vous pu mettre "
                           "en pratique ce que vous avez appris ?", "2 minutes"),
    "ENTREPRISE_FROID": ("Votre avis sur la formation de votre salarié", "Votre salarié a suivi une formation chez nous : "
                         "qu'en retirez-vous aujourd'hui ?", "2 minutes"),
}
DOCUMENTS = {  # document → (objet, phrase, libellé du bouton)
    "CONVOCATION": ("Votre convocation", "Voici votre convocation : dates, horaires, lieu et contact.", "Voir ma convocation"),
    "ATTESTATION_FIN": ("Votre attestation de fin de formation", "Votre attestation de fin de formation est disponible.",
                        "Voir mon attestation"),
}


@dataclass(frozen=True)
class Recipient:
    kind: str
    name: str | None
    email: str | None


def _d(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def _people_with(db: Session, permission: str, kind: str) -> list[Recipient]:
    """Comptes actifs qui ont la permission, hors direction (prévenue seulement si personne d'autre)."""
    users = [u for u in db.scalars(select(User).where(User.is_active.is_(True))) if permission in permissions_of(db, u)]
    staff = [u for u in users if "admin" not in u.roles] or users
    return [Recipient(kind, u.full_name, u.email) for u in sorted(staff, key=lambda u: u.email)]


def _signatory(e: t.Enrollment, db: Session) -> tuple[Recipient, str]:
    """Qui doit signer : l'entreprise pour une convention, sinon le stagiaire (contrat, L. 6353-3)."""
    company_id = e.company_id or e.learner.company_id
    company = db.get(t.Company, company_id) if company_id else None
    kind = e.agreement.kind if e.agreement else ("CONVENTION" if company is not None else "CONTRAT")
    document = "la convention" if kind == "CONVENTION" else "le contrat de formation"
    if kind == "CONVENTION" and company is not None:
        return Recipient("ENTREPRISE", company.contact_name or company.name, company.contact_email), document
    return Recipient("STAGIAIRE", e.learner.full_name, e.learner.email), document


class Planner:
    def __init__(self, db: Session, today: date):
        self.db = db
        self.today = today
        self.config = ConfigurationService(db)
        self.grace = self.config.get("relances.rattrapage_jours", at=today)
        self.validate_external = self.config.get("relances.validation_externe", at=today)
        org = db.scalar(select(t.Organization))
        self.org = {
            "nom": (self.config.get("general.brand_short_name") or (org.name if org else "Organisme de formation")),
            "couleur": self.config.get("general.brand_color"),
            "reponse": self.config.get("relances.adresse_reponse", at=today) or None,
        }
        self.referent = (f"{org.disability_referent_name}" + (f" ({org.disability_referent_email})" if org.disability_referent_email else "")
                         if org and org.disability_referent_name else None)
        self.url = get_settings().public_url.rstrip("/")
        self.created = 0
        self.cancelled = 0

    # ── Données prêtes à afficher (le modèle ne calcule rien) ────────────────────

    def _session_view(self, s: t.TrainingSession) -> dict:
        return {
            "id": s.id, "reference": s.reference, "debut": _d(s.start_date), "fin": _d(s.end_date),
            "dates": f"du {_d(s.start_date)} au {_d(s.end_date)}" if s.end_date != s.start_date else _d(s.start_date),
            "lieu": ", ".join(x for x in (s.location, s.room) if x) or None,
            "formateur": s.trainer.full_name if s.trainer else None,
        }

    def _horaires(self, s: t.TrainingSession) -> list[str]:
        days: dict[date, list[str]] = {}
        for sl in sorted(s.attendance_slots, key=lambda x: (x.day, x.period != "MATIN")):
            if sl.start_time and sl.end_time:
                days.setdefault(sl.day, []).append(f"{sl.start_time:%H:%M}–{sl.end_time:%H:%M}")
        return [f"{WEEKDAY_NAMES[d.weekday()]} {_d(d)} : {' et '.join(v)}" for d, v in days.items()]

    def _base(self, s: t.TrainingSession | None) -> dict:
        ctx: dict = {"organisme": self.org}
        if s is not None:
            ctx |= {"session": self._session_view(s), "formation": s.program.title}
        return ctx

    def _staff_action(self, s: t.TrainingSession) -> dict:
        return {"libelle": "Ouvrir la session", "lien": f"{self.url}/sessions/{s.id}"}

    def _view(self, rule: Rule, s: t.TrainingSession | None, e: t.Enrollment | None, recipient: Recipient,
              relance: bool, extra: dict | None = None) -> dict:
        ctx = self._base(s) | {"destinataire": {"nom": recipient.name}, "relance": relance} | (extra or {})
        if rule.modele == "rappel_session":
            ctx |= {"horaires": self._horaires(s), "referent_handicap": self.referent}
        elif rule.modele == "recapitulatif_formateur":
            active = [x for x in s.enrollments if x.status in ("INSCRIT", "CONFIRME")]
            points = []
            for x in active:
                na, pos = x.needs_analysis, x.positioning
                if na and na.adaptation_required and na.adaptation_status in ("AUCUNE", "A_TRAITER"):
                    points.append(f"Adaptation à traiter : {x.learner.full_name}" + (f" ({na.summary})" if na.summary else ""))
                if pos is None or pos.completed_on is None:
                    points.append(f"Positionnement non réalisé : {x.learner.full_name}")
                elif pos.prerequisites_met is False:
                    points.append(f"Prérequis non atteints : {x.learner.full_name}")
            for q in (s.trainer.qualifications if s.trainer else []):
                if q.valid_until and q.valid_until < self.today:
                    points.append(f"Votre titre « {q.label} » a expiré le {_d(q.valid_until)} : à renouveler")
                elif q.valid_until and q.valid_until < s.end_date:
                    points.append(f"Votre titre « {q.label} » expire le {_d(q.valid_until)}, avant la fin de la session")
            ctx |= {"stagiaires": [x.learner.full_name for x in active], "points": points, "action": self._staff_action(s)}
        elif rule.questionnaire:
            from app.questionnaires.service import get_or_create, link

            inv = get_or_create(self.db, e, rule.questionnaire, self.today)
            sujet, phrase, duree = INVITATIONS[rule.questionnaire]
            ctx |= {"stagiaire": e.learner.full_name, "action": {"libelle": "Répondre au questionnaire", "lien": link(inv)},
                    "invitation": {"sujet": sujet, "phrase": phrase, "duree": duree, "expire": _d(inv.expires_on)}}
        elif rule.document:
            from app.questionnaires import tokens

            doc_id = e.convocation.document_id if rule.document == "CONVOCATION" else e.certificate.document_id
            sujet, phrase, bouton = DOCUMENTS[rule.document]
            ctx |= {"document": {"sujet": sujet, "phrase": phrase},
                    "action": {"libelle": bouton, "lien": f"{self.url}/api/public/documents/{tokens.sign('document', f'{e.id}:{doc_id}')}"}}
        elif rule.modele == "evaluations_manquantes":
            ctx |= {"stagiaires": [x.learner.full_name for x in s.enrollments
                                   if x.status in ("INSCRIT", "CONFIRME", "TERMINE") and not x.assessments],
                    "action": self._staff_action(s)}
        return ctx

    # ── Création ─────────────────────────────────────────────────────────────────

    def _create(self, rule: Rule, occurrence: str, recipient: Recipient, context: dict, due: date,
                s: t.TrainingSession | None = None, e: t.Enrollment | None = None, milestone: str | None = None) -> None:
        key = f"{occurrence}|{(recipient.email or 'sans-adresse').lower()}"
        if self.db.scalar(select(Message.id).where(Message.occurrence_key == key)):
            return
        # Une relance remplace la précédente restée en attente de validation (même règle, même personne).
        for old in self.db.scalars(select(Message).where(
                Message.rule_key == rule.cle, Message.status == "A_VALIDER", Message.recipient_email == recipient.email,
                Message.enrollment_id == (e.id if e else None), Message.session_id == (s.id if s else None))):
            old.status, old.cancel_reason = "ANNULE", f"Remplacé par la relance du {_d(due)}"
            self.cancelled += 1
        out = render(rule.modele, context)
        if not recipient.email:
            status = "SANS_ADRESSE"
        elif rule.externe and self.validate_external:
            status = "A_VALIDER"
        else:
            status = "PREVU"
        self.db.add(Message(
            reference=next_reference(self.db, "MSG"), occurrence_key=key, rule_key=rule.cle, template=rule.modele,
            template_version=out.version, external=rule.externe, recipient_kind=recipient.kind,
            recipient_name=recipient.name, recipient_email=recipient.email, subject=out.subject, body_html=out.html,
            body_text=out.text, body_sha256=hashlib.sha256(out.html.encode()).hexdigest(), status=status, due_on=due,
            session_id=s.id if s else None, enrollment_id=e.id if e else None, milestone_key=milestone,
            indicators=rule.indicateurs, created_by="relances",
        ))
        self.created += 1

    def _due_window(self, due: date) -> bool:
        return 0 <= (self.today - due).days <= self.grace

    def _sessions(self) -> list[t.TrainingSession]:
        return list(self.db.scalars(select(t.TrainingSession).where(t.TrainingSession.status != "ANNULEE")))

    def _recipients(self, kind: str, s: t.TrainingSession | None) -> list[Recipient]:
        if kind == "FORMATEUR":
            return [Recipient("FORMATEUR", s.trainer.full_name, s.trainer.email)] if s and s.trainer else []
        if kind == "GESTION":
            return _people_with(self.db, "enrollments.write", "GESTION")
        if kind == "QUALITE":
            return _people_with(self.db, "evidence.validate", "QUALITE")
        raise ValueError(kind)

    def run(self) -> dict:
        disabled = set(self.config.get("relances.regles_desactivees", at=self.today))
        rules = [r for r in load_rules() if r.cle not in disabled]
        sessions = self._sessions()
        for rule in rules:
            check = CONDITIONS[rule.condition]
            if rule.portee in ("INSCRIPTION", "SESSION"):
                for s in sessions:
                    anchor = s.start_date if rule.ancre == "debut" else s.end_date
                    for n, offset in enumerate(rule.decalages):
                        due = anchor + timedelta(days=offset)
                        if not self._due_window(due):
                            continue
                        occurrence = f"{rule.cle}|{s.id}|{offset}"
                        if rule.portee == "SESSION":
                            if check(Ctx(self.db, self.today, session=s)):
                                for r in self._recipients(rule.destinataire, s):
                                    self._create(rule, occurrence, r, self._view(rule, s, None, r, n > 0), due, s=s)
                            continue
                        for e in s.enrollments:
                            if not check(Ctx(self.db, self.today, session=s, enrollment=e)):
                                continue
                            if rule.destinataire == "SIGNATAIRE":
                                r, document = _signatory(e, self.db)
                                extra = {"document": document, "stagiaire": e.learner.full_name}
                            elif rule.destinataire == "ENTREPRISE":
                                company = self.db.get(t.Company, e.company_id or e.learner.company_id)
                                r, extra = Recipient("ENTREPRISE", company.contact_name or company.name, company.contact_email), {}
                            else:
                                r, extra = Recipient("STAGIAIRE", e.learner.full_name, e.learner.email), {}
                            self._create(rule, f"{rule.cle}|{e.id}|{offset}", r, self._view(rule, s, e, r, n > 0, extra), due, s=s, e=e)
            elif rule.portee == "JALON":
                by_id = {s.id: s for s in sessions}
                for m in self.db.scalars(select(MilestoneStatus).where(MilestoneStatus.status.in_(("A_ECHEANCE", "EN_RETARD")))):
                    s = by_id.get(m.session_id)
                    if s is None or not check(Ctx(self.db, self.today, session=s, milestone=m)):
                        continue
                    owner = {"gestion": "GESTION", "formateur": "FORMATEUR", "qualite": "QUALITE"}.get(m.owner, "GESTION")
                    jalon = {"libelle": m.label, "en_retard": m.status == "EN_RETARD", "echeance": _d(m.due_on),
                             "fait": m.done, "total": m.total, "manquants": [x["who"] for x in m.missing]}
                    for r in self._recipients(owner, s):
                        ctx = self._base(s) | {"destinataire": {"nom": r.name}, "jalon": jalon, "action": self._staff_action(s)}
                        self._create(rule, f"{rule.cle}|{s.id}|{m.key}|{m.status}", r, ctx, self.today, s=s, milestone=m.key)
            elif rule.portee == "HEBDO" and self.today.weekday() == WEEKDAYS[rule.jour]:
                week = self.today.isocalendar()
                ctx = self._base(None) | self._digest()
                for r in self._recipients(rule.destinataire, None):
                    self._create(rule, f"{rule.cle}|{week.year}-S{week.week:02d}", r,
                                 ctx | {"destinataire": {"nom": r.name}}, self.today)
        self._drop_obsolete()
        self.db.flush()
        return {"crees": self.created, "annules": self.cancelled}

    def _digest(self) -> dict:
        refs = {s.id: s.reference for s in self.db.scalars(select(t.TrainingSession))}
        milestones = list(self.db.scalars(select(MilestoneStatus).where(MilestoneStatus.status.in_(("A_ECHEANCE", "EN_RETARD")))
                                          .order_by(MilestoneStatus.due_on)))
        line = lambda m: f"{refs.get(m.session_id, '?')} — {m.label} (échéance {_d(m.due_on)}, {m.done}/{m.total})"  # noqa: E731
        horizon = self.today + timedelta(days=60)
        titres = [f"{q.label} — {q.trainer.full_name} : expire le {_d(q.valid_until)}"
                  for q in self.db.scalars(select(t.TrainerQualification).where(
                      t.TrainerQualification.valid_until.is_not(None), t.TrainerQualification.valid_until <= horizon))
                  .all() if q.valid_until >= self.today - timedelta(days=365)]
        return {
            "date": _d(self.today),
            "ecarts": len(list(self.db.scalars(select(Finding.id).where(Finding.status.in_(("OUVERT", "EN_TRAITEMENT")))))),
            "actions_en_retard": [f"{a.reference} — {a.title} ({a.owner_name}, échéance {_d(a.due_on)})"
                                  for a in self.db.scalars(select(CapaAction)) if is_late(a, self.today)],
            "jalons_en_retard": [line(m) for m in milestones if m.status == "EN_RETARD"],
            "jalons_a_echeance": [line(m) for m in milestones if m.status == "A_ECHEANCE"],
            "titres": titres,
            "action": {"libelle": "Ouvrir GSMS", "lien": f"{self.url}/sessions"},
        }

    def _drop_obsolete(self) -> None:
        """Messages en attente de validation devenus sans objet (la chose a été faite entre-temps)."""
        from app.relances.service import still_relevant

        for msg in self.db.scalars(select(Message).where(Message.status == "A_VALIDER")):
            reason = still_relevant(self.db, msg, self.today)
            if reason:
                msg.status, msg.cancel_reason = "ANNULE", reason
                self.cancelled += 1


def plan(db: Session, today: date | None = None) -> dict:
    if not is_enabled(db, "relances"):
        return {"crees": 0, "annules": 0, "inactif": True}
    return Planner(db, today or date.today()).run()
