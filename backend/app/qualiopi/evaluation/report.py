"""Dossier d'audit d'une session : « pourquoi cette session n'est-elle pas prête ? »."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.qualiopi.evaluation.models import ControlResult, Finding
from app.qualiopi.evaluation.service import indicator_readiness
from app.qualiopi.evidence.detectors import load_sessions
from app.qualiopi.evidence.models import Evidence
from app.qualiopi.referential.models import ReferentialVersion
from app.qualiopi.schedule.models import MilestoneStatus
from app.qualiopi.schedule.service import milestone_view
from app.training import models as t


def _line(label: str, done: int, total: int, applicable: bool = True) -> dict:
    return {"label": label, "done": done, "total": total, "applicable": applicable, "complete": applicable and total > 0 and done >= total}


def session_dossier(db: Session, version: ReferentialVersion, session_id: str) -> dict:
    found = load_sessions(db, session_id)
    if not found:
        raise NotFoundError("Session introuvable")
    s = found[0]
    program = s.program
    active = [e for e in s.enrollments if e.status in ("INSCRIT", "CONFIRME", "TERMINE")]
    finished = [e for e in s.enrollments if e.status == "TERMINE"]
    n = len(active)
    started = s.status in ("EN_COURS", "TERMINEE", "CLOTUREE")
    ended = s.status in ("TERMINEE", "CLOTUREE")
    session_evidence = list(db.scalars(select(Evidence).where(Evidence.session_id == s.id, Evidence.status != "RETIREE")))
    # Même source que le contrôle I12 : les preuves d'émargement (abandons comptés jusqu'à leur date).
    attendance = [e for e in session_evidence if e.evidence_type == "ATTENDANCE"]
    signed = sum(int(e.facts.get("recorded", e.facts.get("signed", 0))) for e in attendance)  # absences constatées comprises
    expected_sigs = sum(int(e.facts.get("expected", 0)) for e in attendance)
    surveys = list(db.scalars(select(t.SatisfactionSurvey).where(t.SatisfactionSurvey.session_id == s.id)))
    hot = {sv.enrollment_id for sv in surveys if sv.audience == "APPRENANT_CHAUD" and sv.answered_on}

    checklist = [
        _line("Programme publié", 1 if program.content and program.objectives else 0, 1),
        _line("Conventions signées", sum(1 for e in active if e.agreement and e.agreement.signed_on), n),
        _line("Convocations envoyées", sum(1 for e in active if e.convocation and e.convocation.sent_on), n),
        _line("Analyses du besoin", sum(1 for e in active if e.needs_analysis and e.needs_analysis.completed_on), n),
        _line("Positionnements", sum(1 for e in active if e.positioning and e.positioning.completed_on), n),
        _line("Émargements", signed, expected_sigs, applicable=started),
        _line("Évaluations", sum(1 for e in active if e.assessments), n, applicable=ended),
        _line("Satisfaction à chaud", sum(1 for e in finished if e.id in hot), len(finished), applicable=ended),
        _line("Attestations", sum(1 for e in finished if e.certificate), len(finished), applicable=ended),
    ]

    indicators = indicator_readiness(db, version, session=s)
    results = [
        r for r in db.scalars(select(ControlResult).where(ControlResult.version_id == version.id))
        if r.session_id == s.id or (r.target_type == "FORMATION" and r.target_id == s.program_id) or r.target_type == "ORGANISME"
    ]
    ev_ids = {i for r in results for i in r.evidence_ids}
    evidence = {e.id: e for e in db.scalars(select(Evidence).where(Evidence.id.in_(ev_ids)))} if ev_ids else {}
    if s.trainer_id:
        session_evidence += list(db.scalars(select(Evidence).where(
            Evidence.trainer_id == s.trainer_id, Evidence.scope == "FORMATEUR", Evidence.status != "RETIREE")))

    missing_items = sum(len(r.missing) for r in results if r.status in ("PREUVES_INSUFFISANTES", "A_RISQUE"))
    summary = {
        "preuves_manquantes": missing_items,
        "preuves_expirees": sum(1 for e in session_evidence if e.status == "EXPIREE"),
        "preuves_non_exploitables": sum(1 for e in session_evidence if e.status in ("DETECTEE", "DOCUMENTEE")),
        "preuves_a_valider": sum(1 for e in session_evidence if e.status == "EXPLOITABLE"),
        "conventions_non_signees": sum(1 for e in active if not (e.agreement and e.agreement.signed_on)),
        "indicateurs": {st: sum(1 for i in indicators if i["status"] == st) for st in
                        ("DEMONTRABLE", "A_RISQUE", "PREUVES_INSUFFISANTES", "NON_EVALUABLE", "NON_EVALUE", "NON_APPLICABLE")},
    }

    def result_view(r: ControlResult) -> dict:
        return {
            "control": r.control_key,
            "control_version": r.control_version,
            "target": r.target_type,
            "status": r.status,
            "expected": r.expected,
            "observed": r.observed,
            "explanation": r.explanation,
            "missing": r.missing,
            "human_validation_required": r.human_validation_required,
            "evidence": [
                {"id": evidence[i].id, "reference": evidence[i].reference, "label": evidence[i].label, "status": evidence[i].status}
                for i in r.evidence_ids if i in evidence
            ],
            "evaluated_at": r.evaluated_at.isoformat(),
        }

    by_ind: dict[int, list[dict]] = {}
    for r in sorted(results, key=lambda x: x.control_key):
        by_ind.setdefault(r.indicator_number, []).append(result_view(r))
    for ind in indicators:
        ind["results"] = by_ind.get(ind["number"], [])

    findings = list(
        db.scalars(select(Finding).where(Finding.session_id == s.id, Finding.status.in_(("OUVERT", "EN_TRAITEMENT"))).order_by(Finding.indicator_number))
    )
    return {
        "session": {
            "id": s.id,
            "reference": s.reference,
            "status": s.status,
            "start_date": s.start_date.isoformat(),
            "end_date": s.end_date.isoformat(),
            "location": s.location,
            "trainer": s.trainer.full_name if s.trainer else None,
            "program": {"id": program.id, "code": program.code, "title": program.title, "certifying": program.is_certifying},
            "learners": n,
        },
        "checklist": checklist,
        "echeancier": [
            milestone_view(m)
            for m in db.scalars(select(MilestoneStatus).where(MilestoneStatus.session_id == s.id).order_by(MilestoneStatus.due_on, MilestoneStatus.key))
        ],
        "summary": summary,
        "indicators": indicators,
        "findings": [
            {"id": f.id, "reference": f.reference, "indicator": f.indicator_number, "title": f.title, "severity": f.severity,
             "readiness": f.readiness, "status": f.status, "explanation": f.explanation, "missing": f.missing, "remediation": f.remediation}
            for f in findings
        ],
        "disclaimer": "État de préparation calculé à partir des preuves disponibles. Ne constitue pas une décision de conformité : seul l'organisme certificateur en décide.",
    }
