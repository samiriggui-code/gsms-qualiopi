"""Evidence Engine : réconciliation données → preuves, liaison aux indicateurs, validation humaine."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import InvalidStateError, NotFoundError
from app.qualiopi.common import next_reference
from app.qualiopi.evidence.detectors import (
    EvidenceSpec,
    detect_organization,
    detect_program,
    detect_session,
    detect_surveys,
    detect_trainer,
    load_sessions,
)
from app.qualiopi.evidence.models import Evidence, EvidenceEvent, EvidenceIndicatorLink, EvidenceValidation
from app.qualiopi.referential.models import Indicator, ReferentialVersion
from app.training import models as t

HUMAN_STATUSES = ("VALIDEE", "REJETEE")


def _hash(spec: EvidenceSpec, document_sha: str | None) -> str:
    payload = {
        "facts": spec.facts,
        "produced_on": spec.produced_on.isoformat() if spec.produced_on else None,
        "valid_until": spec.valid_until.isoformat() if spec.valid_until else None,
        "document": document_sha,
        "issues": spec.form_issues,
        "scope": [spec.program_id, spec.session_id, spec.enrollment_id, spec.trainer_id],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _auto_status(spec: EvidenceSpec, document_sha: str | None, today: date) -> str:
    if spec.valid_until is not None and spec.valid_until < today:
        return "EXPIREE"
    if spec.form_issues:
        return "DOCUMENTEE" if document_sha else "DETECTEE"
    return "EXPLOITABLE"


# Chaque preuve appartient à un groupe, déduit de sa table source. Une réconciliation ciblée
# ne crée, ne modifie et ne retire que les preuves des groupes touchés.
PROGRAM_TABLES = ("formation.program",)
SESSION_TABLES = (
    "formation.session",
    "formation.enrollment",
    "formation.needs_analysis",
    "formation.positioning",
    "formation.convocation",
    "formation.assessment",
    "formation.certificate",
    "formation.satisfaction_survey",
)
TRAINER_TABLES = ("formation.trainer_qualification", "formation.staff_development_action")
ORG_TABLES = (
    "formation.organization",
    "formation.partner",
    "formation.watch_item",
    "formation.subcontractor",
    "formation.complaint",
    "formation.document",
    "qualite.capa_action",
)


@dataclass(frozen=True)
class Scope:
    """Périmètre d'une réconciliation. `Scope.everything()` = passe complète."""

    session_ids: frozenset[str] = frozenset()
    program_ids: frozenset[str] = frozenset()
    trainer_ids: frozenset[str] = frozenset()
    organization: bool = False
    full: bool = False

    @classmethod
    def everything(cls) -> "Scope":
        return cls(organization=True, full=True)

    def owns(self, source_table: str, session_id: str | None, program_id: str | None, trainer_id: str | None) -> bool:
        if self.full:
            return True
        if source_table in SESSION_TABLES:
            return session_id in self.session_ids
        if source_table in PROGRAM_TABLES:
            return program_id in self.program_ids
        if source_table in TRAINER_TABLES:
            return trainer_id in self.trainer_ids
        return self.organization


def collect_specs(db: Session, today: date, scope: Scope | None = None) -> list[EvidenceSpec]:
    scope = scope or Scope.everything()
    specs: list[EvidenceSpec] = []
    programs = select(t.Program)
    if not scope.full:
        programs = programs.where(t.Program.id.in_(scope.program_ids))
    for p in db.scalars(programs):
        specs.extend(detect_program(p))

    sessions = load_sessions(db) if scope.full else [s for sid in scope.session_ids for s in load_sessions(db, sid)]
    by_id = {s.id: s for s in sessions}
    for s in sessions:
        if s.status == "ANNULEE":
            continue
        specs.extend(detect_session(s, today))
    surveys = select(t.SatisfactionSurvey)
    if not scope.full:
        surveys = surveys.where(t.SatisfactionSurvey.session_id.in_(scope.session_ids))
    specs.extend(detect_surveys(list(db.scalars(surveys)), by_id))

    trainers = select(t.Trainer).options(selectinload(t.Trainer.qualifications))
    if not scope.full:
        trainers = trainers.where(t.Trainer.id.in_(scope.trainer_ids))
    trainers_list = list(db.scalars(trainers))
    actions = list(db.scalars(select(t.StaffDevelopmentAction).where(t.StaffDevelopmentAction.trainer_id.in_([x.id for x in trainers_list]))))
    for tr in trainers_list:
        specs.extend(detect_trainer(tr, [a for a in actions if a.trainer_id == tr.id]))

    if scope.organization:
        specs.extend(detect_organization(db))
    return [s for s in specs if scope.owns(s.source_table, s.session_id, s.program_id, s.trainer_id)]


def type_index(version: ReferentialVersion) -> dict[str, list[int]]:
    out: dict[str, list[int]] = {}
    for ind in version.indicators:
        for ev in ind.expected_evidence:
            out.setdefault(ev["type"], []).append(ind.number)
    return out


def _existing_in_scope(db: Session, scope: Scope) -> list[Evidence]:
    q = select(Evidence).options(selectinload(Evidence.links))
    if not scope.full:
        parts = []
        if scope.session_ids:
            parts.append(and_(Evidence.source_table.in_(SESSION_TABLES), Evidence.session_id.in_(scope.session_ids)))
        if scope.program_ids:
            parts.append(and_(Evidence.source_table.in_(PROGRAM_TABLES), Evidence.program_id.in_(scope.program_ids)))
        if scope.trainer_ids:
            parts.append(and_(Evidence.source_table.in_(TRAINER_TABLES), Evidence.trainer_id.in_(scope.trainer_ids)))
        if scope.organization:
            parts.append(Evidence.source_table.in_(ORG_TABLES))
        if not parts:
            return []
        q = q.where(or_(*parts))
    return list(db.scalars(q))


def reconcile(db: Session, version: ReferentialVersion, today: date | None = None, actor: str = "moteur",
              scope: Scope | None = None) -> dict:
    """Aligne la table des preuves sur l'état des données métier, dans le périmètre donné. Idempotent."""
    today = today or date.today()
    scope = scope or Scope.everything()
    specs = collect_specs(db, today, scope)
    index = type_index(version)
    doc_ids = {s.document_id for s in specs if s.document_id}
    docs = {d.id: d for d in db.scalars(select(t.Document).where(t.Document.id.in_(doc_ids)))} if doc_ids else {}
    existing = {(e.evidence_type, e.source_table, e.source_id): e for e in _existing_in_scope(db, scope)}
    seen: set[tuple[str, str, str]] = set()
    stats = {"created": 0, "changed": 0, "retired": 0, "unchanged": 0}

    for spec in specs:
        key = (spec.evidence_type, spec.source_table, spec.source_id)
        if key in seen:
            continue
        seen.add(key)
        doc = docs.get(spec.document_id) if spec.document_id else None
        doc_sha = doc.sha256 if doc else None
        h = _hash(spec, doc_sha)
        auto = _auto_status(spec, doc_sha, today)
        ev = existing.get(key)
        if ev is None:
            ev = Evidence(
                reference=next_reference(db, "EV"),
                evidence_type=spec.evidence_type,
                source_table=spec.source_table,
                source_id=spec.source_id,
                status=auto,
            )
            _apply(ev, spec, h, doc_sha)
            db.add(ev)
            db.flush()
            ev.history.append(EvidenceEvent(kind="DETECTED", to_status=auto, detail="; ".join(spec.form_issues) or None, actor=actor))
            stats["created"] += 1
        elif ev.source_hash != h or ev.status == "RETIREE":
            before = ev.status
            _apply(ev, spec, h, doc_sha)
            ev.status = auto
            ev.history.append(
                EvidenceEvent(
                    kind="SOURCE_CHANGED",
                    from_status=before,
                    to_status=auto,
                    detail=("validation humaine à refaire ; " if before in HUMAN_STATUSES else "")
                    + ("; ".join(spec.form_issues) or "donnée source modifiée"),
                    actor=actor,
                )
            )
            stats["changed"] += 1
        else:
            # Même source : on garde la décision humaine, mais l'expiration s'applique toujours.
            if auto == "EXPIREE" and ev.status != "EXPIREE":
                ev.history.append(EvidenceEvent(kind="EXPIRED", from_status=ev.status, to_status="EXPIREE", actor=actor))
                ev.status = "EXPIREE"
                stats["changed"] += 1
            else:
                stats["unchanged"] += 1
        _sync_links(ev, spec, index, version.id)

    for key, ev in existing.items():
        if key not in seen and ev.status != "RETIREE":
            ev.history.append(
                EvidenceEvent(kind="SOURCE_DELETED", from_status=ev.status, to_status="RETIREE", detail="donnée source supprimée ou invalidée", actor=actor)
            )
            ev.status = "RETIREE"
            stats["retired"] += 1
    db.flush()
    return stats


def _apply(ev: Evidence, spec: EvidenceSpec, h: str, doc_sha: str | None) -> None:
    ev.label = spec.label[:300]
    ev.scope = spec.scope
    ev.program_id = spec.program_id
    ev.session_id = spec.session_id
    ev.enrollment_id = spec.enrollment_id
    ev.learner_id = spec.learner_id
    ev.trainer_id = spec.trainer_id
    ev.source_hash = h
    ev.document_id = spec.document_id
    ev.document_sha256 = doc_sha
    ev.produced_by = spec.produced_by
    ev.produced_on = spec.produced_on
    ev.valid_until = spec.valid_until
    ev.facts = spec.facts
    ev.form_issues = spec.form_issues


def _sync_links(ev: Evidence, spec: EvidenceSpec, index: dict[str, list[int]], version_id: str) -> None:
    wanted: dict[int, str] = {n: "AUTO" for n in index.get(spec.evidence_type, [])}
    for n in spec.declared_indicators:
        wanted.setdefault(n, "MANUEL")
    current = {(link.version_id, link.indicator_number): link for link in ev.links}
    for n, origin in wanted.items():
        if (version_id, n) not in current:
            ev.links.append(
                EvidenceIndicatorLink(
                    version_id=version_id,
                    indicator_number=n,
                    origin=origin,
                    reason=f"type {spec.evidence_type} attendu par l'indicateur {n}" if origin == "AUTO" else "déclaré sur le document",
                )
            )
    for (vid, n), link in current.items():
        if vid == version_id and n not in wanted and link.origin != "SUGGESTION":
            ev.links.remove(link)


def validate(db: Session, evidence_id: str, decision: str, comment: str | None, user_id: str, user_name: str) -> Evidence:
    ev = db.get(Evidence, evidence_id)
    if ev is None:
        raise NotFoundError("Preuve introuvable")
    if decision not in HUMAN_STATUSES:
        raise InvalidStateError("Décision attendue : VALIDEE ou REJETEE")
    if decision == "REJETEE" and not (comment or "").strip():
        raise InvalidStateError("Un motif est obligatoire pour rejeter une preuve")
    if decision == "VALIDEE" and ev.status not in ("EXPLOITABLE", "DOCUMENTEE", "VALIDEE"):
        raise InvalidStateError(f"Une preuve au statut {ev.status} ne peut pas être validée : corrigez d'abord la donnée source")
    before = ev.status
    ev.status = decision
    db.add(EvidenceValidation(evidence_id=ev.id, decision=decision, comment=comment, source_hash=ev.source_hash, by_user_id=user_id, by_name=user_name))
    ev.history.append(EvidenceEvent(kind="VALIDATED" if decision == "VALIDEE" else "REJECTED", from_status=before, to_status=decision, detail=comment, actor=user_name))
    db.flush()
    return ev


def indicator_numbers_for(version: ReferentialVersion) -> dict[int, Indicator]:
    return {i.number: i for i in version.indicators}
