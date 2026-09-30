"""API du moteur Qualiopi (lecture de l'état de préparation, import du référentiel, validation humaine)."""

from datetime import date, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import or_, select

from app.auth.security import DB, EvidenceValidator, QualityReader, QualityWriter, ReferentialManager
from app.core.config import get_settings
from app.core.errors import InvalidStateError, NotFoundError
from app.platform.decisions import enforce
from app.qualiopi.capa import service as capa_service
from app.qualiopi.capa.models import CapaAction
from app.qualiopi.capa.policy import CapaPolicy, is_late
from app.qualiopi.carnet import carnet
from app.qualiopi.chain import capa_view, criteria_overview, indicator_chain
from app.qualiopi.cycle.models import CertificationCycle
from app.qualiopi.cycle.service import create_cycle, resolve_period
from app.qualiopi.engine import refresh_all
from app.qualiopi.evaluation.models import Finding
from app.qualiopi.evaluation.report import session_dossier
from app.qualiopi.evaluation.service import indicator_readiness
from app.qualiopi.evidence.models import Evidence, EvidenceIndicatorLink
from app.qualiopi.evidence.service import validate
from app.qualiopi.referential.importer import active_version, import_referential
from app.qualiopi.review.models import IndicatorReview
from app.qualiopi.review.service import record_review
from app.qualiopi.schedule.models import MilestoneStatus
from app.qualiopi.schedule.service import milestone_view
from app.training import models as t

router = APIRouter(prefix="/api/v1", tags=["qualiopi"])


class ImportIn(BaseModel):
    folder: str = "qualiopi/v9"  # relatif à REFERENTIALS_DIR
    activate: bool = True


def _referential_folder(relative: str) -> Path:
    root = get_settings().referentials_dir.resolve()
    folder = (root / relative).resolve()
    if not folder.is_relative_to(root) or not folder.is_dir():
        raise NotFoundError(f"Référentiel introuvable : {relative}")
    return folder


def _version_view(v) -> dict:  # noqa: ANN001
    return {
        "id": v.id,
        "code": v.code,
        "version": v.version,
        "title": v.title,
        "effective_from": v.effective_from.isoformat(),
        "source_label": v.source_label,
        "source_sha256": v.source_sha256,
        "normative_sha256": v.normative_sha256,
        "upstream_ref": v.upstream_ref,
        "source_url": v.source_url,
        "imported_at": v.imported_at.isoformat() if v.imported_at else None,
        "is_active": v.is_active,
        "indicators": len(v.indicators),
        "criteria": [{"number": c.number, "title": c.title} for c in v.criteria],
    }


def _indicator_summary(ind) -> dict:  # noqa: ANN001
    return {
        "number": ind.number,
        "code": f"I{ind.number:02d}",
        "criterion_number": ind.criterion_number,
        "title": ind.title,
        "scope": ind.scope,
        "ponderation": ind.ponderation,
        "new_entrant_adapted": ind.new_entrant_adapted,
        "subcontracting": ind.subcontracting,
        "applicability": ind.applicability or {},
        "expected_evidence": [e["type"] for e in ind.expected_evidence or []],
        "controls_count": len(ind.controls),
    }


@router.post("/referentials/import")
def import_version(body: ImportIn, db: DB, user: ReferentialManager) -> dict:
    v = import_referential(db, _referential_folder(body.folder), activate=body.activate, actor_id=user.id)
    db.commit()
    return _version_view(v)


@router.get("/referentials/active")
def get_active(db: DB, _: QualityReader) -> dict:
    return _version_view(active_version(db))


@router.get("/referentials/active/indicators")
def list_indicators(db: DB, _: QualityReader) -> list[dict]:
    """Les indicateurs du référentiel en vigueur (écran « Référentiel »)."""
    return [_indicator_summary(ind) for ind in sorted(active_version(db).indicators, key=lambda i: i.number)]


@router.get("/referentials/active/indicators/{number}")
def get_indicator(number: int, db: DB, _: QualityReader) -> dict:
    """Un indicateur : textes officiels, lecture de l'organisme, contrôles du moteur."""
    version = active_version(db)
    ind = next((i for i in version.indicators if i.number == number), None)
    if ind is None:
        raise NotFoundError(f"Indicateur {number} introuvable dans {version.code} {version.version}")
    criterion = next((c for c in version.criteria if c.number == ind.criterion_number), None)
    return {
        **_indicator_summary(ind),
        "criterion_title": criterion.title if criterion else "",
        "editorial_note": ind.editorial_note,
        "human_review": ind.human_review,
        "texts": [{"section": x.section, "body": x.body} for x in ind.texts],
        "controls": [
            {"key": c.key, "label": c.label, "check": c.check, "scope": c.scope, "severity": c.severity,
             "remediation": c.remediation, "guide_section": c.guide_section, "new_entrant_mode": c.new_entrant_mode}
            for c in ind.controls
        ],
    }


@router.post("/qualiopi/evaluate")
def evaluate_all(db: DB, user: QualityWriter) -> dict:
    """Réconciliation des preuves + réévaluation complète (bouton « tout réévaluer »)."""
    result = refresh_all(db, trigger=f"manuel:{user.email}")
    db.commit()
    return result


@router.get("/qualiopi/readiness")
def readiness(db: DB, _: QualityReader, du: date | None = None, au: date | None = None) -> dict:
    """État global sur la période : `du`/`au`, sinon le cycle de certification en cours, sinon toute l'activité."""
    version = active_version(db)
    period = resolve_period(db, du, au)
    return {
        "referential": f"{version.code} {version.version}",
        "periode": period.view(),
        "indicators": indicator_readiness(db, version, period=period),
        "disclaimer": "État de préparation calculé à partir des preuves disponibles. "
        "Ne constitue pas une décision de conformité : seul l'organisme certificateur en décide.",
    }


@router.get("/sessions/{session_id}/dossier")
def get_session_dossier(session_id: str, db: DB, _: QualityReader) -> dict:
    return session_dossier(db, active_version(db), session_id)


class ValidationIn(BaseModel):
    decision: str  # VALIDEE | REJETEE
    comment: str | None = None
    checklist: dict[str, str] | None = None  # code du point → OUI | NON | SANS_OBJET


@router.post("/evidence/{evidence_id}/validation")
def validate_evidence(evidence_id: str, body: ValidationIn, db: DB, user: EvidenceValidator) -> dict:
    ev = validate(db, evidence_id, body.decision, body.comment, user.id, user.full_name, checklist=body.checklist)
    db.commit()
    return {"id": ev.id, "reference": ev.reference, "status": ev.status}


@router.get("/qualiopi/echeances")
def upcoming(db: DB, _: QualityReader, days: int = Query(15, ge=0, le=365), owner: str | None = None) -> list[dict]:
    """Jalons en retard, ou non faits dont l'échéance tombe dans les `days` prochains jours."""
    horizon = date.today() + timedelta(days=days)
    q = (
        select(MilestoneStatus, t.TrainingSession.reference)
        .join(t.TrainingSession, t.TrainingSession.id == MilestoneStatus.session_id)
        .where(or_(MilestoneStatus.status.in_(("EN_RETARD", "A_ECHEANCE")),
                   (MilestoneStatus.status == "A_VENIR") & (MilestoneStatus.due_on <= horizon)))
        .order_by(MilestoneStatus.due_on)
    )
    if owner:
        q = q.where(MilestoneStatus.owner == owner)
    return [{"session": ref, "session_id": m.session_id, **milestone_view(m)} for m, ref in db.execute(q)]


class ReviewIn(BaseModel):
    conclusion: str  # SATISFAISANT | A_AMELIORER | INSUFFISANT
    comment: str
    valid_months: int = 12
    severity: str = "mineure"  # si INSUFFISANT


@router.post("/qualiopi/indicateurs/{number}/revues")
def review_indicator(number: int, body: ReviewIn, db: DB, user: EvidenceValidator) -> dict:
    """Revue humaine attestée : l'état calculé et les preuves consultées sont figés avec elle."""
    version = active_version(db)
    current = next((i for i in indicator_readiness(db, version) if i["number"] == number), None)
    if current is None:
        raise NotFoundError(f"Indicateur {number} inconnu")
    evidence = db.scalars(select(Evidence.reference).join(EvidenceIndicatorLink).where(
        EvidenceIndicatorLink.indicator_number == number, EvidenceIndicatorLink.version_id == version.id,
        Evidence.status.in_(("EXPLOITABLE", "VALIDEE")))).all()
    review = record_review(db, version, number, conclusion=body.conclusion, comment=body.comment,
                           engine_status=current["status"], evidence_refs=list(evidence), user_id=user.id,
                           user_name=user.full_name, valid_months=body.valid_months, severity=body.severity)
    db.commit()
    return {"id": review.id, "valid_until": review.valid_until.isoformat(), "finding_id": review.finding_id,
            "evidence_refs": review.evidence_refs}


@router.get("/qualiopi/indicateurs/{number}/revues")
def list_reviews(number: int, db: DB, _: QualityReader) -> list[dict]:
    rows = db.scalars(select(IndicatorReview).where(IndicatorReview.indicator_number == number).order_by(IndicatorReview.reviewed_at.desc()))
    return [{"conclusion": r.conclusion, "comment": r.comment, "by": r.reviewed_by, "at": r.reviewed_at.isoformat(),
             "valid_until": r.valid_until.isoformat(), "engine_status": r.engine_status, "evidence_refs": r.evidence_refs} for r in rows]


class CycleIn(BaseModel):
    label: str
    kind: str  # INITIAL | SURVEILLANCE | RENOUVELLEMENT | INTERNE
    period_start: date
    period_end: date | None = None
    audit_on: date | None = None
    certifier: str | None = None
    notes: str | None = None


@router.post("/qualiopi/cycles")
def add_cycle(body: CycleIn, db: DB, _: QualityWriter) -> dict:
    cycle = create_cycle(db, **body.model_dump())
    db.commit()
    return {"id": cycle.id, "label": cycle.label}


@router.get("/qualiopi/cycles")
def list_cycles(db: DB, _: QualityReader) -> list[dict]:
    rows = db.scalars(select(CertificationCycle).order_by(CertificationCycle.period_start.desc()))
    return [{"id": c.id, "label": c.label, "kind": c.kind, "period_start": c.period_start.isoformat(),
             "period_end": c.period_end.isoformat() if c.period_end else None,
             "audit_on": c.audit_on.isoformat() if c.audit_on else None, "certifier": c.certifier} for c in rows]


# ── Chaîne d'un indicateur et actions correctives ────────────────────────────────


@router.get("/qualiopi/criteres")
def criteria(db: DB, _: QualityReader) -> list[dict]:
    """Les critères et leurs indicateurs, avec l'état calculé et le nombre d'écarts ouverts."""
    return criteria_overview(db, active_version(db))


@router.get("/qualiopi/indicateurs/{number}")
def indicator(number: int, db: DB, user: QualityReader) -> dict:
    """Exigences, preuves attendues, contrôles, preuves disponibles, écarts, actions, historique."""
    return indicator_chain(db, active_version(db), number, user)


@router.get("/qualiopi/carnet")
def audit_book(db: DB, _: QualityReader, session_id: str | None = None) -> dict:
    """Carnet d'audit : une fiche par indicateur (textes officiels, état, preuves réunies, écarts, évolutions).

    Avec `session_id` : le carnet de l'audit de cette session (ses preuves et celles héritées)."""
    session = None
    if session_id:
        session = db.get(t.TrainingSession, session_id)
        if session is None:
            raise NotFoundError("Session introuvable")
    return carnet(db, active_version(db), session=session)


@router.get("/qualiopi/actions")
def list_actions(db: DB, user: QualityReader, statut: str | None = None, en_retard: bool = False) -> list[dict]:
    policy = CapaPolicy(db, user)
    q = select(CapaAction).order_by(CapaAction.due_on)
    if statut:
        q = q.where(CapaAction.status == statut)
    rows = [a for a in db.scalars(q) if not en_retard or is_late(a, policy.today)]
    findings = {f.id: f for f in db.scalars(select(Finding).where(Finding.id.in_([a.finding_id for a in rows])))} if rows else {}
    return [capa_view(a, findings.get(a.finding_id), policy) for a in rows]


@router.get("/qualiopi/ecarts")
def list_findings(db: DB, user: QualityReader, statut: Annotated[list[str], Query()] = ["OUVERT", "EN_TRAITEMENT"]) -> list[dict]:  # noqa: B006
    """Écarts (constats) à traiter, pour ouvrir une action corrective depuis le plan d'actions."""
    policy = CapaPolicy(db, user)
    rows = list(db.scalars(select(Finding).where(Finding.status.in_(statut))
                           .order_by(Finding.indicator_number, Finding.reference)))
    sessions = {s.id: s.reference for s in db.scalars(select(t.TrainingSession).where(
        t.TrainingSession.id.in_({f.session_id for f in rows if f.session_id})))} if rows else {}
    return [{
        "id": f.id, "reference": f.reference, "origine": f.origin, "indicateur": f.indicator_number,
        "titre": f.title, "explication": f.explanation, "remediation": f.remediation, "gravite": f.severity,
        "statut": f.status, "session": sessions.get(f.session_id or ""), "constate_le": f.first_seen_at.isoformat(),
        "ouvrir_action": policy.can_open(f).to_dict(),
    } for f in rows]


def _capa(db, capa_id: str) -> CapaAction:  # noqa: ANN001
    capa = db.get(CapaAction, capa_id)
    if capa is None:
        raise NotFoundError("Action corrective introuvable")
    return capa


@router.get("/qualiopi/actions/{capa_id}")
def get_action(capa_id: str, db: DB, user: QualityReader) -> dict:
    capa = _capa(db, capa_id)
    return capa_view(capa, db.get(Finding, capa.finding_id), CapaPolicy(db, user))


class CapaIn(BaseModel):
    titre: str
    plan: str
    responsable: str
    echeance: date
    cause: str | None = None
    type: str = "CORRECTIVE"


@router.post("/qualiopi/ecarts/{finding_id}/actions", status_code=201)
def open_action(finding_id: str, body: CapaIn, db: DB, user: QualityReader) -> dict:
    """Ouvre une action corrective sur un écart (le constat passe « en traitement »)."""
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise NotFoundError("Écart introuvable")
    policy = CapaPolicy(db, user)
    enforce(policy.can_open(finding))
    if body.type not in ("CORRECTIVE", "PREVENTIVE"):
        raise InvalidStateError("Type : CORRECTIVE ou PREVENTIVE")
    for label, value in (("l'intitulé", body.titre), ("le plan d'action", body.plan), ("le responsable", body.responsable)):
        if not value.strip():
            raise InvalidStateError(f"Indiquez {label}")
    if body.echeance < policy.today:
        raise InvalidStateError("L'échéance ne peut pas être dans le passé")
    capa = capa_service.create_capa(db, finding.id, title=body.titre.strip(), action_plan=body.plan.strip(),
                                    owner_name=body.responsable.strip(), due_on=body.echeance,
                                    root_cause=(body.cause or "").strip() or None, kind=body.type, actor=user.full_name)
    db.commit()
    return capa_view(capa, finding, policy)


class CapaStepIn(BaseModel):
    note: str | None = None
    motif: str | None = None


@router.post("/qualiopi/actions/{capa_id}/{action}")
def act_on_action(capa_id: str, action: str, body: CapaStepIn, db: DB, user: QualityReader) -> dict:
    capa = _capa(db, capa_id)
    policy = CapaPolicy(db, user)
    enforce(policy.decide(capa, action))
    actor = user.full_name
    if action == "demarrer":
        capa_service.start(db, capa, actor)
    elif action == "realiser":
        capa_service.complete(db, capa, body.note or "", actor)
    elif action == "verifier":
        capa_service.verify(db, capa, actor, body.note)
    else:
        capa_service.cancel(db, capa, body.motif or "", actor)
    db.commit()
    db.refresh(capa)
    return capa_view(capa, db.get(Finding, capa.finding_id), policy)
