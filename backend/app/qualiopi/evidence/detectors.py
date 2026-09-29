"""Détecteurs : transforment les données du domaine formation en spécifications de preuves.

Un détecteur ne décide jamais de la conformité. Il dit : « cette donnée existe, voici sa
source, sa date, son auteur, ses faits, et les défauts de forme constatés ».
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.qualiopi.capa.models import CapaAction
from app.training import models as t


@dataclass
class EvidenceSpec:
    evidence_type: str
    label: str
    scope: str
    source_table: str
    source_id: str
    facts: dict = field(default_factory=dict)
    program_id: str | None = None
    session_id: str | None = None
    enrollment_id: str | None = None
    learner_id: str | None = None
    trainer_id: str | None = None
    produced_by: str | None = None
    produced_on: date | None = None
    valid_until: date | None = None
    document_id: str | None = None
    form_issues: list[str] = field(default_factory=list)
    # Indicateurs explicitement déclarés (documents déposés : procédures, comptes rendus…)
    declared_indicators: list[int] = field(default_factory=list)


def _iso(d: date | None) -> str | None:
    return d.isoformat() if d else None


# ── Formation (offre) ────────────────────────────────────────────────────────────


def detect_program(p: t.Program) -> Iterator[EvidenceSpec]:
    base = dict(scope="FORMATION", program_id=p.id, source_table="formation.program", source_id=p.id, produced_by=p.created_by)
    checks = {
        "prérequis": bool(p.prerequisites),
        "objectifs": bool(p.objectives),
        "durée": p.duration_hours is not None,
        "tarif": p.price_eur is not None,
        "délai d'accès": bool(p.access_delay),
        "méthodes pédagogiques": bool(p.teaching_methods),
        "modalités d'évaluation": bool(p.evaluation_methods),
        "accessibilité handicap": bool(p.accessibility_info),
    }
    missing = [k for k, ok in checks.items() if not ok]
    issues = [f"rubrique manquante : {m}" for m in missing]
    if p.public_info_reviewed_on is None:
        issues.append("information publique jamais relue")
    yield EvidenceSpec(
        evidence_type="PUBLIC_INFO",
        label=f"Fiche publique — {p.code} {p.title}",
        facts={"missing": missing, "reviewed_on": _iso(p.public_info_reviewed_on)},
        produced_on=p.public_info_reviewed_on,
        form_issues=issues,
        **base,
    )
    if p.satisfaction_rate is not None or p.success_rate is not None:
        yield EvidenceSpec(
            evidence_type="RESULTS_PUBLISHED",
            label=f"Indicateurs de résultats — {p.code}",
            facts={"satisfaction_rate": _num(p.satisfaction_rate), "success_rate": _num(p.success_rate)},
            produced_on=p.public_info_reviewed_on,
            **base,
        )
    if p.is_certifying and p.success_rate is not None:
        yield EvidenceSpec(
            evidence_type="CERTIFICATION_RESULTS",
            label=f"Taux d'obtention de la certification — {p.code}",
            facts={"success_rate": _num(p.success_rate), "rncp_code": p.rncp_code},
            produced_on=p.public_info_reviewed_on,
            form_issues=[] if p.rncp_code else ["code RNCP/RS manquant"],
            **base,
        )
    if p.objectives:
        short = [o for o in p.objectives if len(o.strip()) < 10]
        yield EvidenceSpec(
            evidence_type="OBJECTIVES",
            label=f"Objectifs — {p.code} ({len(p.objectives)})",
            facts={"count": len(p.objectives)},
            form_issues=[f"{len(short)} objectif(s) trop succinct(s)"] if short else [],
            **base,
        )
    if p.content:
        yield EvidenceSpec(
            evidence_type="CONTENT",
            label=f"Contenu et modalités — {p.code}",
            facts={"has_methods": bool(p.teaching_methods)},
            form_issues=[] if p.teaching_methods else ["méthodes pédagogiques non décrites"],
            **base,
        )
    if p.is_certifying and p.certification_alignment:
        yield EvidenceSpec(
            evidence_type="CERTIFICATION_ALIGNMENT",
            label=f"Correspondance certification — {p.code}",
            facts={"rncp_code": p.rncp_code},
            form_issues=[] if p.rncp_code else ["code RNCP/RS manquant"],
            **base,
        )


def _num(v) -> float | None:  # noqa: ANN001
    return float(v) if v is not None else None


# ── Session ──────────────────────────────────────────────────────────────────────


def detect_session(s: t.TrainingSession, today: date) -> Iterator[EvidenceSpec]:
    sbase = dict(program_id=s.program_id, session_id=s.id, produced_by=s.created_by)
    if s.trainer_id or s.location or s.room:
        issues = []
        if not s.trainer_id:
            issues.append("aucun formateur affecté")
        if not (s.location or s.room):
            issues.append("aucun lieu renseigné")
        yield EvidenceSpec(
            evidence_type="SESSION_RESOURCES",
            label=f"Moyens affectés — {s.reference}",
            scope="SESSION",
            source_table="formation.session",
            source_id=s.id,
            trainer_id=s.trainer_id,
            facts={"trainer_id": s.trainer_id, "location": s.location, "room": s.room},
            form_issues=issues,
            **sbase,
        )

    past_slots = [sl for sl in s.attendance_slots if sl.day <= today]
    for e in s.enrollments:
        if e.status == "ANNULE":
            continue
        eb = dict(sbase, scope="APPRENANT", enrollment_id=e.id, learner_id=e.learner_id)
        who = f"{e.learner.full_name} — {s.reference}"

        na = e.needs_analysis
        if na is not None and na.completed_on is not None:
            yield EvidenceSpec(
                evidence_type="NEEDS_ANALYSIS",
                label=f"Analyse du besoin — {who}",
                source_table="formation.needs_analysis",
                source_id=na.id,
                produced_on=na.completed_on,
                facts={"adaptation_required": na.adaptation_required},
                form_issues=["réalisée après le démarrage"] if na.completed_on > s.start_date else [],
                **{**eb, "produced_by": na.created_by},
            )
        if na is not None and na.adaptation_required:
            yield EvidenceSpec(
                evidence_type="ADAPTATION",
                label=f"Adaptation — {who}",
                source_table="formation.needs_analysis",
                source_id=na.id,
                produced_on=na.completed_on,
                facts={"adaptation_status": na.adaptation_status, "needs_adaptation": True},
                form_issues=["adaptation non traitée"] if na.adaptation_status in ("AUCUNE", "A_TRAITER") else [],
                **{**eb, "produced_by": na.created_by},
            )

        pos = e.positioning
        if pos is not None and pos.completed_on is not None:
            yield EvidenceSpec(
                evidence_type="POSITIONING",
                label=f"Positionnement — {who}",
                source_table="formation.positioning",
                source_id=pos.id,
                produced_on=pos.completed_on,
                facts={"method": pos.method, "level": pos.level, "prerequisites_met": pos.prerequisites_met},
                form_issues=["réalisé après le démarrage"] if pos.completed_on > s.start_date else [],
                **{**eb, "produced_by": pos.created_by},
            )

        conv = e.convocation
        if conv is not None and conv.sent_on is not None:
            yield EvidenceSpec(
                evidence_type="CONVOCATION",
                label=f"Convocation — {who}",
                source_table="formation.convocation",
                source_id=conv.id,
                produced_on=conv.sent_on,
                document_id=conv.document_id,
                form_issues=["envoyée après le démarrage"] if conv.sent_on > s.start_date else [],
                **{**eb, "produced_by": conv.created_by},
            )

        if past_slots:
            signed = sum(
                1 for sig in e.signatures if sig.present and sig.signed_at is not None and sig.slot.day <= today
            )
            yield EvidenceSpec(
                evidence_type="ATTENDANCE",
                label=f"Émargements — {who}",
                source_table="formation.enrollment",
                source_id=e.id,
                produced_on=max(sl.day for sl in past_slots),
                facts={"signed": signed, "expected": len(past_slots)},
                form_issues=[] if signed >= len(past_slots) else [f"{len(past_slots) - signed} demi-journée(s) non émargée(s)"],
                **eb,
            )

        for a in e.assessments:
            yield EvidenceSpec(
                evidence_type="EXAM_PRESENTATION" if a.kind == "EXAMEN" else "ASSESSMENT",
                label=f"{'Examen' if a.kind == 'EXAMEN' else 'Évaluation'} « {a.label} » — {who}",
                source_table="formation.assessment",
                source_id=a.id,
                produced_on=a.assessed_on,
                facts={"kind": a.kind, "score": _num(a.score), "passed": a.passed},
                **{**eb, "produced_by": a.created_by},
            )

        cert = e.certificate
        if cert is not None:
            yield EvidenceSpec(
                evidence_type="CERTIFICATE",
                label=f"{cert.kind.title()} — {who}",
                source_table="formation.certificate",
                source_id=cert.id,
                produced_on=cert.issued_on,
                document_id=cert.document_id,
                facts={"kind": cert.kind},
                **{**eb, "produced_by": cert.created_by},
            )

        if e.status == "ABANDON":
            issues = []
            if not e.abandon_reason:
                issues.append("motif d'abandon non renseigné")
            if not e.abandoned_on:
                issues.append("date d'abandon non renseignée")
            yield EvidenceSpec(
                evidence_type="DROPOUT_FOLLOWUP",
                label=f"Suivi d'abandon — {who}",
                source_table="formation.enrollment",
                source_id=e.id,
                produced_on=e.abandoned_on,
                facts={"reason": e.abandon_reason},
                form_issues=issues,
                **eb,
            )


def detect_surveys(surveys: list[t.SatisfactionSurvey], sessions: dict[str, t.TrainingSession]) -> Iterator[EvidenceSpec]:
    for sv in surveys:
        if sv.answered_on is None:
            continue
        s = sessions.get(sv.session_id)
        enrollment = next((e for e in s.enrollments if e.id == sv.enrollment_id), None) if s else None
        yield EvidenceSpec(
            evidence_type="SURVEY_RESPONSE",
            label=f"Appréciation {sv.audience.replace('_', ' ').lower()} — {s.reference if s else sv.session_id}",
            scope="APPRENANT" if sv.enrollment_id else "SESSION",
            source_table="formation.satisfaction_survey",
            source_id=sv.id,
            program_id=s.program_id if s else None,
            session_id=sv.session_id,
            enrollment_id=sv.enrollment_id,
            learner_id=enrollment.learner_id if enrollment else None,
            produced_on=sv.answered_on,
            produced_by=sv.created_by,
            facts={"audience": sv.audience, "score": _num(sv.score)},
        )


# ── Personnel ─────────────────────────────────────────────────────────────────────


def detect_trainer(tr: t.Trainer, actions: list[t.StaffDevelopmentAction]) -> Iterator[EvidenceSpec]:
    for q in tr.qualifications:
        yield EvidenceSpec(
            evidence_type="TRAINER_QUALIFICATION",
            label=f"{q.label} — {tr.full_name}",
            scope="FORMATEUR",
            source_table="formation.trainer_qualification",
            source_id=q.id,
            trainer_id=tr.id,
            produced_on=q.obtained_on,
            valid_until=q.valid_until,
            document_id=q.document_id,
            produced_by=q.created_by,
            facts={"label": q.label},
            form_issues=[] if q.document_id else ["justificatif non déposé"],
        )
    for a in actions:
        if a.completed_on is None:
            continue
        yield EvidenceSpec(
            evidence_type="STAFF_DEVELOPMENT",
            label=f"{a.label} — {tr.full_name}",
            scope="FORMATEUR",
            source_table="formation.staff_development_action",
            source_id=a.id,
            trainer_id=tr.id,
            produced_on=a.completed_on,
            produced_by=a.created_by,
        )


# ── Organisme ─────────────────────────────────────────────────────────────────────


def detect_organization(db: Session) -> Iterator[EvidenceSpec]:
    org = db.scalar(select(t.Organization))
    if org is not None and org.disability_referent_name:
        yield EvidenceSpec(
            evidence_type="DISABILITY_REFERENT",
            label=f"Référent handicap : {org.disability_referent_name}",
            scope="ORGANISME",
            source_table="formation.organization",
            source_id=org.id,
            produced_on=org.updated_at.date() if org.updated_at else None,
            produced_by=org.created_by,
            facts={"name": org.disability_referent_name, "email": org.disability_referent_email},
            form_issues=[] if org.disability_referent_email else ["coordonnées du référent manquantes"],
        )
    for p in db.scalars(select(t.PartnerNetwork)):
        yield EvidenceSpec(
            evidence_type="HANDICAP_PARTNER" if p.kind == "HANDICAP" else "SOCIO_PARTNER",
            label=f"Partenaire : {p.name}",
            scope="ORGANISME",
            source_table="formation.partner",
            source_id=p.id,
            produced_on=p.last_contact_on,
            produced_by=p.created_by,
            facts={"kind": p.kind},
        )
    for w in db.scalars(select(t.WatchItem)):
        yield EvidenceSpec(
            evidence_type="WATCH",
            label=f"Veille {w.domain.lower()} : {w.title}",
            scope="ORGANISME",
            source_table="formation.watch_item",
            source_id=w.id,
            produced_on=w.exploited_on or w.noted_on,
            produced_by=w.created_by,
            facts={"domain": w.domain, "noted_on": _iso(w.noted_on), "exploited": w.exploited_on is not None},
            form_issues=[] if w.exploited_on and w.exploitation else ["veille non exploitée"],
        )
    for sc in db.scalars(select(t.Subcontractor)):
        issues = []
        if not sc.contract_signed_on:
            issues.append("contrat de sous-traitance non signé")
        if not sc.qualiopi_certified and not sc.last_review_on:
            issues.append("conformité du sous-traitant non vérifiée")
        yield EvidenceSpec(
            evidence_type="SUBCONTRACTOR",
            label=f"Sous-traitant : {sc.name}",
            scope="ORGANISME",
            source_table="formation.subcontractor",
            source_id=sc.id,
            produced_on=sc.contract_signed_on,
            produced_by=sc.created_by,
            facts={"certified": sc.qualiopi_certified},
            form_issues=issues,
        )
    for c in db.scalars(select(t.Complaint)):
        first = c.acknowledged_on or c.answered_on
        yield EvidenceSpec(
            evidence_type="COMPLAINT_HANDLING",
            label=f"{c.kind.title()} du {c.received_on.isoformat()}",
            scope="SESSION" if c.session_id else "ORGANISME",
            source_table="formation.complaint",
            source_id=c.id,
            session_id=c.session_id,
            produced_on=c.received_on,
            produced_by=c.created_by,
            facts={
                "received_on": _iso(c.received_on),
                "first_response_on": _iso(first),
                "resolved_on": _iso(c.resolved_on),
                "response_days": (first - c.received_on).days if first else None,
            },
            form_issues=[] if first else ["aucune réponse tracée"],
        )
    for capa in db.scalars(select(CapaAction).where(CapaAction.status == "CLOTUREE")):
        yield EvidenceSpec(
            evidence_type="IMPROVEMENT_ACTION",
            label=f"{capa.reference} — {capa.title}",
            scope="ORGANISME",
            source_table="qualite.capa_action",
            source_id=capa.id,
            produced_on=capa.closed_at.date() if capa.closed_at else None,
            produced_by=capa.verified_by,
            facts={"verified": capa.verified_at is not None},
        )
    for d in db.scalars(select(t.Document).where(t.Document.status != "REMPLACE")):
        if not d.indicator_hints:
            continue
        yield EvidenceSpec(
            evidence_type="PROCEDURE" if d.kind == "PROCEDURE" else "DOCUMENT",
            label=f"{d.title} (v{d.version})",
            scope="ORGANISME",
            source_table="formation.document",
            source_id=d.id,
            session_id=d.session_id,
            program_id=d.program_id,
            produced_on=d.created_at.date() if d.created_at else None,
            produced_by=d.created_by,
            document_id=d.id,
            declared_indicators=list(d.indicator_hints),
            form_issues=[] if d.status in ("EMIS", "SIGNE") else ["document au statut brouillon"],
        )


def load_sessions(db: Session, session_id: str | None = None) -> list[t.TrainingSession]:
    q = select(t.TrainingSession).options(
        selectinload(t.TrainingSession.attendance_slots),
        selectinload(t.TrainingSession.enrollments).selectinload(t.Enrollment.learner),
        selectinload(t.TrainingSession.enrollments).selectinload(t.Enrollment.needs_analysis),
        selectinload(t.TrainingSession.enrollments).selectinload(t.Enrollment.positioning),
        selectinload(t.TrainingSession.enrollments).selectinload(t.Enrollment.convocation),
        selectinload(t.TrainingSession.enrollments).selectinload(t.Enrollment.assessments),
        selectinload(t.TrainingSession.enrollments).selectinload(t.Enrollment.certificate),
        selectinload(t.TrainingSession.enrollments).selectinload(t.Enrollment.signatures).selectinload(t.AttendanceSignature.slot),
    )
    if session_id:
        q = q.where(t.TrainingSession.id == session_id)
    return list(db.scalars(q))
