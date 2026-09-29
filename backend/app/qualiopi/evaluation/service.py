"""Moteur d'évaluation : exécute les contrôles, historise, maintient les constats, calcule la préparation."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.db import utcnow
from app.qualiopi.common import next_reference
from app.qualiopi.cycle.service import Period
from app.qualiopi.evaluation.checks import CHECKS, EvalContext, Outcome, Target
from app.qualiopi.evaluation.models import READINESS_RANK, ControlResult, ControlResultHistory, EvaluationRun, Finding
from app.qualiopi.evidence.detectors import load_sessions
from app.qualiopi.evidence.models import Evidence
from app.qualiopi.referential.models import ControlDefinition, Indicator, ReferentialVersion
from app.qualiopi.review.service import latest_reviews, review_state
from app.training import models as t

FINDING_STATES = {"PREUVES_INSUFFISANTES", "A_RISQUE", "NON_EVALUABLE"}
OPEN_FINDING = ("OUVERT", "EN_TRAITEMENT")


def _applicable(ind: Indicator, org: t.Organization | None, program: t.Program | None, all_programs: list[t.Program]) -> tuple[bool, str]:
    rule = ind.applicability or {}
    cats = rule.get("action_categories")
    if cats:
        if program is not None:
            if program.action_category not in cats:
                return False, f"réservé aux catégories {', '.join(cats)} (formation en {program.action_category})"
        else:
            org_cats = (org.action_categories if org else None) or ["AF"]
            if not set(cats) & set(org_cats):
                return False, f"réservé aux catégories {', '.join(cats)} (organisme : {', '.join(org_cats)})"
    if rule.get("certifying_only"):
        if program is not None and not program.is_certifying:
            return False, "réservé aux formations certifiantes"
        if program is None and not any(p.is_certifying for p in all_programs):
            return False, "aucune formation certifiante au catalogue"
    return True, ""


def _controls_for(ind: Indicator, org: t.Organization | None) -> list[ControlDefinition]:
    new_entrant = bool(org and org.is_new_entrant and ind.new_entrant_adapted)
    mode = "only" if new_entrant else "same"
    return [c for c in ind.controls if c.new_entrant_mode == mode]


def evaluate(
    db: Session,
    version: ReferentialVersion,
    *,
    trigger: str,
    session_ids: set[str] | None = None,
    program_ids: set[str] | None = None,
    include_org: bool = True,
    include_programs: bool = True,
    today: date | None = None,
) -> EvaluationRun:
    """Évalue les contrôles. `session_ids=None` = toutes les sessions (réévaluation complète).

    En mode ciblé, les formations évaluées sont celles des sessions ciblées plus `program_ids`
    (une formation modifiée sans session doit aussi être réévaluée).
    """
    today = today or date.today()
    run = EvaluationRun(
        version_id=version.id,
        trigger=trigger,
        scope="TOUT" if session_ids is None and include_org and include_programs else "CIBLE",
        target_id=next(iter(session_ids)) if session_ids and len(session_ids) == 1 else None,
    )
    db.add(run)
    db.flush()

    org = db.scalar(select(t.Organization))
    programs = list(db.scalars(select(t.Program)))
    sessions = [s for s in load_sessions(db) if s.status != "ANNULEE"]
    for s in sessions:  # relations utilisées par les contrôles
        _ = s.program, s.trainer
    evidence = list(db.scalars(select(Evidence).options(selectinload(Evidence.links))))
    ctx = EvalContext(today=today, org=org, evidence=evidence, sessions={s.id: s for s in sessions})

    scoped_sessions = sessions if session_ids is None else [s for s in sessions if s.id in session_ids]
    if session_ids is None:
        wanted_programs = {p.id for p in programs}
    else:
        wanted_programs = set(program_ids or ()) | {s.program_id for s in scoped_sessions}
    scoped_programs = [p for p in programs if p.id in wanted_programs] if include_programs else []

    existing = {(r.control_id, r.target_type, r.target_id): r for r in db.scalars(select(ControlResult).where(ControlResult.version_id == version.id))}
    findings = {f.key: f for f in db.scalars(select(Finding))}
    count = 0

    indicators = db.scalars(
        select(Indicator).where(Indicator.version_id == version.id).options(selectinload(Indicator.controls)).order_by(Indicator.number)
    ).all()
    for ind in indicators:
        for control in _controls_for(ind, org):
            fn = CHECKS[control.check]
            targets: list[Target] = []
            if control.scope == "ORGANISME":
                if include_org:
                    targets.append(Target("ORGANISME", org.id if org else "organisme"))
            elif control.scope == "FORMATION":
                targets += [Target("FORMATION", p.id, program=p) for p in scoped_programs]
            else:
                targets += [Target("SESSION", s.id, session=s, program=s.program) for s in scoped_sessions]
            for target in targets:
                ok, why = _applicable(ind, org, target.program, programs)
                if ok:
                    outcome = fn(ctx, target, control.params or {})
                else:
                    outcome = Outcome("NON_APPLICABLE", "—", "—", f"Indicateur non applicable : {why}.")
                _store(db, run, version, ind, control, target, outcome, existing, findings)
                count += 1
    if session_ids is None and include_org and include_programs:
        # Réévaluation complète : on retire les résultats devenus sans objet
        # (session annulée ou supprimée, contrôle remplacé par le mode nouvel entrant…).
        for k, r in list(existing.items()):
            if r.run_id != run.id:
                db.delete(r)
                del existing[k]
                f = findings.get(f"{r.control_key}|{r.target_type}|{r.target_id}")
                if f is not None and f.status in OPEN_FINDING:
                    f.status = "RESOLU"
                    f.resolved_at = utcnow()
                    f.decision_comment = "clos : contrôle ou cible devenu sans objet"
    run.results_count = count
    run.finished_at = utcnow()
    db.flush()
    return run


def _store(db, run, version, ind, control, target, outcome, existing, findings) -> None:  # noqa: ANN001
    key = (control.id, target.type, target.id)
    session_id = target.session.id if target.session else None
    row = existing.get(key)
    if row is None:
        row = ControlResult(control_id=control.id, target_type=target.type, target_id=target.id, version_id=version.id)
        db.add(row)
        existing[key] = row
    row.run_id = run.id
    row.control_key = control.key
    row.control_version = control.control_version
    row.indicator_number = ind.number
    row.session_id = session_id
    row.status = outcome.status
    row.human_validation_required = outcome.human_validation_required
    row.expected = outcome.expected
    row.observed = outcome.observed
    row.explanation = outcome.explanation
    row.evidence_ids = outcome.evidence_ids
    row.missing = outcome.missing
    row.evaluated_at = utcnow()
    db.add(ControlResultHistory(run_id=run.id, control_key=control.key, indicator_number=ind.number, target_type=target.type, target_id=target.id, status=outcome.status))

    fkey = f"{control.key}|{target.type}|{target.id}"
    f = findings.get(fkey)
    if outcome.status in FINDING_STATES:
        severity = control.severity if outcome.status == "PREUVES_INSUFFISANTES" else ("a_surveiller" if outcome.status == "A_RISQUE" else "a_verifier")
        where = target.session.reference if target.session else (target.program.code if target.program else "organisme")
        if f is None:
            f = Finding(
                reference=next_reference(db, "CST"),
                key=fkey,
                indicator_number=ind.number,
                control_key=control.key,
                target_type=target.type,
                target_id=target.id,
            )
            db.add(f)
            findings[fkey] = f
        elif f.status == "RESOLU":
            f.status = "OUVERT"
            f.resolved_at = None
            f.decision_comment = "réouvert automatiquement : le contrôle échoue de nouveau"
        f.session_id = session_id
        f.readiness = outcome.status
        f.severity = severity
        f.title = f"I{ind.number:02d} — {control.label} ({where})"
        f.explanation = outcome.explanation
        f.missing = outcome.missing
        f.remediation = control.remediation
        f.last_seen_at = utcnow()
    elif f is not None and f.status in OPEN_FINDING:
        f.status = "RESOLU"
        f.resolved_at = utcnow()
        f.readiness = outcome.status
        f.decision_comment = f"résolu automatiquement : contrôle {outcome.status}"


# ── Lecture : état de préparation ────────────────────────────────────────────────


def worst(statuses: list[str]) -> str:
    return min(statuses, key=lambda s: READINESS_RANK.get(s, 99))


def readiness_of(
    ind: Indicator,
    rows: list[ControlResult],
    org: t.Organization | None,
    programs: list[t.Program],
    program: t.Program | None = None,
) -> tuple[str, bool]:
    """État d'un indicateur à partir de ses résultats. Renvoie (état, automatisé ?).

    Seuls les contrôles actifs comptent : le contrôle « nouvel entrant » ne s'exécute pas
    pour un organisme établi, il ne doit donc pas rendre l'indicateur « non évaluable ».
    """
    applicable, _ = _applicable(ind, org, program, programs)
    if not applicable:
        return "NON_APPLICABLE", False
    active = _controls_for(ind, org)
    if not active:
        return "NON_EVALUE", False
    keys = {c.key for c in active}
    rows = [r for r in rows if r.control_key in keys]
    if not rows:
        return "NON_EVALUABLE", True
    return worst([r.status for r in rows]), True


def indicator_readiness(db: Session, version: ReferentialVersion, *, session: t.TrainingSession | None = None,
                        period: Period | None = None) -> list[dict]:
    """État par indicateur. Avec `session` : résultats de la session + formation + organisme hérités.

    Avec `period` : seules comptent les sessions qui chevauchent la période (cycle de certification).
    Les résultats formation et organisme décrivent l'état actuel et comptent toujours.
    """
    q = select(ControlResult).where(ControlResult.version_id == version.id)
    results = list(db.scalars(q))
    if period is not None and (period.start or period.end):
        in_period = {sid for sid, start, end in db.execute(select(t.TrainingSession.id, t.TrainingSession.start_date, t.TrainingSession.end_date))
                     if period.contains_session(start, end)}
        results = [r for r in results if r.session_id is None or r.session_id in in_period]
    if session is not None:
        results = [
            r for r in results
            if r.session_id == session.id or (r.target_type == "FORMATION" and r.target_id == session.program_id) or r.target_type == "ORGANISME"
        ]
    by_ind: dict[int, list[ControlResult]] = defaultdict(list)
    for r in results:
        by_ind[r.indicator_number].append(r)
    org = db.scalar(select(t.Organization))
    programs = list(db.scalars(select(t.Program)))
    out = []
    program = session.program if session is not None else None
    reviews = latest_reviews(db, version)
    for ind in version.indicators:
        rows = by_ind.get(ind.number, [])
        counts: dict[str, int] = defaultdict(int)
        for r in rows:
            counts[r.status] += 1
        status, automated = readiness_of(ind, rows, org, programs, program if ind.scope != "ORGANISME" else None)
        review = review_state(reviews.get(ind.number), bool(ind.human_review) and status != "NON_APPLICABLE")
        evidence_to_validate = any(r.human_validation_required for r in rows if r.status == "DEMONTRABLE")
        out.append(
            {
                "number": ind.number,
                "code": ind.code,
                "criterion": ind.criterion_number,
                "title": ind.title,
                "status": status,
                "counts": dict(counts),
                "human_validation_required": evidence_to_validate or review["state"] in ("REQUISE", "EXPIREE", "INSUFFISANTE"),
                "evidence_to_validate": evidence_to_validate,
                "revue_humaine": review,
                "sessions_at_risk": sorted({r.session_id for r in rows if r.session_id and r.status in ("PREUVES_INSUFFISANTES", "A_RISQUE")}),
                "automated": automated,
            }
        )
    return out
