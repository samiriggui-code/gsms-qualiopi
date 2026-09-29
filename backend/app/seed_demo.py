"""Données de démonstration (organisme de formation en sécurité / sécurité incendie).

  python -m app.seed_demo           crée les données si la base ne contient aucun programme
  python -m app.seed_demo --force   ajoute les données même si des programmes existent

Les dates sont calculées par rapport au jour d'exécution : sessions terminées, en cours et à venir.
Quelques trous sont volontaires (analyse du besoin manquante, émargement formateur non signé…)
pour que le moteur Qualiopi ait des écarts à signaler.
"""

import argparse
import math
import random
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import session_factory
from app.training.models import (
    Agreement,
    Assessment,
    AttendanceSignature,
    AttendanceSlot,
    Certificate,
    Company,
    Convocation,
    Document,
    Enrollment,
    Learner,
    NeedsAnalysis,
    Organization,
    Positioning,
    Program,
    Trainer,
    TrainingSession,
)

AUTHOR = "Données de démo"

PROGRAMS = [
    dict(code="SSIAP1", title="SSIAP 1 — Agent de service de sécurité incendie", is_certifying=True, rncp_code="RS5642", duration_hours=70, price_eur=1390),
    dict(code="SSIAP1-REC", title="Recyclage SSIAP 1", is_certifying=True, duration_hours=14, price_eur=320),
    dict(code="SST", title="Sauveteur Secouriste du Travail", is_certifying=True, rncp_code="RS5997", duration_hours=14, price_eur=280),
    dict(code="MAC-APS", title="MAC APS — Maintien et actualisation des compétences", is_certifying=True, duration_hours=31, price_eur=490),
    dict(code="H0B0", title="Habilitation électrique H0B0", is_certifying=False, duration_hours=7, price_eur=190),
    dict(code="EPI", title="Manipulation des extincteurs et évacuation", is_certifying=False, duration_hours=4, price_eur=120),
    dict(code="GP", title="Gestes et postures", is_certifying=False, duration_hours=7, price_eur=180),
]

TRAINERS = [
    ("Karim", "Benali", False, ["SSIAP", "Évacuation"]),
    ("Sophie", "Marchetti", False, ["SST", "Gestes et postures"]),
    ("Julien", "Roux", False, ["APS", "Sûreté"]),
    ("Nadia", "Haddad", True, ["Habilitation électrique"]),
]

COMPANIES = [
    "Méditerranée Sécurité Services",
    "Clinique du Littoral",
    "Centre Commercial Grand Sud",
    "Logistique Provence",
    "Hôtels des Calanques",
]

FIRST_NAMES = [
    "Yanis", "Inès", "Mehdi", "Léa", "Rayan", "Camille", "Sofiane", "Manon", "Nicolas", "Sarah",
    "Bilal", "Chloé", "Thomas", "Amina", "Lucas", "Emma", "Walid", "Julie", "Hugo", "Yasmine",
    "Enzo", "Laura", "Anis", "Océane", "Kevin", "Myriam", "Maxime", "Lina", "Samir", "Pauline",
]
LAST_NAMES = [
    "Martin", "Bernard", "Dubois", "Garcia", "Moreau", "Laurent", "Simon", "Michel", "Lefèvre", "Mercier",
    "Belkacem", "Fontaine", "Rossi", "Nguyen", "Durand", "Chevalier", "Bouzid", "Girard", "Andre", "Perrin",
]

FUNDINGS = ["Entreprise", "OPCO", "CPF", "France Travail", "Personnel"]

# (programme, décalage du début en jours par rapport à aujourd'hui, statut, formateur, lieu, nb inscrits)
SESSIONS = [
    ("SSIAP1", -75, "CLOTUREE", 0, "Marseille — Centre FORM'SSI", 10),
    ("SST", -40, "CLOTUREE", 1, "Marseille — Centre FORM'SSI", 9),
    ("MAC-APS", -26, "TERMINEE", 2, "Marseille — Centre FORM'SSI", 8),
    ("H0B0", -12, "TERMINEE", 3, "Aubagne — Logistique Provence", 7),
    ("GP", -6, "TERMINEE", 1, "Marseille — Clinique du Littoral", 6),
    ("SSIAP1", -4, "EN_COURS", 0, "Marseille — Centre FORM'SSI", 11),
    ("EPI", 0, "EN_COURS", 0, "Marseille — Centre Commercial Grand Sud", 8),
    ("SSIAP1-REC", 8, "CONFIRMEE", 0, "Marseille — Centre FORM'SSI", 9),
    ("SST", 15, "CONFIRMEE", 1, "Marseille — Centre FORM'SSI", 7),
    ("MAC-APS", 29, "PLANIFIEE", 2, "Marseille — Centre FORM'SSI", 4),
    ("SSIAP1", 45, "PLANIFIEE", None, "Marseille — Centre FORM'SSI", 2),
]


def working_days(start: date, count: int) -> list[date]:
    days, d = [], start
    while len(days) < count:
        if d.weekday() < 5:
            days.append(d)
        d += timedelta(days=1)
    return days


def at(day: date, hour: int) -> datetime:
    return datetime.combine(day, time(hour, 0), tzinfo=timezone.utc)


def seed(db: Session) -> dict:
    rnd = random.Random(42)
    today = date.today()

    if db.scalar(select(Organization.id).limit(1)) is None:
        db.add(
            Organization(
                name="FORM'SSI — École de formation en sécurité & sécurité incendie",
                nda_number="93131234513",
                siret="12345678900012",
                action_categories=["AF"],
                disability_referent_name="Sophie Marchetti",
                disability_referent_email="handicap@formssi.fr",
                created_by=AUTHOR,
            )
        )

    programs = {}
    for spec in PROGRAMS:
        p = Program(
            code=spec["code"],
            title=spec["title"],
            is_certifying=spec["is_certifying"],
            rncp_code=spec.get("rncp_code"),
            duration_hours=Decimal(spec["duration_hours"]),
            price_eur=Decimal(spec["price_eur"]),
            prerequisites=["Maîtrise du français (lecture, écriture)"],
            objectives=[f"Acquérir les compétences visées par la formation {spec['code']}"],
            access_delay="15 jours ouvrés",
            accessibility_info="Locaux accessibles PMR. Contactez notre référente handicap pour toute adaptation.",
            public_info_reviewed_on=today - timedelta(days=rnd.randint(30, 400)),
            created_by=AUTHOR,
        )
        db.add(p)
        programs[spec["code"]] = p

    trainers = []
    for first, last, external, specialties in TRAINERS:
        t = Trainer(first_name=first, last_name=last, is_external=external, specialties=specialties,
                    email=f"{first.lower()}.{last.lower()}@formssi.fr", created_by=AUTHOR)
        db.add(t)
        trainers.append(t)

    companies = [Company(name=name, created_by=AUTHOR) for name in COMPANIES]
    db.add_all(companies)
    db.flush()

    learners = []
    used = set()
    while len(learners) < 60:
        first, last = rnd.choice(FIRST_NAMES), rnd.choice(LAST_NAMES)
        if (first, last) in used:
            continue
        used.add((first, last))
        company = rnd.choice(companies) if rnd.random() < 0.7 else None
        learners.append(
            Learner(first_name=first, last_name=last,
                    email=f"{first.lower()}.{last.lower()}@exemple.fr".replace("è", "e").replace("é", "e"),
                    company_id=company.id if company else None, created_by=AUTHOR)
        )
    db.add_all(learners)
    db.flush()

    counters: dict[str, int] = {}
    stats = {"sessions": 0, "enrollments": 0, "slots": 0}
    for code, offset, status, trainer_idx, location, enrolled_count in SESSIONS:
        program = programs[code]
        days = working_days(today + timedelta(days=offset), max(1, math.ceil(float(program.duration_hours) / 7)))
        counters[code] = counters.get(code, 0) + 1
        session = TrainingSession(
            reference=f"{code}-{days[0]:%y%m}-{counters[code]:02d}",
            program_id=program.id,
            start_date=days[0],
            end_date=days[-1],
            location=location,
            room="Salle A" if "FORM'SSI" in location else None,
            trainer_id=trainers[trainer_idx].id if trainer_idx is not None else None,
            capacity=12,
            status=status,
            created_by=AUTHOR,
        )
        db.add(session)
        db.flush()
        stats["sessions"] += 1

        started = days[0] <= today
        slots = []
        if status != "PLANIFIEE" or started:
            for day in days:
                for period in ("MATIN", "APRES_MIDI"):
                    past = day < today or (day == today and period == "MATIN")
                    slot = AttendanceSlot(session_id=session.id, day=day, period=period, created_by=AUTHOR)
                    # Trou volontaire : une demi-journée passée sans signature formateur
                    if past and not (code == "MAC-APS" and day == days[1] and period == "APRES_MIDI"):
                        slot.trainer_signed_at = at(day, 12 if period == "MATIN" else 17)
                    slots.append((slot, past))
                    db.add(slot)
            db.flush()
            stats["slots"] += len(slots)

        finished = status in ("TERMINEE", "CLOTUREE")
        for learner in rnd.sample(learners, enrolled_count):
            enrollment = Enrollment(
                session_id=session.id,
                learner_id=learner.id,
                company_id=learner.company_id,
                status="TERMINE" if finished else ("CONFIRME" if started or status == "CONFIRMEE" else "INSCRIT"),
                funding=rnd.choice(FUNDINGS),
                created_by=AUTHOR,
            )
            db.add(enrollment)
            db.flush()
            stats["enrollments"] += 1

            before = days[0] - timedelta(days=rnd.randint(10, 25))
            # Analyse du besoin : absente pour ~10 % des inscrits (écart à détecter)
            if rnd.random() > 0.1:
                adaptation = rnd.random() < 0.12
                db.add(NeedsAnalysis(enrollment_id=enrollment.id, completed_on=before,
                                     summary="Entretien téléphonique et questionnaire préalable.",
                                     adaptation_required=adaptation,
                                     adaptation_status="TRAITEE" if adaptation else "AUCUNE",
                                     created_by=AUTHOR))
            if program.is_certifying and rnd.random() > 0.08:
                db.add(Positioning(enrollment_id=enrollment.id, method="QCM de positionnement",
                                   completed_on=before + timedelta(days=2), level="Débutant",
                                   prerequisites_met=True, created_by=AUTHOR))
            if status != "PLANIFIEE":
                db.add(Convocation(enrollment_id=enrollment.id, sent_on=days[0] - timedelta(days=7), created_by=AUTHOR))
                db.add(Agreement(enrollment_id=enrollment.id, sent_on=before,
                                 signed_on=before + timedelta(days=3) if rnd.random() > 0.05 else None,
                                 created_by=AUTHOR))

            absent_slots = {rnd.randrange(len(slots))} if slots and rnd.random() < 0.2 else set()
            for i, (slot, past) in enumerate(slots):
                if not past:
                    continue
                present = i not in absent_slots
                db.add(AttendanceSignature(slot_id=slot.id, enrollment_id=enrollment.id, present=present,
                                           signed_at=slot.trainer_signed_at if present else None,
                                           created_by=AUTHOR))

            if finished:
                passed = rnd.random() > 0.1
                db.add(Assessment(enrollment_id=enrollment.id, kind="SOMMATIVE", label="Évaluation finale",
                                  assessed_on=days[-1], score=Decimal(rnd.randint(11 if passed else 6, 19)),
                                  passed=passed, created_by=AUTHOR))
                if passed:
                    db.add(Certificate(enrollment_id=enrollment.id,
                                       kind="CERTIFICAT" if program.is_certifying else "ATTESTATION",
                                       issued_on=days[-1] + timedelta(days=2), created_by=AUTHOR))

        db.add(Document(kind="PROGRAMME", title=f"Programme {program.title}", session_id=session.id,
                        program_id=program.id, status="EMIS", created_by=AUTHOR))
        if status != "PLANIFIEE":
            db.add(Document(kind="CONVOCATION", title=f"Convocations {session.reference}", session_id=session.id,
                            status="EMIS", created_by=AUTHOR))
        if finished:
            db.add(Document(kind="EMARGEMENT", title=f"Feuilles d'émargement {session.reference}",
                            session_id=session.id, status="SIGNE", signed_at=at(days[-1], 18),
                            signed_by=f"{trainers[trainer_idx].first_name} {trainers[trainer_idx].last_name}",
                            created_by=AUTHOR))
            db.add(Document(kind="ATTESTATION", title=f"Attestations de fin de formation {session.reference}",
                            session_id=session.id, status="EMIS", created_by=AUTHOR))

    db.commit()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    with session_factory()() as db:
        if not args.force and db.scalar(select(Program.id).limit(1)) is not None:
            print("Des programmes existent déjà : rien à faire (--force pour ajouter quand même).")
            return
        print("Données de démo créées :", seed(db))


if __name__ == "__main__":
    main()
