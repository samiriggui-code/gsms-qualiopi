"""Bibliothèque de contrôles génériques, paramétrés par la couche normative (YAML).

Règle d'or : un contrôle ne lit que des PREUVES (et les dénominateurs du domaine :
sessions, inscriptions). Il ne décide jamais « conforme ». Il répond :
  - quel état de préparation (DEMONTRABLE, A_RISQUE, PREUVES_INSUFFISANTES, NON_EVALUABLE, NON_APPLICABLE)
  - ce qui était attendu, ce qui a été observé
  - quelles preuves ont été analysées, lesquelles manquent et pour qui
  - si une validation humaine reste nécessaire
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.qualiopi.evidence.models import USABLE_STATUSES, Evidence
from app.training import models as t


@dataclass
class Outcome:
    status: str
    expected: str
    observed: str
    explanation: str
    evidence_ids: list[str] = field(default_factory=list)
    missing: list[dict] = field(default_factory=list)
    human_validation_required: bool = False


@dataclass
class EvalContext:
    today: date
    org: t.Organization | None
    evidence: list[Evidence]
    sessions: dict[str, t.TrainingSession]
    by_type: dict[str, list[Evidence]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        idx: dict[str, list[Evidence]] = defaultdict(list)
        for e in self.evidence:
            if e.status != "RETIREE":
                idx[e.evidence_type].append(e)
        self.by_type = dict(idx)

    def of_type(self, evidence_type: str, facts: dict | None = None) -> list[Evidence]:
        rows = self.by_type.get(evidence_type, [])
        if facts:
            rows = [e for e in rows if all(e.facts.get(k) == v for k, v in facts.items())]
        return rows


@dataclass
class Target:
    type: str  # ORGANISME | FORMATION | SESSION
    id: str
    session: t.TrainingSession | None = None
    program: t.Program | None = None


def usable(e: Evidence) -> bool:
    return e.status in USABLE_STATUSES


def _needs_human(rows: list[Evidence]) -> bool:
    return any(e.status != "VALIDEE" for e in rows)


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


# ── Contrôles ────────────────────────────────────────────────────────────────────


def check_per_enrollment_evidence(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    s = target.session
    assert s is not None
    etype = params["evidence_type"]
    statuses = params.get("session_statuses")
    if statuses and s.status not in statuses:
        return Outcome(
            "NON_APPLICABLE",
            expected=f"preuve {etype} par apprenant",
            observed=f"session au statut {s.status}",
            explanation=f"Pas encore exigible : la session {s.reference} est au statut {s.status}.",
        )
    enrollment_statuses = params.get("enrollment_statuses") or ["INSCRIT", "CONFIRME", "TERMINE"]
    rows = [e for e in s.enrollments if e.status in enrollment_statuses]
    if params.get("only_if") == "needs_adaptation":
        rows = [e for e in rows if e.needs_analysis is not None and e.needs_analysis.adaptation_required]
        if not rows:
            return Outcome(
                "NON_APPLICABLE",
                expected="adaptations traitées pour les apprenants concernés",
                observed="aucun besoin d'adaptation déclaré",
                explanation="Aucun apprenant de la session n'a déclaré de besoin d'adaptation.",
            )
    if not rows and params.get("none_means_not_applicable"):
        # Ex. suivi des abandons : aucune personne concernée est la bonne situation, pas un manque de données.
        return Outcome(
            "NON_APPLICABLE",
            expected=f"preuve {etype} pour chaque apprenant ({', '.join(enrollment_statuses)})",
            observed="0 apprenant concerné",
            explanation=f"Aucun apprenant au statut {', '.join(enrollment_statuses)} dans la session {s.reference}.",
        )
    if not rows:
        return Outcome(
            "NON_EVALUABLE",
            expected=f"preuve {etype} pour chaque apprenant ({', '.join(enrollment_statuses)})",
            observed="0 apprenant concerné",
            explanation="Aucun apprenant concerné : impossible de conclure. Le moteur ne déclare pas démontrable sans données.",
        )
    evidence = [e for e in ctx.of_type(etype, params.get("facts")) if e.session_id == s.id]
    by_enrollment: dict[str, list[Evidence]] = defaultdict(list)
    for e in evidence:
        if e.enrollment_id:
            by_enrollment[e.enrollment_id].append(e)
    ok, analysed, missing = 0, [], []
    for enr in rows:
        found = by_enrollment.get(enr.id, [])
        analysed.extend(found)
        good = [e for e in found if usable(e)]
        if good:
            ok += 1
            continue
        if found:
            issues = sorted({i for e in found for i in e.form_issues}) or [f"preuve au statut {found[0].status}"]
            missing.append({"who": enr.learner.full_name, "enrollment_id": enr.id, "reason": "; ".join(issues), "evidence": [e.reference for e in found]})
        else:
            missing.append({"who": enr.learner.full_name, "enrollment_id": enr.id, "reason": f"aucune preuve {etype}"})
    ratio = ok / len(rows)
    expected = f"{len(rows)}/{len(rows)} apprenants avec une preuve {etype} exploitable"
    observed = f"{ok}/{len(rows)}"
    refs = ", ".join(e.reference for e in analysed[:12]) or "aucune"
    if ok == len(rows):
        return Outcome(
            "DEMONTRABLE", expected, observed,
            f"{ok} apprenant(s) sur {len(rows)} disposent d'une preuve exploitable. Preuves analysées : {refs}.",
            [e.id for e in analysed], [], _needs_human(analysed),
        )
    warning_ratio = float(params.get("warning_ratio", 0.8))
    status = "A_RISQUE" if ratio >= warning_ratio and warning_ratio < 1 else "PREUVES_INSUFFISANTES"
    who = ", ".join(m["who"] for m in missing[:8])
    return Outcome(
        status, expected, observed,
        f"{len(rows)} apprenant(s) concerné(s), {ok} avec une preuve exploitable. Manquant pour : {who}. Preuves analysées : {refs}.",
        [e.id for e in analysed], missing, True,
    )


def check_session_evidence(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    s = target.session
    assert s is not None
    etype = params["evidence_type"]
    if params.get("session_statuses") and s.status not in params["session_statuses"]:
        return Outcome("NON_APPLICABLE", f"preuve {etype}", f"session {s.status}", f"Pas encore exigible (session {s.status}).")
    rows = [e for e in ctx.of_type(etype) if e.session_id == s.id]
    good = [e for e in rows if usable(e)]
    if good:
        return Outcome("DEMONTRABLE", f"preuve {etype} exploitable", f"{len(good)} preuve(s)",
                       f"Preuve(s) {', '.join(e.reference for e in good)} exploitable(s).", [e.id for e in rows], [], _needs_human(good))
    reason = "; ".join(sorted({i for e in rows for i in e.form_issues})) or f"aucune preuve {etype}"
    return Outcome("PREUVES_INSUFFISANTES", f"preuve {etype} exploitable", "0 exploitable",
                   f"Session {s.reference} : {reason}.", [e.id for e in rows], [{"who": s.reference, "reason": reason}], True)


def check_attendance_tracking(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    s = target.session
    assert s is not None
    if params.get("session_statuses") and s.status not in params["session_statuses"]:
        return Outcome("NON_APPLICABLE", "émargement tenu", f"session {s.status}", f"Pas encore exigible (session {s.status}).")
    rows = [e for e in ctx.of_type("ATTENDANCE") if e.session_id == s.id]
    if not rows:
        return Outcome("PREUVES_INSUFFISANTES", "feuilles d'émargement des demi-journées réalisées", "aucune demi-journée émargée",
                       f"Aucune feuille d'émargement pour la session {s.reference}.", [], [{"who": s.reference, "reason": "aucun créneau d'émargement"}], True)
    signed = sum(int(e.facts.get("recorded", e.facts.get("signed", 0))) for e in rows)
    expected_total = sum(int(e.facts.get("expected", 0)) for e in rows)
    ratio = signed / expected_total if expected_total else 0
    threshold = float(params.get("min_signed_ratio", 0.9))
    missing = [
        {"who": e.label.split(" — ")[0].replace("Émargements", "").strip() or e.reference, "enrollment_id": e.enrollment_id,
         "reason": "; ".join(e.form_issues)}
        for e in rows if e.form_issues
    ]
    expected = f"≥ {int(threshold * 100)} % des signatures attendues"
    observed = f"{signed}/{expected_total} signatures ({ratio:.0%})"
    if ratio >= 1:
        return Outcome("DEMONTRABLE", expected, observed, f"Toutes les demi-journées réalisées sont émargées ({observed}).", [e.id for e in rows], [], False)
    status = "A_RISQUE" if ratio >= threshold else "PREUVES_INSUFFISANTES"
    return Outcome(status, expected, observed, f"Émargement incomplet : {observed}.", [e.id for e in rows], missing, True)


def check_program_evidence(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    p = target.program
    assert p is not None
    etype = params["evidence_type"]
    rows = [e for e in ctx.of_type(etype) if e.program_id == p.id and e.scope == "FORMATION"]
    if not rows:
        return Outcome("PREUVES_INSUFFISANTES", f"preuve {etype} pour {p.code}", "absente",
                       f"Formation {p.code} : aucune donnée pour {etype}.", [], [{"who": p.code, "reason": f"aucune preuve {etype}"}], True)
    good = [e for e in rows if usable(e)]
    if not good:
        reason = "; ".join(sorted({i for e in rows for i in e.form_issues}))
        return Outcome("PREUVES_INSUFFISANTES", f"preuve {etype} exploitable", "non exploitable",
                       f"Formation {p.code} : {reason}.", [e.id for e in rows], [{"who": p.code, "reason": reason}], True)
    max_age = params.get("max_age_days")
    if max_age:
        latest = max((e.produced_on for e in good if e.produced_on), default=None)
        if latest is None or (ctx.today - latest).days > int(max_age):
            age = "jamais" if latest is None else f"le {_fmt(latest)}"
            return Outcome("A_RISQUE", f"relue depuis moins de {max_age} jours", f"dernière relecture : {age}",
                           f"Formation {p.code} : information à relire (dernière relecture {age}).", [e.id for e in rows],
                           [{"who": p.code, "reason": "relecture trop ancienne"}], True)
    return Outcome("DEMONTRABLE", f"preuve {etype} exploitable", f"{len(good)} preuve(s)",
                   f"Formation {p.code} : {', '.join(e.reference for e in good)} exploitable(s).", [e.id for e in rows], [], _needs_human(good))


def check_org_evidence(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    etype = params["evidence_type"]
    rows = ctx.of_type(etype, params.get("facts"))
    within = params.get("within_days")
    horizon = ctx.today - timedelta(days=int(within)) if within else None
    good = [e for e in rows if usable(e) and (horizon is None or (e.produced_on and e.produced_on >= horizon))]
    min_count = int(params.get("min_count", 1))
    period = f" sur les {within} derniers jours" if within else ""
    expected = f"≥ {min_count} preuve(s) {etype} exploitable(s){period}"
    observed = f"{len(good)} exploitable(s) sur {len(rows)} détectée(s)"
    if len(good) >= min_count:
        return Outcome("DEMONTRABLE", expected, observed,
                       f"Preuves : {', '.join(e.reference for e in good[:10])}.", [e.id for e in rows], [], _needs_human(good))
    reasons = sorted({i for e in rows for i in e.form_issues})
    stale = [e for e in rows if usable(e) and horizon and e.produced_on and e.produced_on < horizon]
    if stale or (rows and not reasons):
        explanation = f"{len(rows)} preuve(s) {etype}, mais aucune récente{period}."
        return Outcome("A_RISQUE", expected, observed, explanation, [e.id for e in rows], [{"who": "organisme", "reason": "preuve trop ancienne"}], True)
    reason = "; ".join(reasons) if reasons else f"aucune preuve {etype}"
    return Outcome("PREUVES_INSUFFISANTES", expected, observed, f"Organisme : {reason}.", [e.id for e in rows], [{"who": "organisme", "reason": reason}], True)


def check_trainer_qualification(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    s = target.session
    assert s is not None
    if params.get("session_statuses") and s.status not in params["session_statuses"]:
        return Outcome("NON_APPLICABLE", "formateur qualifié", f"session {s.status}", f"Pas encore exigible (session {s.status}).")
    if not s.trainer_id:
        return Outcome("NON_EVALUABLE", "formateur qualifié affecté", "aucun formateur",
                       f"Session {s.reference} : aucun formateur affecté, compétences non vérifiables.", [], [{"who": s.reference, "reason": "aucun formateur"}], True)
    name = s.trainer.full_name if s.trainer else s.trainer_id
    rows = [e for e in ctx.of_type("TRAINER_QUALIFICATION") if e.trainer_id == s.trainer_id]
    # Une qualification expirée aujourd'hui reste probante pour une session passée
    # si elle était valide à la date de début.
    valid_at_start = [
        e
        for e in rows
        if (e.status in USABLE_STATUSES or (e.status == "EXPIREE" and not e.form_issues))
        and (e.valid_until is None or e.valid_until >= s.start_date)
    ]
    expected = f"qualification exploitable de {name}, valide au {_fmt(s.start_date)}"
    if not valid_at_start:
        reason = "; ".join(sorted({i for e in rows for i in e.form_issues})) or ("qualification expirée" if rows else "aucune qualification enregistrée")
        return Outcome("PREUVES_INSUFFISANTES", expected, f"{len(rows)} qualification(s), aucune exploitable",
                       f"{name} : {reason}.", [e.id for e in rows], [{"who": name, "reason": reason}], True)
    soon = ctx.today + timedelta(days=int(params.get("expiring_days", 60)))
    expiring = [e for e in valid_at_start if e.valid_until and e.valid_until <= soon and s.status not in ("TERMINEE", "CLOTUREE")]
    if len(expiring) == len(valid_at_start):
        e = expiring[0]
        return Outcome("A_RISQUE", expected, f"expire le {_fmt(e.valid_until)}",
                       f"{name} : {e.label} expire le {_fmt(e.valid_until)}.", [x.id for x in rows], [{"who": name, "reason": "qualification bientôt expirée"}], True)
    return Outcome("DEMONTRABLE", expected, f"{len(valid_at_start)} qualification(s) valide(s)",
                   f"{name} : {', '.join(e.reference for e in valid_at_start)}.", [e.id for e in rows], [], _needs_human(valid_at_start))


def check_subcontractors(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    rows = ctx.of_type("SUBCONTRACTOR")
    if not rows:
        return Outcome("NON_APPLICABLE", "sous-traitants conformes", "aucun sous-traitant", "Aucun sous-traitant enregistré.")
    bad = [e for e in rows if not usable(e)]
    expected = "contrat signé et conformité vérifiée pour chaque sous-traitant"
    observed = f"{len(rows) - len(bad)}/{len(rows)} conformes"
    if not bad:
        return Outcome("DEMONTRABLE", expected, observed, "Tous les sous-traitants sont documentés.", [e.id for e in rows], [], _needs_human(rows))
    missing = [{"who": e.label.replace("Sous-traitant : ", ""), "reason": "; ".join(e.form_issues)} for e in bad]
    return Outcome("PREUVES_INSUFFISANTES", expected, observed,
                   "À régulariser : " + ", ".join(f"{m['who']} ({m['reason']})" for m in missing) + ".", [e.id for e in rows], missing, True)


def check_complaints(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    rows = ctx.of_type("COMPLAINT_HANDLING")
    max_days = int(params.get("max_response_days", 15))
    expected = f"réponse à chaque réclamation sous {max_days} jours"
    if not rows:
        procedures = [e for e in ctx.of_type("PROCEDURE") if usable(e) and any(link.indicator_number == 31 for link in e.links)]
        if procedures:
            return Outcome("DEMONTRABLE", expected, "aucune réclamation, procédure formalisée",
                           f"Aucune réclamation reçue ; procédure {procedures[0].reference} en place.", [e.id for e in procedures], [], _needs_human(procedures))
        return Outcome("NON_EVALUABLE", expected, "aucune réclamation enregistrée",
                       "Aucune réclamation : le dispositif doit être démontré par une procédure déposée.", [], [{"who": "organisme", "reason": "procédure réclamations non déposée"}], True)
    late, unanswered = [], []
    for e in rows:
        days = e.facts.get("response_days")
        if days is None:
            received = date.fromisoformat(e.facts["received_on"])
            if (ctx.today - received).days > max_days:
                unanswered.append(e)
        elif days > max_days:
            late.append(e)
    observed = f"{len(rows)} réclamation(s) · {len(unanswered)} sans réponse hors délai · {len(late)} répondue(s) en retard"
    if unanswered:
        return Outcome("PREUVES_INSUFFISANTES", expected, observed,
                       f"Sans réponse au-delà de {max_days} jours : {', '.join(e.reference for e in unanswered)}.", [e.id for e in rows],
                       [{"who": e.label, "reason": "aucune réponse"} for e in unanswered], True)
    if late:
        return Outcome("A_RISQUE", expected, observed, f"Réponse(s) hors délai : {', '.join(e.reference for e in late)}.", [e.id for e in rows],
                       [{"who": e.label, "reason": "réponse tardive"} for e in late], True)
    return Outcome("DEMONTRABLE", expected, observed, "Toutes les réclamations ont reçu une réponse dans le délai.", [e.id for e in rows], [], _needs_human(rows))


def check_procedure_documented(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    n = int(params["indicator"])
    rows = [e for e in ctx.of_type("PROCEDURE") if any(link.indicator_number == n for link in e.links)]
    good = [e for e in rows if usable(e)]
    expected = f"procédure formalisée pour l'indicateur {n} (nouvel entrant)"
    if good:
        return Outcome("DEMONTRABLE", expected, f"{len(good)} procédure(s)", f"Procédure(s) : {', '.join(e.reference for e in good)}.", [e.id for e in rows], [], True)
    return Outcome("PREUVES_INSUFFISANTES", expected, "aucune procédure exploitable",
                   f"Nouvel entrant : déposer la procédure décrivant le processus de l'indicateur {n}.", [e.id for e in rows], [{"who": "organisme", "reason": "procédure absente"}], True)


def check_required_documents(ctx: EvalContext, target: Target, params: dict) -> Outcome:
    """Pièces requises du dossier organisme : présentes, exploitables et non expirées."""
    items: list[str] = params["items"]
    rows = [e for e in ctx.evidence if e.source_table == "formation.document" and e.status != "RETIREE"
            and e.facts.get("subject") == params.get("dossier", "ORGANISME")]
    by_item: dict[str, list[Evidence]] = defaultdict(list)
    for e in rows:
        by_item[e.facts.get("requirement")].append(e)
    good, missing = [], []
    for code in items:
        found = by_item.get(code, [])
        ok = [e for e in found if usable(e)]
        if ok:
            good.extend(ok)
        else:
            reason = "pièce expirée" if any(e.status == "EXPIREE" for e in found) else (
                "pièce rejetée" if any(e.status == "REJETEE" for e in found) else "pièce non déposée")
            missing.append({"who": code, "reason": reason})
    expected = f"pièces {', '.join(items)} déposées et valides"
    observed = f"{len(items) - len(missing)}/{len(items)}"
    if not missing:
        return Outcome("DEMONTRABLE", expected, observed, f"Pièces : {', '.join(e.reference for e in good)}.",
                       [e.id for e in good], [], _needs_human(good))
    return Outcome("PREUVES_INSUFFISANTES", expected, observed,
                   "À déposer : " + ", ".join(f"{m['who']} ({m['reason']})" for m in missing) + ".",
                   [e.id for e in good], missing, True)


CHECKS: dict[str, Callable[[EvalContext, Target, dict], Outcome]] = {
    "per_enrollment_evidence": check_per_enrollment_evidence,
    "session_evidence": check_session_evidence,
    "attendance_tracking": check_attendance_tracking,
    "program_evidence": check_program_evidence,
    "org_evidence": check_org_evidence,
    "trainer_qualification": check_trainer_qualification,
    "subcontractors": check_subcontractors,
    "complaints": check_complaints,
    "procedure_documented": check_procedure_documented,
    "required_documents": check_required_documents,
}
