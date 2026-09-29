"""Jeu de données de démonstration avec des trous volontaires.

Toutes les dates sont relatives à `today` : la démo reste cohérente quel que soit le jour.
Chaque trou planté est listé dans PLANTED_GAPS avec le résultat que le moteur doit produire ;
les tests vérifient que le moteur les trouve tous, et rien d'autre.

Noms, organismes et codes sont fictifs.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError
from app.core.journal import set_actor
from app.training import models as t

ACTOR = "démo"

LEARNERS = [
    ("Camille", "Durand"), ("Hugo", "Lefèvre"), ("Inès", "Moreau"), ("Lucas", "Garnier"),
    ("Léa", "Faure"), ("Nathan", "Rousseau"), ("Chloé", "Blanc"), ("Yanis", "Guerin"),
    ("Manon", "Muller"), ("Théo", "Henry"), ("Sarah", "Roussel"), ("Adam", "Nicolas"),
    ("Jade", "Perrin"), ("Louis", "Morin"), ("Emma", "Mathieu"), ("Noah", "Clement"),
    ("Lina", "Gauthier"), ("Raphaël", "Dumont"),
]


@dataclass(frozen=True)
class Gap:
    """Un trou planté et ce que le moteur doit en dire."""

    control: str  # clé du contrôle
    target: str  # référence de session, code formation, ou « organisme »
    status: str  # état attendu
    why: str


PLANTED_GAPS = (
    Gap("I01.public-info", "SST", "PREUVES_INSUFFISANTES", "rubrique accessibilité handicap absente"),
    Gap("I02.results", "SST", "PREUVES_INSUFFISANTES", "aucun taux publié"),
    Gap("I04.needs-analysis", "SST-2026-02", "PREUVES_INSUFFISANTES", "1 apprenant sur 3 sans analyse du besoin"),
    Gap("I08.positioning-before-start", "SSIAP1-2026-01", "A_RISQUE", "Adam Nicolas sans positionnement (11/12)"),
    Gap("I10.adaptations", "SST-2026-02", "PREUVES_INSUFFISANTES", "adaptation demandée, non traitée"),
    Gap("I12.attendance", "SSIAP1-2026-01", "A_RISQUE", "une demi-journée non signée par Chloé Blanc"),
    Gap("I12.dropouts", "SSIAP1-2026-01", "PREUVES_INSUFFISANTES", "abandon sans motif"),
    Gap("I20.disability-referent", "organisme", "PREUVES_INSUFFISANTES", "référent handicap sans coordonnées"),
    Gap("I21.trainer-qualification", "SST-2026-02", "PREUVES_INSUFFISANTES", "qualification du formateur expirée avant le début"),
    Gap("I24.watch-jobs", "organisme", "PREUVES_INSUFFISANTES", "veille métiers notée mais non exploitée"),
    Gap("I25.watch-pedagogy", "organisme", "A_RISQUE", "veille pédagogique exploitée il y a plus d'un an"),
    Gap("I30.learner-surveys", "SSIAP1-2026-01", "A_RISQUE", "10 questionnaires à chaud sur 12"),
    Gap("I31.complaints", "organisme", "PREUVES_INSUFFISANTES", "réclamation sans réponse depuis 20 jours"),
    Gap("I32.improvement", "organisme", "PREUVES_INSUFFISANTES", "aucune action d'amélioration clôturée"),
)


def _at(d: date, hour: int) -> datetime:
    return datetime.combine(d, time(hour), tzinfo=timezone.utc)


def _doc(db: Session, kind: str, title: str, **kw) -> t.Document:  # noqa: ANN003
    doc = t.Document(
        kind=kind,
        title=title,
        status="EMIS",
        sha256=hashlib.sha256(f"{kind}:{title}".encode()).hexdigest(),
        created_by=ACTOR,
        **kw,
    )
    db.add(doc)
    db.flush()
    return doc


def _slots(db: Session, s: t.TrainingSession, days: list[date]) -> list[t.AttendanceSlot]:
    slots = []
    for d in days:
        for period in ("MATIN", "APRES_MIDI"):
            sl = t.AttendanceSlot(session_id=s.id, day=d, period=period, created_by=ACTOR)
            db.add(sl)
            slots.append(sl)
    db.flush()
    return slots


def _sign(db: Session, slot: t.AttendanceSlot, e: t.Enrollment, signed: bool = True) -> None:
    hour = 9 if slot.period == "MATIN" else 14
    db.add(t.AttendanceSignature(slot_id=slot.id, enrollment_id=e.id, present=True,
                                 signed_at=_at(slot.day, hour) if signed else None, created_by=ACTOR))


def _enroll(db: Session, s: t.TrainingSession, learner: t.Learner, status: str) -> t.Enrollment:
    e = t.Enrollment(session_id=s.id, learner_id=learner.id, status=status, funding="OPCO", created_by=ACTOR)
    db.add(e)
    db.flush()
    return e


def seed_demo(db: Session, today: date | None = None) -> dict:
    """Crée l'organisme de démonstration. Refuse si un organisme existe déjà."""
    today = today or date.today()
    set_actor(db, ACTOR)
    if db.scalar(select(t.Organization)) is not None:
        raise ConflictError("Un organisme existe déjà : la démo ne s'installe que sur une base vide")

    def d(days: int) -> date:
        return today + timedelta(days=days)

    db.add(t.Organization(
        name="Organisme de démonstration", nda_number="00 00 00000 00", siret="00000000000000",
        action_categories=["AF"], disability_referent_name="Nadia Roux", created_by=ACTOR,
    ))  # trou : référent handicap sans e-mail (I20)
    db.add(t.PartnerNetwork(kind="HANDICAP", name="Réseau handicap du département", last_contact_on=d(-60), created_by=ACTOR))
    db.add(t.WatchItem(domain="LEGALE", title="Réforme du financement de la formation", noted_on=d(-45),
                       exploitation="Conditions générales mises à jour", exploited_on=d(-30), created_by=ACTOR))
    db.add(t.WatchItem(domain="METIERS", title="Évolution du métier d'agent SSIAP", noted_on=d(-40), created_by=ACTOR))  # trou I24
    db.add(t.WatchItem(domain="PEDAGOGIQUE", title="Classe inversée en sécurité incendie", noted_on=d(-520),
                       exploitation="Module e-learning ajouté", exploited_on=d(-500), created_by=ACTOR))  # trou I25
    db.add(t.Complaint(kind="RECLAMATION", stakeholder="ENTREPRISE", received_on=d(-20),
                       description="Facture reçue sans l'attestation de présence.", created_by=ACTOR))  # trou I31

    ssiap = t.Program(
        code="SSIAP1", title="Agent de service de sécurité incendie (SSIAP 1)", action_category="AF",
        is_certifying=True, rncp_code="RS00000", duration_hours=Decimal("70"), price_eur=Decimal("1200"),
        prerequisites=["Aptitude médicale", "Secourisme SST ou PSC1 en cours de validité"],
        objectives=["Prévenir les risques d'incendie dans un établissement recevant du public",
                    "Intervenir face à un début d'incendie et évacuer le public"],
        content="Le feu et ses conséquences ; sécurité incendie ; installations techniques ; rôle de l'agent.",
        teaching_methods="Apports théoriques, exercices sur plateau technique, mises en situation.",
        evaluation_methods="QCM et épreuve pratique devant jury.",
        access_delay="Inscription jusqu'à 10 jours avant le démarrage",
        accessibility_info="Locaux accessibles ; adaptations étudiées avec la référente handicap.",
        certification_alignment="Correspondance module par module avec le référentiel de certification.",
        public_info_reviewed_on=d(-30), success_rate=Decimal("92"), satisfaction_rate=Decimal("4.6"),
        created_by=ACTOR,
    )
    sst = t.Program(
        code="SST", title="Sauveteur secouriste du travail", action_category="AF", is_certifying=False,
        duration_hours=Decimal("14"), price_eur=Decimal("250"),
        prerequisites=["Aucun"], objectives=["Porter secours à une victime sur son lieu de travail"],
        content="Protéger, examiner, alerter, secourir.",
        teaching_methods="Démonstrations et cas pratiques.", evaluation_methods="Évaluation certificative continue.",
        access_delay="Sous 15 jours", public_info_reviewed_on=d(-60), created_by=ACTOR,
    )  # trous : accessibilité absente (I01), aucun taux publié (I02)
    db.add_all([ssiap, sst])

    karim = t.Trainer(first_name="Karim", last_name="Benali", specialties=["SSIAP"], created_by=ACTOR)
    julie = t.Trainer(first_name="Julie", last_name="Martin", specialties=["SST"], is_external=True, created_by=ACTOR)
    db.add_all([karim, julie])
    db.flush()
    db.add(t.TrainerQualification(trainer_id=karim.id, label="SSIAP 3", obtained_on=d(-900), valid_until=d(400),
                                  document_id=_doc(db, "JUSTIFICATIF", "Diplôme SSIAP 3 — K. Benali").id, created_by=ACTOR))
    db.add(t.TrainerQualification(trainer_id=julie.id, label="Formatrice SST", obtained_on=d(-800), valid_until=d(-10),
                                  document_id=_doc(db, "JUSTIFICATIF", "Certificat formatrice SST — J. Martin").id,
                                  created_by=ACTOR))  # trou I21 : expirée 7 jours avant le début de SST-2026-02
    db.add(t.StaffDevelopmentAction(trainer_id=karim.id, label="Recyclage pédagogique", planned_on=d(-120),
                                    completed_on=d(-100), created_by=ACTOR))

    learners = [t.Learner(first_name=f, last_name=n, email=f"{f.lower()}.{n.lower()}@exemple.fr", created_by=ACTOR) for f, n in LEARNERS]
    db.add_all(learners)
    db.flush()

    # ── Session terminée : SSIAP1-2026-01 ────────────────────────────────────────
    s1 = t.TrainingSession(reference="SSIAP1-2026-01", program_id=ssiap.id, start_date=d(-40), end_date=d(-36),
                           location="Centre de Bobigny", room="Plateau technique", trainer_id=karim.id,
                           capacity=14, status="TERMINEE", created_by=ACTOR)
    db.add(s1)
    db.flush()
    slots1 = _slots(db, s1, [d(-40 + i) for i in range(5)])
    for i, learner in enumerate(learners[:12]):
        e = _enroll(db, s1, learner, "TERMINE")
        db.add(t.NeedsAnalysis(enrollment_id=e.id, completed_on=d(-55), summary="Projet professionnel validé", created_by=ACTOR))
        if i != 11:  # trou I08 : Adam Nicolas n'a pas de positionnement
            db.add(t.Positioning(enrollment_id=e.id, method="QCM d'entrée", completed_on=d(-50), level="débutant",
                                 prerequisites_met=True, created_by=ACTOR))
        db.add(t.Convocation(enrollment_id=e.id, sent_on=d(-50), created_by=ACTOR))
        db.add(t.Agreement(enrollment_id=e.id, sent_on=d(-52), signed_on=d(-48), created_by=ACTOR))
        for sl in slots1:
            _sign(db, sl, e, signed=not (i == 6 and sl is slots1[3]))  # trou I12 : Chloé Blanc, 1 demi-journée
        db.add(t.Assessment(enrollment_id=e.id, kind="SOMMATIVE", label="QCM final", assessed_on=d(-36),
                            score=Decimal("15"), passed=True, created_by=ACTOR))
        db.add(t.Assessment(enrollment_id=e.id, kind="EXAMEN", label="Épreuve pratique devant jury", assessed_on=d(-36),
                            passed=True, created_by=ACTOR))
        db.add(t.Certificate(enrollment_id=e.id, kind="CERTIFICAT", issued_on=d(-35), created_by=ACTOR))
        if i < 10:  # trou I30 : 10 réponses à chaud sur 12
            db.add(t.SatisfactionSurvey(session_id=s1.id, enrollment_id=e.id, audience="APPRENANT_CHAUD",
                                        sent_on=d(-36), answered_on=d(-36), score=Decimal("4.5"), created_by=ACTOR))
    # trou I12 : abandon au 2e jour, sans motif
    quit_ = _enroll(db, s1, learners[12], "ABANDON")
    quit_.abandoned_on = d(-39)
    db.add(t.NeedsAnalysis(enrollment_id=quit_.id, completed_on=d(-55), created_by=ACTOR))
    for sl in slots1[:3]:
        _sign(db, sl, quit_)

    # ── Session en cours : SST-2026-02 ───────────────────────────────────────────
    s2 = t.TrainingSession(reference="SST-2026-02", program_id=sst.id, start_date=d(-3), end_date=d(1),
                           location="Centre de Bobigny", room="Salle 2", trainer_id=julie.id, capacity=10,
                           status="EN_COURS", created_by=ACTOR)
    db.add(s2)
    db.flush()
    slots2 = _slots(db, s2, [d(-3), d(-2), d(-1), d(0), d(1)])
    for i, learner in enumerate(learners[13:16]):
        e = _enroll(db, s2, learner, "CONFIRME")
        if i == 1:
            db.add(t.NeedsAnalysis(enrollment_id=e.id, completed_on=d(-10), summary="Aucun besoin particulier", created_by=ACTOR))
        if i == 2:  # trou I10 : adaptation demandée, pas traitée
            db.add(t.NeedsAnalysis(enrollment_id=e.id, completed_on=d(-10), summary="Malentendance",
                                   adaptation_required=True, adaptation_status="A_TRAITER", created_by=ACTOR))
        # i == 0 : trou I04, aucune analyse du besoin
        db.add(t.Positioning(enrollment_id=e.id, method="Entretien", completed_on=d(-8), prerequisites_met=True, created_by=ACTOR))
        db.add(t.Convocation(enrollment_id=e.id, sent_on=d(-12), created_by=ACTOR))
        db.add(t.Agreement(enrollment_id=e.id, sent_on=d(-14), signed_on=d(-11), created_by=ACTOR))
        for sl in slots2:
            if sl.day <= today:
                _sign(db, sl, e)

    # ── Session à venir : SSIAP1-2026-03 (rien n'est encore exigible) ─────────────
    s3 = t.TrainingSession(reference="SSIAP1-2026-03", program_id=ssiap.id, start_date=d(30), end_date=d(34),
                           location="Centre de Bobigny", trainer_id=karim.id, capacity=14, status="PLANIFIEE",
                           created_by=ACTOR)
    db.add(s3)
    db.flush()
    for learner in learners[16:18]:
        _enroll(db, s3, learner, "INSCRIT")

    db.flush()
    return {"sessions": [s1.reference, s2.reference, s3.reference], "programs": [ssiap.code, sst.code], "gaps": len(PLANTED_GAPS)}
