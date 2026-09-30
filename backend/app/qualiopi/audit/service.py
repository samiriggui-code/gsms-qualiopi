"""Audits internes figés et comparaison dans le temps."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import InvalidStateError, NotFoundError
from app.qualiopi.audit.models import JUDGMENTS, Audit, AuditItem
from app.qualiopi.common import next_reference
from app.qualiopi.cycle.service import Period, resolve_period
from app.qualiopi.evaluation.models import ControlResult, Finding
from app.qualiopi.evaluation.service import readiness_of
from app.qualiopi.evidence.models import Evidence
from app.qualiopi.referential.models import ReferentialVersion
from app.training import models as t


def default_sample(db: Session, per_program: int = 2, period: Period | None = None) -> list[str]:
    """Échantillon façon certificateur : les sessions réalisées les plus récentes de la période, par formation."""
    rows = db.scalars(
        select(t.TrainingSession)
        .where(t.TrainingSession.status.in_(("EN_COURS", "TERMINEE", "CLOTUREE")))
        .order_by(t.TrainingSession.start_date.desc())
    )
    picked: dict[str, list[str]] = {}
    for s in rows:
        if period is not None and not period.contains_session(s.start_date, s.end_date):
            continue
        lst = picked.setdefault(s.program_id, [])
        if len(lst) < per_program:
            lst.append(s.id)
    return [sid for ids in picked.values() for sid in ids]


def create_audit(db: Session, version: ReferentialVersion, *, title: str, kind: str, auditor_name: str,
                 planned_on: date | None, sample_session_ids: list[str] | None, actor: str,
                 period: Period | None = None) -> Audit:
    period = period or resolve_period(db)
    sample = sample_session_ids or default_sample(db, period=period)
    known = set(db.scalars(select(t.TrainingSession.id).where(t.TrainingSession.id.in_(sample))))
    unknown = set(sample) - known
    if unknown:
        raise NotFoundError(f"Sessions inconnues dans l'échantillon : {sorted(unknown)}")
    program_ids = set(db.scalars(select(t.TrainingSession.program_id).where(t.TrainingSession.id.in_(sample))))
    year = date.today().year
    audit = Audit(
        reference=next_reference(db, f"AUD-{year}", width=3),
        title=title,
        kind=kind,
        version_id=version.id,
        referential_label=f"{version.code} {version.version}",
        planned_on=planned_on,
        auditor_name=auditor_name,
        sample_session_ids=sample,
        period_start=period.start,
        period_end=period.end,
        snapshot_at=utcnow(),
        created_by=actor,
    )
    db.add(audit)
    db.flush()

    results = [
        r for r in db.scalars(select(ControlResult).where(ControlResult.version_id == version.id))
        if r.target_type == "ORGANISME"
        or (r.target_type == "FORMATION" and r.target_id in program_ids)
        or (r.session_id in sample)
    ]
    ev_ids = {eid for r in results for eid in r.evidence_ids}
    evidence = {e.id: e for e in db.scalars(select(Evidence).where(Evidence.id.in_(ev_ids)))} if ev_ids else {}
    open_findings = list(db.scalars(select(Finding).where(Finding.status.in_(("OUVERT", "EN_TRAITEMENT")))))
    org = db.scalar(select(t.Organization))
    programs = list(db.scalars(select(t.Program)))

    for ind in version.indicators:
        rows = [r for r in results if r.indicator_number == ind.number]
        readiness, _ = readiness_of(ind, rows, org, programs)
        snapshot = {
            "results": [
                {"control": r.control_key, "version": r.control_version, "target": r.target_type, "target_id": r.target_id,
                 "status": r.status, "expected": r.expected, "observed": r.observed, "explanation": r.explanation, "missing": r.missing}
                for r in rows
            ],
            "evidence": sorted(
                ({"reference": evidence[i].reference, "type": evidence[i].evidence_type, "status": evidence[i].status,
                  "label": evidence[i].label, "source_hash": evidence[i].source_hash}
                 for r in rows for i in r.evidence_ids if i in evidence),
                key=lambda x: x["reference"],
            ),
            "findings": [f.reference for f in open_findings if f.indicator_number == ind.number and (f.session_id is None or f.session_id in sample)],
            "human_review": ind.human_review,
        }
        # dédoublonnage des preuves (un même EV peut servir plusieurs contrôles)
        seen, uniq = set(), []
        for e in snapshot["evidence"]:
            if e["reference"] not in seen:
                seen.add(e["reference"])
                uniq.append(e)
        snapshot["evidence"] = uniq
        audit.items.append(AuditItem(indicator_number=ind.number, indicator_title=ind.title, engine_readiness=readiness, snapshot=snapshot))
    db.flush()
    return audit


def judge(db: Session, audit: Audit, number: int, judgment: str, comment: str | None, actor: str) -> AuditItem:
    if audit.status != "EN_COURS":
        raise InvalidStateError("Audit clos : jugements figés")
    if judgment not in JUDGMENTS:
        raise InvalidStateError(f"Jugement attendu : {', '.join(JUDGMENTS)}")
    if judgment in ("NC_MINEURE", "NC_MAJEURE") and not (comment or "").strip():
        raise InvalidStateError("Une non-conformité doit être motivée")
    item = next((i for i in audit.items if i.indicator_number == number), None)
    if item is None:
        raise NotFoundError(f"Indicateur {number} absent de l'audit")
    item.judgment = judgment
    item.comment = comment
    item.judged_by = actor
    item.judged_at = utcnow()
    return item


def close_audit(db: Session, audit: Audit, conclusion: str, actor: str) -> Audit:
    if audit.status != "EN_COURS":
        raise InvalidStateError("Audit déjà clos")
    pending = [i.indicator_number for i in audit.items if i.judgment is None]
    if pending:
        raise InvalidStateError(f"Indicateurs non jugés : {', '.join(str(n) for n in pending)}")
    for item in audit.items:
        if item.judgment in ("NC_MINEURE", "NC_MAJEURE"):
            key = f"audit:{audit.id}:{item.indicator_number}"
            if db.scalar(select(Finding).where(Finding.key == key)) is None:
                db.add(
                    Finding(
                        reference=next_reference(db, "CST"),
                        key=key,
                        origin="AUDIT",
                        indicator_number=item.indicator_number,
                        target_type="ORGANISME",
                        target_id=audit.id,
                        readiness=item.engine_readiness,
                        severity="majeure" if item.judgment == "NC_MAJEURE" else "mineure",
                        title=f"Audit {audit.reference} : {item.judgment.replace('_', ' ').lower()}",
                        explanation=item.comment or "",
                        remediation="Définir une action corrective et la faire vérifier.",
                        audit_item_id=item.id,
                    )
                )
    audit.status = "CLOS"
    audit.conclusion = conclusion
    audit.closed_at = utcnow()
    return audit


def compare(audits: list[Audit]) -> list[dict]:
    audits = sorted(audits, key=lambda a: a.snapshot_at)
    numbers = sorted({i.indicator_number for a in audits for i in a.items})
    out = []
    for n in numbers:
        row = {"indicator": n, "title": None, "points": []}
        for a in audits:
            item = next((i for i in a.items if i.indicator_number == n), None)
            if item:
                row["title"] = row["title"] or item.indicator_title
            row["points"].append(
                {"audit": a.reference, "date": a.snapshot_at.date().isoformat(),
                 "engine": item.engine_readiness if item else None, "judgment": item.judgment if item else None}
            )
        out.append(row)
    return out
