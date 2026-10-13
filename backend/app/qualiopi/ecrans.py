"""Écrans Preuves, Évaluations et Audits : lectures prêtes à afficher et décisions motivées.

Le front n'interprète rien : chaque ligne porte ses libellés, sa cible lisible et ce que la personne
connectée peut faire (« capabilities »), avec le motif d'un refus.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.models import User
from app.auth.security import DB, QualityReader, permissions_of
from app.core.errors import InvalidStateError, NotFoundError
from app.platform.decisions import ALLOW, Decision, deny, enforce
from app.qualiopi.audit.models import JUDGMENTS, Audit
from app.qualiopi.audit.service import close_audit, compare, create_audit, default_sample, judge
from app.qualiopi.cycle.service import resolve_period
from app.qualiopi.evaluation.models import ControlResult, EvaluationRun, Finding
from app.qualiopi.evaluation.service import indicator_readiness, readiness_of
from app.qualiopi.evidence.models import EVIDENCE_STATUSES, USABLE_STATUSES, Evidence, EvidenceValidation
from app.qualiopi.evidence.service import _deposited_by, _grid_of
from app.qualiopi.labels import evidence_label
from app.qualiopi.nomenclature import criterion_name, indicator_name
from app.qualiopi.policy import QualityPolicy
from app.qualiopi.referential.importer import active_version
from app.qualiopi.referential.models import ControlDefinition, Indicator
from app.training import models as t

router = APIRouter(prefix="/api/v1/qualiopi", tags=["qualiopi"])

EVIDENCE_LIMIT = 500
RESULTS_LIMIT = 1000
RUNS_LIMIT = 15

EVIDENCE_STATUS_LABELS = {
    "DETECTEE": "Détectée", "DOCUMENTEE": "Documentée", "EXPLOITABLE": "Exploitable", "VALIDEE": "Validée",
    "EXPIREE": "Expirée", "REJETEE": "Rejetée", "RETIREE": "Retirée",
}
SCOPE_LABELS = {"ORGANISME": "Organisme", "FORMATION": "Formation", "SESSION": "Session", "APPRENANT": "Apprenant",
                "FORMATEUR": "Formateur"}
EVENT_LABELS = {
    "DETECTED": "Preuve détectée", "SOURCE_CHANGED": "Donnée source modifiée", "STATUS_CHANGED": "Statut recalculé",
    "VALIDATED": "Validée", "REJECTED": "Rejetée", "EXPIRED": "Expirée", "SOURCE_DELETED": "Donnée source supprimée",
}
FINDING_STATUS_LABELS = {"OUVERT": "Ouvert", "EN_TRAITEMENT": "En traitement", "RESOLU": "Résolu", "ACCEPTE": "Accepté",
                         "FAUX_POSITIF": "Faux positif"}
# Jugement de l'auditeur interne. « CONFORME » reste la valeur stockée, mais l'application n'écrit jamais
# « conforme » : seul l'organisme certificateur prononce la conformité.
JUDGMENT_LABELS = {"CONFORME": "Satisfait", "NC_MINEURE": "Non-conformité mineure", "NC_MAJEURE": "Non-conformité majeure",
                   "NON_APPLICABLE": "Sans objet"}
AUDIT_KINDS = {"INTERNE": "Audit interne", "BLANC": "Audit blanc"}
AUDIT_DISCLAIMER = ("Audit interne : jugement de l'organisme sur ses propres preuves, figées à la date de l'audit. "
                    "Il ne remplace pas l'audit du certificateur, seul à décider de la conformité.")


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value else None


def _has(db: Session, user: User, permission: str) -> bool:
    return permission in permissions_of(db, user)


class Targets:
    """Noms lisibles des cibles (sessions, formations, formateurs, apprenants), chargés une fois."""

    def __init__(self, db: Session):
        self.sessions = {s.id: s.reference for s in db.scalars(select(t.TrainingSession))}
        self.programs = {p.id: p.code for p in db.scalars(select(t.Program))}
        self.trainers = {x.id: x.full_name for x in db.scalars(select(t.Trainer))}
        self.learners = {x.id: x.full_name for x in db.scalars(select(t.Learner))}
        org = db.scalar(select(t.Organization))
        self.org_id = org.id if org else None

    def evidence(self, ev: Evidence) -> str:
        if ev.scope == "FORMATEUR" and ev.trainer_id:
            return self.trainers.get(ev.trainer_id, "Formateur")
        if ev.scope == "APPRENANT":
            who = self.learners.get(ev.learner_id or "")
            where = self.sessions.get(ev.session_id or "")
            return " · ".join(x for x in (who, where) if x) or "Apprenant"
        if ev.session_id:
            return self.sessions.get(ev.session_id, "Session")
        if ev.program_id:
            return f"Formation {self.programs.get(ev.program_id, '')}".strip()
        return "Organisme"

    def target(self, target_type: str, target_id: str) -> str:
        if target_type == "SESSION":
            return self.sessions.get(target_id, "Session")
        if target_type == "FORMATION":
            return f"Formation {self.programs.get(target_id, '')}".strip()
        return "Organisme"


# ── Preuves ──────────────────────────────────────────────────────────────────────


class EvidencePolicy:
    """Ce qu'une personne peut décider sur une preuve, avec les règles de `evidence.service.validate`."""

    def __init__(self, db: Session, user: User):
        self.db = db
        self.user = user
        self.can_validate = _has(db, user, "evidence.validate")
        self._quality = QualityPolicy(db)

    def decide(self, ev: Evidence, decision: str) -> Decision:
        if not self.can_validate:
            return deny("PERMISSION_MISSING", "Permission « evidence.validate » requise")
        if ev.status == "RETIREE":
            return deny("EVIDENCE_REMOVED", "Donnée source supprimée : la preuve n'existe plus")
        if decision == "VALIDEE":
            if ev.status == "VALIDEE":
                return deny("ALREADY_VALIDATED", "Preuve déjà validée")
            if ev.status not in ("EXPLOITABLE", "DOCUMENTEE"):
                return deny("SOURCE_TO_FIX", f"Preuve {EVIDENCE_STATUS_LABELS.get(ev.status, ev.status).lower()} : "
                                             "corrigez d'abord la donnée source")
            if _deposited_by(self.db, ev) == self.user.id:
                return self._quality.can_validate_own_piece()
            return ALLOW
        if ev.status == "REJETEE":
            return deny("ALREADY_REJECTED", "Preuve déjà rejetée")
        return ALLOW

    def capabilities(self, ev: Evidence) -> dict:
        valider = self.decide(ev, "VALIDEE").to_dict() | {"libelle": "Valider"}
        rejeter = self.decide(ev, "REJETEE").to_dict() | {"libelle": "Rejeter", "a_saisir": ["motif"]}
        return {"valider": valider, "rejeter": rejeter}


def _evidence_row(ev: Evidence, targets: Targets, policy: EvidencePolicy, version_id: str) -> dict:
    return {
        "id": ev.id, "reference": ev.reference, "libelle": ev.label, "type": ev.evidence_type,
        "type_libelle": evidence_label(ev.evidence_type), "statut": ev.status,
        "statut_libelle": EVIDENCE_STATUS_LABELS.get(ev.status, ev.status), "portee": ev.scope,
        "portee_libelle": SCOPE_LABELS.get(ev.scope, ev.scope), "cible": targets.evidence(ev), "session_id": ev.session_id,
        "produite_le": _iso(ev.produced_on), "valide_jusqu_au": _iso(ev.valid_until), "par": ev.produced_by,
        "indicateurs": sorted({link.indicator_number for link in ev.links
                               if link.version_id == version_id and link.status == "ACTIF"}),
        "problemes": ev.form_issues or [], "document_id": ev.document_id, "detectee_le": _iso(ev.detected_at),
        "capabilities": policy.capabilities(ev),
    }


@router.get("/preuves")
def list_evidence(db: DB, user: QualityReader, statut: Annotated[list[str] | None, Query()] = None,
                  type: str | None = None, indicateur: int | None = None, session_id: str | None = None,
                  recherche: str | None = None) -> dict:
    """Les preuves de l'organisme (hors retirées sauf demande), les plus récentes d'abord, et leurs comptes."""
    version = active_version(db)
    q = select(Evidence).options(selectinload(Evidence.links)).order_by(
        Evidence.produced_on.desc().nullslast(), Evidence.reference.desc())
    rows = list(db.scalars(q))
    counts = Counter(ev.status for ev in rows)
    statuses = set(statut or [s for s in EVIDENCE_STATUSES])
    targets = Targets(db)

    def keep(ev: Evidence) -> bool:
        if ev.status not in statuses:
            return False
        if type and ev.evidence_type != type:
            return False
        if session_id and ev.session_id != session_id:
            return False
        if indicateur is not None and not any(
                link.indicator_number == indicateur and link.version_id == version.id and link.status == "ACTIF"
                for link in ev.links):
            return False
        if recherche:
            needle = recherche.casefold()
            hay = f"{ev.reference} {ev.label} {evidence_label(ev.evidence_type)} {targets.evidence(ev)}".casefold()
            return needle in hay
        return True

    kept = [ev for ev in rows if keep(ev)]
    policy = EvidencePolicy(db, user)
    return {
        "total": len(kept),
        "affichees": min(len(kept), EVIDENCE_LIMIT),
        "par_statut": [{"statut": s, "libelle": EVIDENCE_STATUS_LABELS[s], "nombre": counts.get(s, 0)}
                       for s in (*EVIDENCE_STATUSES, "RETIREE") if counts.get(s) or s in EVIDENCE_STATUSES],
        "types": sorted(({"type": code, "libelle": evidence_label(code)} for code in {ev.evidence_type for ev in rows}),
                        key=lambda x: x["libelle"]),
        "preuves": [_evidence_row(ev, targets, policy, version.id) for ev in kept[:EVIDENCE_LIMIT]],
    }


def _evidence(db: Session, evidence_id: str) -> Evidence:
    ev = db.get(Evidence, evidence_id)
    if ev is None:
        raise NotFoundError("Preuve introuvable")
    return ev


@router.get("/preuves/{evidence_id}")
def get_evidence(evidence_id: str, db: DB, user: QualityReader) -> dict:
    """Une preuve : d'où elle vient, à quoi elle sert, sa grille de relecture, ses décisions et son historique."""
    ev = _evidence(db, evidence_id)
    version = active_version(db)
    indicators = {i.number: i for i in version.indicators}
    validations = db.scalars(select(EvidenceValidation).where(EvidenceValidation.evidence_id == ev.id)
                             .order_by(EvidenceValidation.at.desc()))
    return {
        **_evidence_row(ev, Targets(db), EvidencePolicy(db, user), version.id),
        "liens": [{"indicateur": link.indicator_number, "titre": indicators[link.indicator_number].title
                   if link.indicator_number in indicators else None, "origine": link.origin, "statut": link.status,
                   "raison": link.reason}
                  for link in sorted(ev.links, key=lambda x: x.indicator_number) if link.version_id == version.id],
        "grille": [{"code": g.code, "question": g.question, "exigence": g.exigence,
                    "sans_objet_possible": g.may_be_not_applicable} for g in _grid_of(ev)],
        "decisions": [{"decision": v.decision, "commentaire": v.comment, "par": v.by_name, "le": _iso(v.at),
                       "auto_validee": v.self_validated, "grille": v.checklist or {}} for v in validations],
        "historique": [{"le": _iso(e.at), "type": e.kind, "libelle": EVENT_LABELS.get(e.kind, e.kind.lower()),
                        "de": e.from_status, "vers": e.to_status, "detail": e.detail, "par": e.actor}
                       for e in reversed(ev.history)],
    }


# ── Évaluations ──────────────────────────────────────────────────────────────────


def _run_view(run: EvaluationRun, targets: Targets) -> dict:
    trigger = run.trigger
    if trigger.startswith("manuel:"):
        label = f"Réévaluation manuelle par {trigger.split(':', 1)[1]}"
    elif trigger.startswith("event:"):
        label = "Après une modification des données"
    elif trigger == "planifie":
        label = "Réévaluation planifiée"
    elif trigger == "demo":
        label = "Installation de la démo"
    else:
        label = f"Réévaluation ({trigger})"
    return {
        "id": run.id, "declencheur": label, "portee": run.scope,
        "cible": targets.target(run.scope, run.target_id) if run.target_id else "Tout l'organisme",
        "debut": _iso(run.started_at), "fin": _iso(run.finished_at), "resultats": run.results_count,
        "indicateurs": run.indicators,
    }


@router.get("/evaluations")
def evaluations(db: DB, user: QualityReader) -> dict:
    """Dernières évaluations du moteur et état de chaque indicateur, avec le décompte de ses contrôles."""
    version = active_version(db)
    targets = Targets(db)
    runs = list(db.scalars(select(EvaluationRun).where(EvaluationRun.version_id == version.id)
                           .order_by(EvaluationRun.started_at.desc()).limit(RUNS_LIMIT)))
    by_indicator: dict[int, Counter] = {}
    for number, status in db.execute(select(ControlResult.indicator_number, ControlResult.status)
                                     .where(ControlResult.version_id == version.id)):
        by_indicator.setdefault(number, Counter())[status] += 1
    open_findings = Counter(f.indicator_number for f in db.scalars(
        select(Finding).where(Finding.status.in_(("OUVERT", "EN_TRAITEMENT")))))
    period = resolve_period(db)
    indicators = []
    criteria = {i.number: i.criterion_number for i in version.indicators}
    for r in indicator_readiness(db, version, period=period):
        counts = by_indicator.get(r["number"], Counter())
        critere = criteria.get(r["number"])
        indicators.append({
            "numero": r["number"], "critere": critere, "critere_nom": criterion_name(critere) if critere else None,
            "etat": r["status"], "resultats": dict(counts), "controles": sum(counts.values()),
            "ecarts_ouverts": open_findings.get(r["number"], 0),
        })
    can_evaluate = _has(db, user, "quality.write")
    return {
        "referentiel": f"{version.code} {version.version}",
        "periode": period.view(),
        "derniere": _run_view(runs[0], targets) if runs else None,
        "evaluations": [_run_view(r, targets) for r in runs],
        "indicateurs": indicators,
        "capabilities": {"reevaluer": (ALLOW if can_evaluate else deny(
            "PERMISSION_MISSING", "Permission « quality.write » requise")).to_dict() | {"libelle": "Tout réévaluer"}},
        "avertissement": "État de préparation calculé à partir des preuves disponibles. Ne constitue pas une décision "
                         "de conformité : seul l'organisme certificateur en décide.",
    }


@router.get("/evaluations/resultats")
def control_results(db: DB, _: QualityReader, indicateur: int | None = None,
                    etat: Annotated[list[str] | None, Query()] = None, session_id: str | None = None) -> dict:
    """Résultats des contrôles (le dernier pour chaque cible), du pire au meilleur."""
    version = active_version(db)
    q = select(ControlResult).where(ControlResult.version_id == version.id)
    if indicateur is not None:
        q = q.where(ControlResult.indicator_number == indicateur)
    if etat:
        q = q.where(ControlResult.status.in_(etat))
    if session_id:
        q = q.where(ControlResult.session_id == session_id)
    rows = list(db.scalars(q))
    labels = {c.key: c.label for c in db.scalars(select(ControlDefinition).join(Indicator).where(
        Indicator.version_id == version.id))}
    refs = {e.id: e.reference for e in db.scalars(select(Evidence).where(
        Evidence.id.in_({i for r in rows for i in r.evidence_ids})))} if rows else {}
    targets = Targets(db)
    rank = {"PREUVES_INSUFFISANTES": 0, "A_RISQUE": 1, "NON_EVALUABLE": 2, "NON_EVALUE": 3, "DEMONTRABLE": 4,
            "NON_APPLICABLE": 5}
    rows.sort(key=lambda r: (rank.get(r.status, 9), r.indicator_number, r.control_key, targets.target(r.target_type, r.target_id)))
    return {
        "total": len(rows),
        "resultats": [{
            "id": r.id, "indicateur": r.indicator_number, "controle": r.control_key,
            "libelle": labels.get(r.control_key, r.control_key), "cible": targets.target(r.target_type, r.target_id),
            "type_cible": r.target_type, "session_id": r.session_id, "etat": r.status, "attendu": r.expected,
            "constate": r.observed, "explication": r.explanation, "manquants": r.missing,
            "revue_humaine": r.human_validation_required, "evalue_le": _iso(r.evaluated_at),
            "preuves": [refs[i] for i in r.evidence_ids if i in refs],
        } for r in rows[:RESULTS_LIMIT]],
    }


@router.get("/constats")
def findings(db: DB, _: QualityReader, statut: Annotated[list[str] | None, Query()] = None,
             indicateur: int | None = None) -> list[dict]:
    """Tous les constats (écarts), y compris résolus : l'historique de ce que le moteur et les audits ont relevé."""
    q = select(Finding).order_by(Finding.first_seen_at.desc())
    if statut:
        q = q.where(Finding.status.in_(statut))
    if indicateur is not None:
        q = q.where(Finding.indicator_number == indicateur)
    targets = Targets(db)
    return [{
        "id": f.id, "reference": f.reference, "origine": f.origin, "indicateur": f.indicator_number, "titre": f.title,
        "explication": f.explanation, "a_faire": f.remediation, "gravite": f.severity, "etat_moteur": f.readiness,
        "statut": f.status, "statut_libelle": FINDING_STATUS_LABELS.get(f.status, f.status),
        "cible": targets.target(f.target_type, f.target_id) if f.origin == "CONTROLE" else "Audit interne",
        "session_id": f.session_id, "constate_le": _iso(f.first_seen_at), "vu_le": _iso(f.last_seen_at),
        "resolu_le": _iso(f.resolved_at),
    } for f in db.scalars(q)]


# ── Formation ────────────────────────────────────────────────────────────────────

RANK = {"PREUVES_INSUFFISANTES": 0, "A_RISQUE": 1, "NON_EVALUABLE": 2, "NON_EVALUE": 3, "DEMONTRABLE": 4,
        "NON_APPLICABLE": 5}


@router.get("/formations/{program_id}")
def formation_view(program_id: str, db: DB, user: QualityReader) -> dict:
    """Ce que le moteur sait d'une formation : par indicateur, l'état calculé sur ses contrôles et ceux de ses
    sessions, le détail de chaque contrôle, ses preuves et ses écarts ouverts. Les éléments de l'organisme,
    communs à toutes les formations, restent dans le carnet."""
    program = db.get(t.Program, program_id)
    if program is None:
        raise NotFoundError("Formation introuvable")
    version = active_version(db)
    session_ids = set(db.scalars(select(t.TrainingSession.id).where(t.TrainingSession.program_id == program_id)))

    def mine(target_type: str, target_id: str, session_id: str | None) -> bool:
        return (target_type == "FORMATION" and target_id == program_id) or (session_id is not None and session_id in session_ids)

    results = [r for r in db.scalars(select(ControlResult).where(ControlResult.version_id == version.id))
               if mine(r.target_type, r.target_id, r.session_id)]
    by_ind: dict[int, list[ControlResult]] = {}
    for r in results:
        by_ind.setdefault(r.indicator_number, []).append(r)
    labels = {c.key: c.label for c in db.scalars(select(ControlDefinition).join(Indicator).where(
        Indicator.version_id == version.id))}
    evidence = [ev for ev in db.scalars(select(Evidence).options(selectinload(Evidence.links)).where(
        Evidence.status != "RETIREE").order_by(Evidence.produced_on.desc().nullslast(), Evidence.reference.desc()))
        if ev.program_id == program_id or (ev.session_id is not None and ev.session_id in session_ids)]
    refs = {ev.id: ev.reference for ev in evidence}
    findings = [f for f in db.scalars(select(Finding).where(Finding.status.in_(("OUVERT", "EN_TRAITEMENT")))
                                      .order_by(Finding.first_seen_at))
                if mine(f.target_type, f.target_id, f.session_id)]
    targets = Targets(db)
    org = db.scalar(select(t.Organization))
    programs = list(db.scalars(select(t.Program)))

    indicateurs = []
    for ind in version.indicators:
        rows = by_ind.get(ind.number)
        if not rows:
            continue
        status, _ = readiness_of(ind, rows, org, programs, program)
        rows.sort(key=lambda r: (RANK.get(r.status, 9), r.control_key, targets.target(r.target_type, r.target_id)))
        indicateurs.append({
            "numero": ind.number, "nom": indicator_name(ind.number, ind.title), "etat": status,
            "controles": [{
                "id": r.id, "libelle": labels.get(r.control_key, r.control_key),
                "cible": targets.target(r.target_type, r.target_id), "type_cible": r.target_type,
                "session_id": r.session_id, "etat": r.status, "attendu": r.expected, "constate": r.observed,
                "explication": r.explanation, "manquants": r.missing, "revue_humaine": r.human_validation_required,
                "evalue_le": _iso(r.evaluated_at), "preuves": [refs[i] for i in r.evidence_ids if i in refs],
            } for r in rows],
        })
    indicateurs.sort(key=lambda i: (RANK.get(i["etat"], 9), i["numero"]))
    return {
        "formation": {"id": program.id, "code": program.code, "titre": program.title},
        "sessions": len(session_ids),
        "indicateurs": indicateurs,
        "preuves": {
            "total": len(evidence),
            "exploitables": sum(1 for ev in evidence if ev.status in USABLE_STATUSES),
            "liste": [{
                "id": ev.id, "reference": ev.reference, "libelle": ev.label,
                "type_libelle": evidence_label(ev.evidence_type), "statut": ev.status,
                "statut_libelle": EVIDENCE_STATUS_LABELS.get(ev.status, ev.status), "cible": targets.evidence(ev),
                "produite_le": _iso(ev.produced_on), "document_id": ev.document_id,
                "indicateurs": sorted({link.indicator_number for link in ev.links
                                       if link.version_id == version.id and link.status == "ACTIF"}),
            } for ev in evidence[:EVIDENCE_LIMIT]],
        },
        "ecarts": [{
            "id": f.id, "reference": f.reference, "indicateur": f.indicator_number, "titre": f.title,
            "a_faire": f.remediation, "statut_libelle": FINDING_STATUS_LABELS.get(f.status, f.status),
            "session_id": f.session_id, "constate_le": _iso(f.first_seen_at),
        } for f in findings],
        "avertissement": "État de préparation calculé à partir des preuves de cette formation et de ses sessions. "
                         "Les éléments communs à l'organisme sont dans le carnet d'audit. Seul l'organisme "
                         "certificateur décide de la conformité.",
    }


# ── Audits internes ──────────────────────────────────────────────────────────────


class AuditPolicy:
    """Ouvrir un audit relève de la qualité ; juger et clore engagent l'auditeur (evidence.validate)."""

    def __init__(self, db: Session, user: User):
        self.can_write = _has(db, user, "quality.write")
        self.can_judge = _has(db, user, "evidence.validate")

    def can_create(self) -> Decision:
        return ALLOW if self.can_write else deny("PERMISSION_MISSING", "Permission « quality.write » requise")

    def can_judge_item(self, audit: Audit) -> Decision:
        if not self.can_judge:
            return deny("PERMISSION_MISSING", "Permission « evidence.validate » requise")
        if audit.status != "EN_COURS":
            return deny("AUDIT_CLOSED", "Audit clos : les jugements sont figés")
        return ALLOW

    def can_close(self, audit: Audit) -> Decision:
        decision = self.can_judge_item(audit)
        if not decision.allowed:
            return decision
        pending = [i.indicator_number for i in audit.items if i.judgment is None]
        if pending:
            return deny("JUDGMENTS_MISSING", f"{len(pending)} indicateur(s) encore à juger",
                        [f"Indicateur {n} non jugé" for n in pending])
        return ALLOW


def _audit_summary(audit: Audit, sessions: dict[str, str], policy: AuditPolicy) -> dict:
    judged = Counter(i.judgment for i in audit.items if i.judgment)
    return {
        "id": audit.id, "reference": audit.reference, "titre": audit.title, "type": audit.kind,
        "type_libelle": AUDIT_KINDS.get(audit.kind, audit.kind), "statut": audit.status,
        "statut_libelle": "En cours" if audit.status == "EN_COURS" else "Clos", "auditeur": audit.auditor_name,
        "referentiel": audit.referential_label, "prevu_le": _iso(audit.planned_on), "photo_le": _iso(audit.snapshot_at),
        "clos_le": _iso(audit.closed_at), "periode": {"du": _iso(audit.period_start), "au": _iso(audit.period_end)},
        "echantillon": [sessions.get(s, s) for s in audit.sample_session_ids],
        "progression": {"juges": sum(judged.values()), "total": len(audit.items)},
        "jugements": [{"jugement": j, "libelle": JUDGMENT_LABELS[j], "nombre": judged.get(j, 0)} for j in JUDGMENTS],
        "conclusion": audit.conclusion,
        "capabilities": {"juger": policy.can_judge_item(audit).to_dict(),
                         "clore": policy.can_close(audit).to_dict() | {"a_saisir": ["conclusion"]}},
    }


def _audit(db: Session, audit_id: str) -> Audit:
    audit = db.get(Audit, audit_id)
    if audit is None:
        raise NotFoundError("Audit introuvable")
    return audit


def _sessions(db: Session) -> dict[str, str]:
    return {s.id: s.reference for s in db.scalars(select(t.TrainingSession))}


@router.get("/audits")
def list_audits(db: DB, user: QualityReader) -> dict:
    policy = AuditPolicy(db, user)
    sessions = _sessions(db)
    audits = list(db.scalars(select(Audit).order_by(Audit.snapshot_at.desc())))
    return {
        "audits": [_audit_summary(a, sessions, policy) for a in audits],
        "capabilities": {"creer": policy.can_create().to_dict() | {"libelle": "Nouvel audit"}},
        "avertissement": AUDIT_DISCLAIMER,
    }


@router.get("/audits/echantillon")
def proposed_sample(db: DB, _: QualityReader) -> dict:
    """Sessions qu'un audit pourrait examiner sur la période, et l'échantillon proposé (façon certificateur)."""
    period = resolve_period(db)
    proposed = set(default_sample(db, period=period))
    rows = db.scalars(select(t.TrainingSession).options(selectinload(t.TrainingSession.program))
                      .where(t.TrainingSession.status.in_(("EN_COURS", "TERMINEE", "CLOTUREE")))
                      .order_by(t.TrainingSession.start_date.desc()))
    return {
        "periode": period.view(),
        "sessions": [{"id": s.id, "reference": s.reference, "formation": s.program_title, "du": _iso(s.start_date),
                      "au": _iso(s.end_date), "statut": s.status, "proposee": s.id in proposed}
                     for s in rows if period.contains_session(s.start_date, s.end_date)],
    }


class AuditIn(BaseModel):
    titre: str
    type: str = "BLANC"
    auditeur: str
    prevu_le: date | None = None
    sessions: list[str] | None = None


@router.post("/audits", status_code=201)
def open_audit(body: AuditIn, db: DB, user: QualityReader) -> dict:
    """Ouvre un audit : la photo des résultats, des preuves et des écarts est prise maintenant et ne bougera plus."""
    policy = AuditPolicy(db, user)
    enforce(policy.can_create())
    if body.type not in AUDIT_KINDS:
        raise InvalidStateError("Type d'audit : INTERNE ou BLANC")
    for label, value in (("l'intitulé", body.titre), ("l'auditeur", body.auditeur)):
        if not value.strip():
            raise InvalidStateError(f"Indiquez {label}")
    audit = create_audit(db, active_version(db), title=body.titre.strip(), kind=body.type,
                         auditor_name=body.auditeur.strip(), planned_on=body.prevu_le,
                         sample_session_ids=body.sessions or None, actor=user.full_name)
    db.commit()
    return get_audit(audit.id, db, user)


@router.get("/audits/comparaison")
def compare_audits(db: DB, _: QualityReader, ids: Annotated[list[str] | None, Query()] = None) -> dict:
    """Évolution d'un audit à l'autre : état du moteur et jugement, indicateur par indicateur (4 derniers par défaut)."""
    if ids:
        audits = list(db.scalars(select(Audit).where(Audit.id.in_(ids))))
    else:
        audits = list(db.scalars(select(Audit).order_by(Audit.snapshot_at.desc()).limit(4)))
    rows = compare(audits)
    for row in rows:
        for p in row["points"]:
            p["jugement_libelle"] = JUDGMENT_LABELS.get(p["judgment"]) if p["judgment"] else None
    ordered = sorted(audits, key=lambda a: a.snapshot_at)
    return {"audits": [{"id": a.id, "reference": a.reference, "titre": a.title, "photo_le": _iso(a.snapshot_at)}
                       for a in ordered], "indicateurs": rows}


@router.get("/audits/{audit_id}")
def get_audit(audit_id: str, db: DB, user: QualityReader) -> dict:
    audit = _audit(db, audit_id)
    policy = AuditPolicy(db, user)
    sessions = _sessions(db)
    findings = {f.audit_item_id: f.reference for f in db.scalars(select(Finding).where(
        Finding.audit_item_id.in_([i.id for i in audit.items])))}
    criteria = {i.number: i.criterion_number for i in active_version(db).indicators}
    return {
        **_audit_summary(audit, sessions, policy),
        "jugements_possibles": [{"jugement": j, "libelle": JUDGMENT_LABELS[j],
                                 "motif_obligatoire": j in ("NC_MINEURE", "NC_MAJEURE")} for j in JUDGMENTS],
        "indicateurs": [{
            "numero": i.indicator_number, "titre": i.indicator_title, "critere": criteria.get(i.indicator_number),
            "etat_moteur": i.engine_readiness, "jugement": i.judgment,
            "jugement_libelle": JUDGMENT_LABELS.get(i.judgment) if i.judgment else None,
            "commentaire": i.comment, "par": i.judged_by, "le": _iso(i.judged_at),
            "resultats": i.snapshot.get("results", []), "preuves": i.snapshot.get("evidence", []),
            "ecarts_ouverts": i.snapshot.get("findings", []), "revue_humaine": i.snapshot.get("human_review"),
            "constat": findings.get(i.id),
        } for i in audit.items],
        "criteres": [{"numero": n, "titre": criterion_name(n)} for n in sorted(set(criteria.values()))],
        "avertissement": AUDIT_DISCLAIMER,
    }


class JudgmentIn(BaseModel):
    jugement: str
    commentaire: str | None = None


@router.post("/audits/{audit_id}/indicateurs/{number}")
def judge_indicator(audit_id: str, number: int, body: JudgmentIn, db: DB, user: QualityReader) -> dict:
    audit = _audit(db, audit_id)
    enforce(AuditPolicy(db, user).can_judge_item(audit))
    judge(db, audit, number, body.jugement, (body.commentaire or "").strip() or None, user.full_name)
    db.commit()
    return get_audit(audit.id, db, user)


class CloseIn(BaseModel):
    conclusion: str


@router.post("/audits/{audit_id}/cloture")
def close(audit_id: str, body: CloseIn, db: DB, user: QualityReader) -> dict:
    """Clôt l'audit : chaque non-conformité devient un constat, sur lequel ouvrir une action corrective."""
    audit = _audit(db, audit_id)
    enforce(AuditPolicy(db, user).can_close(audit))
    if not body.conclusion.strip():
        raise InvalidStateError("Rédigez la conclusion de l'audit")
    close_audit(db, audit, body.conclusion.strip(), user.full_name)
    db.commit()
    return get_audit(audit.id, db, user)

