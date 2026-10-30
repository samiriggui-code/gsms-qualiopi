"""Aide au bilan pédagogique et financier (BPF, cerfa 10443, art. L. 6352-11 et R. 6352-22 à R. 6352-24 du Code du
travail). Sources : `docs/bilans/SOURCES.md`.

Ce module NE PRODUIT PAS le BPF. Il agrège, pour un exercice, ce que les données de GSMS permettent de compter
(stagiaires, heures-stagiaires, formateurs, heures dispensées…) et marque explicitement chaque cadre du formulaire
qu'il ne sait pas calculer faute de données (produits et charges comptables, spécialités NSF, actions reçues en
sous-traitance…). La déclaration se fait par l'organisme sur « Mon activité formation » ; les chiffres d'ici sont à
rapprocher de sa comptabilité et de ses dossiers.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.errors.errors import InvalidStateError
from app.types import training as t
from app.types.funding import INACTIVE, FundingCase, FundingSource, FundingStep

CALCULE, INDICATIF, PARTIEL, NON_CALCULABLE = "CALCULE", "INDICATIF", "PARTIEL", "NON_CALCULABLE"
SOURCES = [
    "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037386206",
    "https://entreprendre.service-public.gouv.fr/vosdroits/R73152",
    "https://travail-emploi.gouv.fr/sites/travail-emploi/files/files-spip/pdf/bilan_pedagogique_et_financier_notice.pdf",
]
# Dispositif de financement → ligne du cadre F-1 qu'il SUGGÈRE (type de stagiaire). Indicatif : c'est la situation de
# la personne qui compte, pas le financeur (le CPF, par exemple, sert aux salariés comme aux demandeurs d'emploi).
F1_LINES = {"ENTREPRISE": "a", "OPCO": "a", "FRANCE_TRAVAIL": "c", "PERSONNEL": "d"}
# Dispositif → ligne du cadre C qu'il suggère (origine des produits), mêmes réserves.
C_LINES = {"ENTREPRISE": "1", "OPCO": "h", "CPF": "e", "FRANCE_TRAVAIL": "7", "PERSONNEL": "9"}


def bounds(exercice: int, today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    if exercice > today.year:
        raise InvalidStateError("Exercice à venir : rien à agréger")
    return date(exercice, 1, 1), date(exercice, 12, 31)


def _hours(sl: t.AttendanceSlot) -> Decimal | None:
    if sl.start_time is None or sl.end_time is None:
        return None
    seconds = (datetime.combine(sl.day, sl.end_time) - datetime.combine(sl.day, sl.start_time)).total_seconds()
    return Decimal(int(seconds)) / Decimal(3600)


def _n(value: Decimal | None) -> float | None:
    return None if value is None else round(float(value), 2)


def _block(cadre: str, intitule: str, etat: str, valeurs: dict | None = None, manque: str | None = None,
           methode: str | None = None) -> dict:
    return {"cadre": cadre, "intitule": intitule, "etat": etat, "valeurs": valeurs or {}, "manque": manque,
            "methode": methode}


def _scheme_of(e: t.Enrollment, cases: dict[str, FundingCase]) -> str | None:
    case = cases.get(e.id)
    active = [s for s in (case.sources if case else []) if s.state not in INACTIVE]
    if active:
        return active[0].scheme
    return (e.funding or "").strip().upper().replace(" ", "_") or None


def _objective(p: t.Program, certs: dict[str, t.ProgramCertification]) -> str:
    """Ligne du cadre F-3 (objectif général) quand les données la donnent, sinon « non classé »."""
    if p.action_category == "BC":
        return "e"
    if p.action_category == "VAE":
        return "f"
    basis = certs[p.id].basis if p.id in certs else None
    code = (certs[p.id].code if p.id in certs else None) or p.rncp_code or ""
    if basis == "RNCP" or (basis is None and code.upper().startswith("RNCP")):
        return "a"
    if basis == "RS" or (basis is None and code.upper().startswith("RS")):
        return "b"
    return "non_classe"  # c (CQP hors répertoires) ou d (autres formations) : la donnée ne les distingue pas


def bpf(db: Session, exercice: int, with_finance: bool, today: date | None = None) -> dict:
    today = today or date.today()
    start, end = bounds(exercice, today)
    sessions = list(db.scalars(
        select(t.TrainingSession)
        .where(t.TrainingSession.start_date <= end, t.TrainingSession.end_date >= start,
               t.TrainingSession.status != "ANNULEE")
        .options(selectinload(t.TrainingSession.program), selectinload(t.TrainingSession.trainer),
                 selectinload(t.TrainingSession.enrollments).selectinload(t.Enrollment.signatures),
                 selectinload(t.TrainingSession.attendance_slots))))
    enrollments = [e for s in sessions for e in s.enrollments if e.status != "ANNULE"]
    ids = [e.id for e in enrollments]
    cases = ({c.enrollment_id: c for c in db.scalars(
        select(FundingCase).where(FundingCase.enrollment_id.in_(ids)).options(selectinload(FundingCase.sources)))}
        if ids else {})
    certs = {c.program_id: c for c in db.scalars(select(t.ProgramCertification))}

    # ── Heures-stagiaires : présences émargées sur l'exercice, sinon durée du programme (estimation) ──
    per_enrollment: dict[str, Decimal] = {}
    estimated: set[str] = set()
    not_counted = 0  # inscriptions dont on ne sait pas compter les heures
    untimed_presences = 0
    trainer_hours: dict[str, Decimal] = defaultdict(Decimal)
    for s in sessions:
        slots = [sl for sl in s.attendance_slots if start <= sl.day <= end]
        if s.attendance_slots:
            slot_ids = {sl.id: sl for sl in slots}
            for sl in slots:
                h = _hours(sl)
                if h is not None and s.trainer_id and sl.day <= today:
                    trainer_hours[s.trainer_id] += h
            for e in s.enrollments:
                if e.status == "ANNULE":
                    continue
                total = Decimal(0)
                for sig in e.signatures:
                    sl = slot_ids.get(sig.slot_id)
                    if sl is None or not sig.present:
                        continue
                    h = _hours(sl)
                    if h is None:
                        untimed_presences += 1
                    else:
                        total += h
                per_enrollment[e.id] = total
        else:
            hours = s.program.duration_hours if s.program else None
            inside = start <= s.start_date and s.end_date <= end and s.end_date <= today
            for e in s.enrollments:
                if e.status == "ANNULE":
                    continue
                if hours is not None and inside:
                    per_enrollment[e.id] = Decimal(hours)
                    estimated.add(e.id)
                else:
                    not_counted += 1
            if hours is not None and inside and s.trainer_id:
                trainer_hours[s.trainer_id] += Decimal(hours)

    def hours_of(es: list[t.Enrollment]) -> float:
        return _n(sum((per_enrollment.get(e.id, Decimal(0)) for e in es), Decimal(0))) or 0.0

    total_hours = hours_of(enrollments)
    estimated_hours = _n(sum((per_enrollment[i] for i in estimated), Decimal(0))) or 0.0
    session_of = {e.id: s for s in sessions for e in s.enrollments}

    # ── Cadre F-1 : type de stagiaires, d'après le financement déclaré (indicatif) ──
    f1: dict[str, list[t.Enrollment]] = defaultdict(list)
    schemes: dict[str, int] = defaultdict(int)
    for e in enrollments:
        sch = _scheme_of(e, cases)
        schemes[sch or "NON_RENSEIGNE"] += 1
        f1[F1_LINES.get(sch or "", "a_confirmer")].append(e)
    distance = [e for e in enrollments
                if session_of[e.id].program and session_of[e.id].program.delivery_mode in ("DISTANCE", "MIXTE")]

    # ── Cadre F-2 : sessions confiées à un sous-traitant ──
    sub = [e for e in enrollments if session_of[e.id].subcontractor_id]

    # ── Cadre F-3 : objectif général (RNCP, RS, bilan, VAE) ──
    f3: dict[str, list[t.Enrollment]] = defaultdict(list)
    for e in enrollments:
        p = session_of[e.id].program
        f3[_objective(p, certs) if p else "non_classe"].append(e)

    # ── Cadre E : formateurs des sessions de l'exercice ──
    trainers = {s.trainer_id: s.trainer for s in sessions if s.trainer_id and s.trainer}
    e_lines = {"internes": [tr for tr in trainers.values() if not tr.is_external],
               "externes": [tr for tr in trainers.values() if tr.is_external]}

    def line(es: list[t.Enrollment]) -> dict:
        return {"stagiaires": len(es), "heures": hours_of(es)}

    method_hours = ("Heures-stagiaires = présences émargées sur l'exercice × durée de la demi-journée ; pour une session "
                    "sans demi-journées, terminée et entièrement dans l'exercice, durée du programme (estimation).")
    org = db.scalar(select(t.Organization))
    cadres = [
        _block("A", "Identification de l'organisme", PARTIEL,
               {"raison_sociale": org.name if org else None, "numero_declaration": org.nda_number if org else None,
                "siret": org.siret if org else None, "exercice": {"du": start.isoformat(), "au": end.isoformat()}},
               manque="Adresse, forme juridique et autres rubriques du cadre : non enregistrées dans GSMS.",
               methode="Exercice supposé civil : si l'exercice comptable de l'organisme diffère, les chiffres sont à refaire "
                       "sur ses dates."),
        _block("B", "Caractéristiques de l'organisme", NON_CALCULABLE,
               manque="Non enregistrées dans GSMS."),
        _block("C", "Bilan financier hors taxes : origine des produits", NON_CALCULABLE,
               _finance(db, start, end) if with_finance else {},
               manque="Produits comptables hors taxes de l'exercice : la facturation n'est pas gérée dans GSMS. Les "
                      "paiements enregistrés dans les dossiers de financement (montants saisis, sans distinction HT/TTC) "
                      "ne sont qu'une indication à rapprocher de la comptabilité."
                      + ("" if with_finance else " Indications masquées : permission « funding.read » ou module "
                                                 "Financement requis.")),
        _block("D", "Bilan financier hors taxes : charges de l'organisme", NON_CALCULABLE,
               manque="Charges, salaires des formateurs, achats de formation : données comptables absentes de GSMS."),
        _block("E", "Personnes dispensant des heures de formation", INDICATIF,
               {k: {"formateurs": len(v), "heures": _n(sum((trainer_hours[tr.id] for tr in v), Decimal(0))) or 0.0}
                for k, v in e_lines.items()},
               manque="Seul le formateur principal de chaque session est connu ; « interne / externe » vient de la fiche "
                      "formateur et ne distingue pas salariés, bénévoles, prestataires et sous-traitants comme le cerfa.",
               methode="Heures dispensées = demi-journées passées de l'exercice (horaires enregistrés) ; session sans "
                       "demi-journées : durée du programme."),
        _block("F-1", "Type de stagiaires de l'organisme", INDICATIF,
               {"total": line(enrollments),
                "par_ligne_suggeree": {k: line(v) for k, v in sorted(f1.items())},
                "par_financement": dict(sorted(schemes.items())),
                "a_distance": len(distance)},
               manque="La situation de chaque stagiaire (salarié, apprenti, demandeur d'emploi, particulier, autre) n'est "
                      "pas enregistrée : la répartition est suggérée par le financement et doit être confirmée. "
                      "« a_confirmer » : CPF, autres financements ou financement non renseigné.",
               methode=method_hours),
        _block("F-2", "Activité sous-traitée de l'organisme", CALCULE, line(sub),
               methode="Sessions de l'exercice confiées à un sous-traitant (champ sous-traitant de la session)."),
        _block("F-3", "Objectif général des prestations", PARTIEL,
               {k: line(v) for k, v in sorted(f3.items())},
               manque="Lignes c (CQP hors répertoires) et d (autres formations) non distinguées : « non_classe ». Le niveau "
                      "de qualification RNCP n'est pas enregistré.",
               methode="Fondement de la certification de la fiche formation (RNCP, RS), catégorie d'action (BC, VAE)."),
        _block("F-4", "Spécialités de formation", NON_CALCULABLE,
               manque="Le code de spécialité (nomenclature NSF) n'est pas enregistré sur les formations."),
        _block("G", "Stagiaires confiés par un autre organisme de formation", NON_CALCULABLE,
               manque="GSMS n'enregistre pas les actions réalisées pour le compte d'un autre organisme."),
    ]
    return {
        "exercice": exercice, "du": start.isoformat(), "au": end.isoformat(), "exercice_clos": end < today,
        "synthese": {"sessions": len(sessions), "stagiaires": len(enrollments),
                     "personnes": len({e.learner_id for e in enrollments}), "heures_stagiaires": total_hours,
                     "dont_heures_estimees": estimated_hours, "inscriptions_sans_heures": not_counted,
                     "presences_sans_horaires": untimed_presences},
        "cadres": cadres,
        "avertissement": "Aide à la préparation : ce n'est pas le bilan pédagogique et financier. Le BPF est établi et "
                         "transmis par l'organisme (art. L. 6352-11 du Code du travail), en ligne sur « Mon activité "
                         "formation » ; les cadres marqués NON_CALCULABLE sont à remplir à partir de la comptabilité et des "
                         "dossiers, les cadres INDICATIF et PARTIEL sont à vérifier.",
        "sources": SOURCES,
    }


def _finance(db: Session, start: date, end: date) -> dict:
    """Paiements enregistrés dans l'exercice, par dispositif, avec la ligne du cadre C qu'il suggère (indicatif)."""
    rows = db.execute(
        select(FundingSource.scheme, FundingSource.amount_paid, FundingSource.id)
        .join(FundingStep, FundingStep.source_id == FundingSource.id)
        .where(FundingStep.action == "enregistrer_paiement", FundingStep.done_on >= start, FundingStep.done_on <= end))
    seen: set[str] = set()
    out: dict[str, dict] = {}
    for scheme_code, paid, source_id in rows:
        if source_id in seen:  # un paiement par source
            continue
        seen.add(source_id)
        bucket = out.setdefault(scheme_code, {"ligne_suggeree": C_LINES.get(scheme_code), "paiements": 0,
                                              "montant_enregistre": 0.0})
        bucket["paiements"] += 1
        bucket["montant_enregistre"] = round(bucket["montant_enregistre"] + float(paid or 0), 2)
    return {"paiements_enregistres": dict(sorted(out.items()))}
