"""Carnet d'audit : une fiche par indicateur, prête à présenter à l'auditeur.

Pour chaque indicateur de la version en vigueur : textes officiels (énoncé, exemples de preuves,
non-conformité, obligations spécifiques, sous-traitance), état calculé, preuves réellement réunies,
écarts ouverts et actions correctives. Quand une version plus récente est importée mais pas encore en
vigueur, la fiche dit ce qui change et à partir de quand (texte officiel de la nouvelle version).

Rien n'est ajouté aux textes : un conseil ou une bonne pratique n'y figure jamais comme une exigence.
"""

from __future__ import annotations

import difflib
import re
from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.qualiopi.capa.models import CapaAction
from app.qualiopi.capa.policy import STATUS_LABELS
from app.qualiopi.evaluation.models import Finding
from app.qualiopi.evaluation.service import indicator_readiness
from app.qualiopi.evidence.models import USABLE_STATUSES, Evidence, EvidenceIndicatorLink
from app.qualiopi.labels import evidence_label
from app.qualiopi.referential.models import ReferentialVersion
from app.training import models as t

EVIDENCE_PER_FICHE = 8
GUIDE_SECTIONS = ("Niveau attendu", "Exemples de preuves", "Non-conformité", "Obligations spécifiques", "Sous-traitance")


def _norm(text: str) -> str:
    return re.sub(r"[\s’']+", " ", text).strip().lower()


def _diff(old: str, new: str) -> tuple[list[dict], int]:
    """Nouveau texte découpé en segments, les ajouts marqués ; et le nombre de mots ajoutés ou changés."""
    a, b = old.split(), new.split()
    key = lambda w: w.replace("’", "'").lower().strip(".,;:()")  # noqa: E731
    segments: list[dict] = []
    changed = 0
    for op, _, _, j1, j2 in difflib.SequenceMatcher(None, [key(w) for w in a], [key(w) for w in b], autojunk=False).get_opcodes():
        if j1 == j2:
            continue
        added = op in ("insert", "replace")
        changed += (j2 - j1) if added else 0
        text = " ".join(b[j1:j2])
        if segments and segments[-1]["ajout"] == added:
            segments[-1]["texte"] += " " + text
        else:
            segments.append({"texte": text, "ajout": added})
    return segments, changed


# Au-delà de ce nombre de mots ajoutés ou changés, le fond de l'exigence évolue (sinon : rédaction ajustée).
SUBSTANTIVE_WORDS = 5


def upcoming_version(db: Session, active: ReferentialVersion, today: date) -> ReferentialVersion | None:
    return db.scalar(select(ReferentialVersion).where(
        ReferentialVersion.code == active.code, ReferentialVersion.is_active.is_(False),
        ReferentialVersion.effective_from > today).order_by(ReferentialVersion.effective_from))


def _in_session(s: t.TrainingSession, *, session_id: str | None, scope: str, program_id: str | None = None,
                trainer_id: str | None = None) -> bool:
    """Élément à présenter pour l'audit de cette session : le sien, celui de sa formation, de son formateur,
    ou celui de l'organisme (hérité)."""
    return (session_id == s.id or scope == "ORGANISME"
            or (scope == "FORMATION" and program_id == s.program_id)
            or (scope == "FORMATEUR" and trainer_id is not None and trainer_id == s.trainer_id))


def carnet(db: Session, active: ReferentialVersion, today: date | None = None,
           session: t.TrainingSession | None = None) -> dict:
    """Carnet de l'organisme ; avec `session`, celui de l'audit d'une session (ses éléments et ceux hérités
    de sa formation, de son formateur et de l'organisme)."""
    today = today or date.today()
    readiness = {r["number"]: r for r in indicator_readiness(db, active, session=session)}
    criteria = {c.number: c.title for c in active.criteria}
    upcoming = upcoming_version(db, active, today)
    next_by_number = {i.number: i for i in upcoming.indicators} if upcoming else {}

    evidence: dict[int, list[Evidence]] = defaultdict(list)
    rows = db.execute(
        select(EvidenceIndicatorLink.indicator_number, Evidence)
        .join(Evidence, Evidence.id == EvidenceIndicatorLink.evidence_id)
        .where(EvidenceIndicatorLink.version_id == active.id, EvidenceIndicatorLink.status == "ACTIF",
               Evidence.status != "RETIREE")
        .order_by(Evidence.produced_on.desc().nullslast(), Evidence.reference.desc()))
    for number, ev in rows:
        if session is None or _in_session(session, session_id=ev.session_id, scope=ev.scope,
                                          program_id=ev.program_id, trainer_id=ev.trainer_id):
            evidence[number].append(ev)

    findings: dict[int, list[Finding]] = defaultdict(list)
    open_findings = list(db.scalars(select(Finding).where(Finding.status.in_(("OUVERT", "EN_TRAITEMENT")))
                                    .order_by(Finding.first_seen_at)))
    if session is not None:
        open_findings = [f for f in open_findings if _in_session(
            session, session_id=f.session_id, scope=f.target_type,
            program_id=f.target_id if f.target_type == "FORMATION" else None,
            trainer_id=f.target_id if f.target_type == "FORMATEUR" else None)]
    for f in open_findings:
        findings[f.indicator_number].append(f)
    capas: dict[str, list[CapaAction]] = defaultdict(list)
    if open_findings:
        for a in db.scalars(select(CapaAction).where(CapaAction.finding_id.in_([f.id for f in open_findings]))):
            capas[a.finding_id].append(a)

    fiches = []
    for ind in active.indicators:
        texts = {x.section: x.body for x in ind.texts}
        r = readiness[ind.number]
        evs = evidence.get(ind.number, [])
        change = None
        nxt = next_by_number.get(ind.number)
        if nxt is not None:
            new_text = next((x.body for x in nxt.texts if x.section == "Énoncé"), "")
            if _norm(new_text) != _norm(texts.get("Énoncé", "")):
                segments, changed = _diff(texts.get("Énoncé", ""), new_text)
                change = {"type": "MODIFIE", "enonce": new_text, "segments": segments,
                          "ampleur": "FOND" if changed >= SUBSTANTIVE_WORDS else "REDACTION",
                          "prestations": next((x.body for x in nxt.texts if x.section == "Prestations concernées"), None)}
        fiches.append({
            "numero": ind.number, "code": ind.code, "titre": ind.title,
            "critere": {"numero": ind.criterion_number, "titre": criteria.get(ind.criterion_number)},
            "enonce": texts.get("Énoncé", ""),
            "guide": [{"section": s, "texte": texts[s]} for s in GUIDE_SECTIONS if texts.get(s)],
            "ponderation": ind.ponderation or None, "nouvel_entrant_adapte": ind.new_entrant_adapted,
            "etat": r["status"], "revue_humaine": r["revue_humaine"]["state"],
            "preuves_attendues": [{
                "type": e["type"], "libelle": evidence_label(e["type"]),
                "disponibles": sum(1 for ev in evs if ev.evidence_type == e["type"] and ev.status in USABLE_STATUSES),
            } for e in ind.expected_evidence],
            "preuves": {
                "total": len(evs),
                "exploitables": sum(1 for ev in evs if ev.status in USABLE_STATUSES),
                "liste": [{
                    "id": ev.id, "reference": ev.reference, "libelle": ev.label, "type": evidence_label(ev.evidence_type),
                    "statut": ev.status, "produite_le": ev.produced_on.isoformat() if ev.produced_on else None,
                    "document_id": ev.document_id,
                } for ev in evs[:EVIDENCE_PER_FICHE]],
            },
            "ecarts": [{
                "id": f.id, "reference": f.reference, "titre": f.title, "gravite": f.severity, "statut": f.status,
                "actions": [{"id": a.id, "reference": a.reference, "statut": a.status,
                             "statut_libelle": STATUS_LABELS[a.status], "echeance": a.due_on.isoformat()}
                            for a in capas.get(f.id, [])],
            } for f in findings.get(ind.number, [])],
            "evolution": change,
        })
    if upcoming is not None:
        current = {i.number for i in active.indicators}
        for nxt in upcoming.indicators:
            if nxt.number not in current:
                texts = {x.section: x.body for x in nxt.texts}
                fiches.append({
                    "numero": nxt.number, "code": nxt.code, "titre": nxt.title,
                    "critere": {"numero": nxt.criterion_number,
                                "titre": next((c.title for c in upcoming.criteria if c.number == nxt.criterion_number), None)},
                    "enonce": "", "guide": [], "ponderation": None, "nouvel_entrant_adapte": False,
                    "etat": "A_VENIR", "revue_humaine": None, "preuves_attendues": [],
                    "preuves": {"total": 0, "exploitables": 0, "liste": []}, "ecarts": [],
                    "evolution": {"type": "NOUVEAU", "enonce": texts.get("Énoncé", ""),
                                  "prestations": texts.get("Prestations concernées")},
                })

    org = db.scalar(select(t.Organization))
    return {
        "organisme": {"nom": org.name, "nda": org.nda_number, "siret": org.siret,
                      "categories": org.action_categories, "nouvel_entrant": org.is_new_entrant} if org else None,
        "referentiel": {"version": active.version, "en_vigueur_le": active.effective_from.isoformat(),
                        "source": active.source_label},
        "prochaine_version": {"version": upcoming.version, "en_vigueur_le": upcoming.effective_from.isoformat(),
                              "source": upcoming.source_label} if upcoming else None,
        "session": {"id": session.id, "reference": session.reference,
                    "formation": session.program.title if session.program else None,
                    "debut": session.start_date.isoformat(), "fin": session.end_date.isoformat()} if session else None,
        "edite_le": today.isoformat(),
        "fiches": fiches,
        "avertissement": "État de préparation calculé à partir des preuves disponibles. Ne constitue pas une décision "
                         "de conformité : seul l'organisme certificateur en décide. Textes : référentiel national "
                         "qualité et son guide de lecture, seuls à faire foi.",
    }
