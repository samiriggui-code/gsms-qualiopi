"""La chaîne d'un indicateur, de bout en bout, pour l'écran qualité.

critère → indicateur → exigences (texte du référentiel) → preuves attendues → contrôles du moteur
→ preuves disponibles → état → écarts → actions correctives (responsable, échéance) → historique.

Lecture seule : tout vient de ce que le moteur a déjà calculé. Rien n'est recalculé ici.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.errors import NotFoundError
from app.qualiopi.capa.models import CapaAction
from app.qualiopi.capa.policy import STATUS_LABELS, CapaPolicy, is_late
from app.qualiopi.evaluation.models import ControlResult, Finding
from app.qualiopi.evaluation.service import indicator_readiness
from app.qualiopi.evidence.models import USABLE_STATUSES, Evidence, EvidenceIndicatorLink
from app.qualiopi.labels import evidence_label
from app.qualiopi.referential.models import Criterion, Indicator, ReferentialVersion
from app.qualiopi.review.models import IndicatorReview
from app.training import models as t

STATUS_ORDER = {"PREUVES_INSUFFISANTES": 0, "A_RISQUE": 1, "NON_EVALUABLE": 2, "DEMONTRABLE": 3, "NON_APPLICABLE": 4}
EVIDENCE_LIMIT = 40
HISTORY_LIMIT = 40


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value else None


def _targets(db: Session) -> dict[str, str]:
    """Nom lisible d'une cible de contrôle (session, formation, organisme)."""
    names = {s.id: s.reference for s in db.scalars(select(t.TrainingSession))}
    names |= {p.id: f"Formation {p.code}" for p in db.scalars(select(t.Program))}
    org = db.scalar(select(t.Organization))
    if org:
        names[org.id] = "Organisme"
    return names


def capa_view(capa: CapaAction, finding: Finding | None, policy: CapaPolicy) -> dict:
    caps = policy.capabilities(capa)
    if finding is not None and finding.origin == "AUDIT" and caps["verifier"]["allowed"]:
        caps["verifier"]["a_saisir"] = ["note"]  # vérification humaine motivée (constat d'audit)
    return {
        "id": capa.id, "reference": capa.reference, "type": capa.kind, "titre": capa.title,
        "cause": capa.root_cause, "plan": capa.action_plan, "responsable": capa.owner_name,
        "echeance": _iso(capa.due_on), "statut": capa.status, "statut_libelle": STATUS_LABELS[capa.status],
        "en_retard": is_late(capa, policy.today), "realisation": capa.completion_note, "realisee_le": _iso(capa.completed_on),
        "verification": capa.verification_result, "verifiee_par": capa.verified_by, "cloturee_le": _iso(capa.closed_at),
        "ecart": {"id": finding.id, "reference": finding.reference, "indicateur": finding.indicator_number,
                  "titre": finding.title} if finding else None,
        "historique": [{"le": _iso(e.at), "type": e.kind, "detail": e.detail, "par": e.actor} for e in reversed(capa.events)],
        "capabilities": caps,
    }


def criteria_overview(db: Session, version: ReferentialVersion) -> list[dict]:
    """Les 7 critères et leurs indicateurs, avec l'état calculé de chacun."""
    readiness = {r["number"]: r for r in indicator_readiness(db, version)}
    open_findings = Counter(f.indicator_number for f in db.scalars(
        select(Finding).where(Finding.status.in_(("OUVERT", "EN_TRAITEMENT")))))
    out = []
    for c in sorted(version.criteria, key=lambda c: c.number):
        inds = [i for i in version.indicators if i.criterion_number == c.number]
        out.append({
            "numero": c.number, "titre": c.title,
            "indicateurs": [{
                "numero": i.number, "code": i.code, "titre": i.title,
                "etat": readiness[i.number]["status"], "revue_humaine": readiness[i.number]["revue_humaine"]["state"],
                "ecarts_ouverts": open_findings.get(i.number, 0),
            } for i in sorted(inds, key=lambda i: i.number)],
        })
    return out


def indicator_chain(db: Session, version: ReferentialVersion, number: int, user: User | None,
                    today: date | None = None) -> dict:
    today = today or date.today()
    ind = db.scalar(select(Indicator).where(Indicator.version_id == version.id, Indicator.number == number))
    if ind is None:
        raise NotFoundError(f"Indicateur {number} absent du référentiel {version.version}")
    criterion = db.scalar(select(Criterion).where(Criterion.version_id == version.id, Criterion.number == ind.criterion_number))
    readiness = next(r for r in indicator_readiness(db, version) if r["number"] == number)
    targets = _targets(db)
    policy = CapaPolicy(db, user, today)

    # Preuves reliées à l'indicateur (liens actifs), les plus récentes d'abord.
    evidence = list(db.scalars(
        select(Evidence).join(EvidenceIndicatorLink, EvidenceIndicatorLink.evidence_id == Evidence.id)
        .where(EvidenceIndicatorLink.version_id == version.id, EvidenceIndicatorLink.indicator_number == number,
               EvidenceIndicatorLink.status == "ACTIF", Evidence.status != "RETIREE")
        .order_by(Evidence.produced_on.desc().nullslast(), Evidence.reference.desc())
    ))
    by_type: dict[str, Counter] = {}
    for ev in evidence:
        by_type.setdefault(ev.evidence_type, Counter())[ev.status] += 1

    expected = [{
        "type": code, "libelle": evidence_label(code),
        "disponibles": sum(n for st, n in by_type.get(code, Counter()).items() if st in USABLE_STATUSES),
        "total": sum(by_type.get(code, Counter()).values()),
    } for code in (e["type"] for e in ind.expected_evidence)]

    results = list(db.scalars(select(ControlResult).where(
        ControlResult.version_id == version.id, ControlResult.indicator_number == number)))
    evidence_refs = {ev.id: ev.reference for ev in evidence}
    controls = []
    for c in sorted(ind.controls, key=lambda c: c.key):
        rows = sorted((r for r in results if r.control_key == c.key),
                      key=lambda r: (STATUS_ORDER.get(r.status, 9), targets.get(r.target_id, "")))
        controls.append({
            "cle": c.key, "libelle": c.label, "gravite": c.severity, "remediation": c.remediation,
            "resultats": [{
                "cible": targets.get(r.target_id, r.target_type.title()), "type_cible": r.target_type,
                "session_id": r.session_id, "etat": r.status, "attendu": r.expected, "constate": r.observed,
                "explication": r.explanation, "manquants": r.missing,
                "preuves": [evidence_refs.get(i) for i in r.evidence_ids if i in evidence_refs],
                "revue_humaine": r.human_validation_required, "evalue_le": _iso(r.evaluated_at),
            } for r in rows],
        })

    findings = list(db.scalars(select(Finding).where(Finding.indicator_number == number, Finding.status != "FAUX_POSITIF")
                               .order_by(Finding.first_seen_at.desc())))
    recent = today - timedelta(days=90)
    findings = [f for f in findings if f.status != "RESOLU" or (f.resolved_at and f.resolved_at.date() >= recent)]
    capas = list(db.scalars(select(CapaAction).where(CapaAction.finding_id.in_([f.id for f in findings])))) if findings else []
    gaps = []
    for f in findings:
        gaps.append({
            "id": f.id, "reference": f.reference, "origine": f.origin, "titre": f.title, "gravite": f.severity,
            "etat_moteur": f.readiness, "statut": f.status, "cible": targets.get(f.target_id, f.target_type.title()),
            "session_id": f.session_id, "explication": f.explanation, "manquants": f.missing, "a_faire": f.remediation,
            "constate_le": _iso(f.first_seen_at), "resolu_le": _iso(f.resolved_at),
            "actions": [capa_view(a, f, policy) for a in capas if a.finding_id == f.id],
            "capabilities": {"ouvrir_action": policy.can_open(f).to_dict()},
        })

    history: list[dict] = []
    for f in findings:
        history.append({"le": _iso(f.first_seen_at), "type": "ECART_CONSTATE", "libelle": f"{f.reference} constaté : {f.title}",
                        "par": "moteur" if f.origin == "CONTROLE" else "audit"})
        if f.resolved_at:
            history.append({"le": _iso(f.resolved_at), "type": "ECART_RESOLU", "libelle": f"{f.reference} résolu", "par": "moteur"})
    for a in capas:
        for e in a.events:
            history.append({"le": _iso(e.at), "type": f"ACTION_{e.kind.split(':')[0]}",
                            "libelle": f"{a.reference} — {_event_label(e.kind, e.detail)}", "par": e.actor})
    for r in db.scalars(select(IndicatorReview).where(IndicatorReview.version_id == version.id,
                                                      IndicatorReview.indicator_number == number)):
        history.append({"le": _iso(r.reviewed_at), "type": "REVUE_HUMAINE",
                        "libelle": f"Revue humaine : {r.conclusion.lower()} — {r.comment}", "par": r.reviewed_by})
    history.sort(key=lambda h: h["le"] or "", reverse=True)

    return {
        "referentiel": {"version": version.version, "en_vigueur_le": _iso(version.effective_from)},
        "critere": {"numero": ind.criterion_number, "titre": criterion.title if criterion else None},
        "indicateur": {
            "numero": ind.number, "code": ind.code, "titre": ind.title, "portee": ind.scope,
            "ponderation": ind.ponderation, "adapte_nouvel_entrant": ind.new_entrant_adapted,
            "exigences": [{"section": x.section, "texte": x.body} for x in ind.texts],
            "revue_humaine_attendue": ind.human_review or None,
        },
        "etat": readiness["status"],
        "revue_humaine": readiness["revue_humaine"],
        "preuves_attendues": expected,
        "controles": controls,
        "preuves": {
            "total": len(evidence),
            "par_statut": dict(Counter(ev.status for ev in evidence)),
            "liste": [{
                "id": ev.id, "reference": ev.reference, "libelle": ev.label, "type": ev.evidence_type,
                "type_libelle": evidence_label(ev.evidence_type), "statut": ev.status,
                "produite_le": _iso(ev.produced_on), "par": ev.produced_by, "session": targets.get(ev.session_id or ""),
                "problemes": ev.form_issues, "document_id": ev.document_id,
            } for ev in evidence[:EVIDENCE_LIMIT]],
        },
        "ecarts": gaps,
        "historique": history[:HISTORY_LIMIT],
        "avertissement": "État de préparation calculé à partir des preuves disponibles. Ne constitue pas une décision "
                         "de conformité : seul l'organisme certificateur en décide.",
    }


def _event_label(kind: str, detail: str | None) -> str:
    base = {
        "CREATED": "action ouverte", "STATUS:EN_COURS": "démarrée", "STATUS:A_VERIFIER": "déclarée réalisée",
        "STATUS:CLOTUREE": "clôturée", "STATUS:ANNULEE": "annulée", "VERIFICATION_REQUESTED": "vérification demandée au moteur",
    }.get(kind, kind.lower())
    return f"{base} ({detail})" if detail else base
