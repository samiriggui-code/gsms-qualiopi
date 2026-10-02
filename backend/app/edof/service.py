"""Dossiers EDOF : création, pièces, cycle de vie, compléments, accompagnement, vues.

Le cycle est déclaratif : GSMS n'a accès à aucun service de dépôt EDOF. Chaque étape externe
(dépôt, demande de compléments, décision) est saisie par une personne, datée et journalisée.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.db import utcnow
from app.core.errors import InvalidStateError, NotFoundError
from app.documents import storage
from app.edof import checks, fiche
from app.edof import models as m
from app.edof.requirements import STAGE_LABELS, load
from app.events.publish import publish
from app.platform.decisions import ALLOW, Decision, deny, enforce
from app.training import models as t

DISPLAY_STATUS = {
    "INCOMPLET": "Dossier incomplet",
    "PRET_VALIDATION_INTERNE": "Prêt pour validation interne",
    "VALIDE_INTERNE": "Validé en interne, à déposer",
    "DEPOSE": "Déposé",
    "COMPLEMENTS_DEMANDES": "Compléments demandés",
    "DECISION_RECUE": "Décision officielle reçue",
}
ACTIONS = {
    "valider": "Valider le dossier en interne",
    "rouvrir": "Rouvrir pour modification",
    "declarer_depot": "Déclarer le dépôt sur EDOF",
    "enregistrer_complements": "Enregistrer une demande de compléments",
    "declarer_complements_transmis": "Déclarer les compléments transmis",
    "enregistrer_decision": "Enregistrer la décision",
}
SUBMITTED = ("DEPOSE", "COMPLEMENTS_DEMANDES", "DECISION_RECUE")


# ── Dossiers ─────────────────────────────────────────────────────────────────────


def organization(db: Session) -> t.Organization:
    org = db.scalar(select(t.Organization))
    if org is None:
        raise NotFoundError("Aucun organisme n'est encore enregistré")
    return org


def establishment(db: Session, org: t.Organization) -> m.Establishment:
    est = db.scalar(select(m.Establishment).where(m.Establishment.organization_id == org.id))
    if est is None:
        est = m.Establishment(organization_id=org.id, legal_name=org.name)
        db.add(est)
        db.flush()
    return est


def establishment_dossier(db: Session, org: t.Organization | None = None) -> m.Dossier:
    org = org or organization(db)
    establishment(db, org)
    d = db.scalar(select(m.Dossier).where(m.Dossier.kind == "ETABLISSEMENT", m.Dossier.organization_id == org.id))
    if d is None:
        d = m.Dossier(kind="ETABLISSEMENT", organization_id=org.id)
        db.add(d)
        db.flush()
    return d


def formation_dossier(db: Session, program_id: str, *, create: bool = False, actor: User | None = None) -> m.Dossier | None:
    d = db.scalar(select(m.Dossier).where(m.Dossier.kind == "FORMATION", m.Dossier.program_id == program_id))
    if d is None and create:
        p = fiche.get_program(db, program_id)
        parent = establishment_dossier(db)
        d = m.Dossier(kind="FORMATION", organization_id=parent.organization_id, program_id=p.id, parent_id=parent.id,
                      created_by=actor.full_name if actor else None)
        db.add(d)
        db.flush()
        publish(db, "edof.dossier_created", "edof_dossier", d.id, program_id=p.id, actor_id=actor.id if actor else None)
    return d


def get_dossier(db: Session, dossier_id: str) -> m.Dossier:
    d = db.get(m.Dossier, dossier_id)
    if d is None:
        raise NotFoundError("Dossier EDOF introuvable")
    return d


def display_status(dossier: m.Dossier, found: list[checks.Anomaly]) -> str:
    if dossier.status != "EN_PREPARATION":
        return dossier.status
    return "INCOMPLET" if any(a.niveau == "BLOQUANT" for a in found) else "PRET_VALIDATION_INTERNE"


# ── Cycle de vie ─────────────────────────────────────────────────────────────────


def capability(db: Session, dossier: m.Dossier, action: str, perms: frozenset[str], today: date) -> Decision:
    """Ce que l'API autorise, avec le motif d'un refus. Le front n'affiche que ce qu'elle décide."""
    write = "edof.write" in perms
    validate = "edof.validate" in perms
    status = dossier.status
    if action == "valider":
        if not validate:
            return deny("PERMISSION", "Permission « valider les dossiers EDOF » requise.")
        if status != "EN_PREPARATION":
            return deny("ETAT", "Seul un dossier en préparation peut être validé.")
        found = checks.anomalies(db, dossier, today)
        blocking = [a.message for a in found if a.niveau == "BLOQUANT"]
        if blocking:
            return deny("DOSSIER_INCOMPLET", "Le dossier est incomplet.", blocking)
        pending = [a.message for a in found if a.niveau == "A_VERIFIER"]
        if pending:
            return deny("VERIFICATIONS_EN_ATTENTE", "Des points doivent encore être vérifiés par une personne.", pending)
        return ALLOW
    if action == "rouvrir":
        if not validate:
            return deny("PERMISSION", "Permission « valider les dossiers EDOF » requise.")
        return ALLOW if status == "VALIDE_INTERNE" else deny("ETAT", "Seul un dossier validé et non déposé se rouvre.")
    if not write:
        return deny("PERMISSION", "Permission « préparer les dossiers EDOF » requise.")
    if action == "declarer_depot":
        if status != "VALIDE_INTERNE":
            return deny("ETAT", "Le dossier doit d'abord être validé en interne.")
        blocking = [a.message for a in checks.anomalies(db, dossier, today) if a.niveau == "BLOQUANT"]
        if blocking:
            return deny("DOSSIER_INCOMPLET", "Le dossier n'est plus complet depuis sa validation.", blocking)
        if dossier.kind == "FORMATION":
            parent = db.get(m.Dossier, dossier.parent_id)
            if parent is None or parent.status not in SUBMITTED:
                return deny("ETABLISSEMENT_NON_DEPOSE",
                            "Le dossier de l'établissement doit être déposé avant l'offre (ou avec elle, en offre témoin).")
            if parent.decision == "REFUSEE":
                return deny("ETABLISSEMENT_REFUSE", "Le référencement de l'établissement a été refusé.")
        return ALLOW
    if action == "enregistrer_complements":
        return ALLOW if status in ("DEPOSE", "COMPLEMENTS_DEMANDES") else deny("ETAT", "Le dossier n'est pas en instruction.")
    if action == "declarer_complements_transmis":
        if status != "COMPLEMENTS_DEMANDES":
            return deny("ETAT", "Aucune demande de compléments en cours.")
        open_items = [c.label for c in dossier.complements if c.status == "DEMANDEE"]
        if open_items:
            return deny("COMPLEMENTS_NON_FOURNIS", "Pièce demandée par la CDC non fournie.", open_items)
        return ALLOW
    if action == "enregistrer_decision":
        return ALLOW if status in ("DEPOSE", "COMPLEMENTS_DEMANDES") else deny("ETAT", "Le dossier n'est pas en instruction.")
    return deny("ACTION_INCONNUE", f"Action inconnue : {action}")


def _freeze(db: Session, dossier: m.Dossier, found: list[checks.Anomaly], today: date) -> dict:
    pieces = []
    for p in checks.current_pieces(dossier).values():
        doc = db.get(t.Document, p.document_id)
        pieces.append({"requirement": p.requirement, "piece_id": p.id, "document_id": doc.id, "version": doc.version,
                       "sha256": doc.sha256, "issued_on": p.issued_on.isoformat() if p.issued_on else None,
                       "valid_until": p.valid_until.isoformat() if p.valid_until else None, "status": p.status})
    snap = {"date": today.isoformat(), "pieces": sorted(pieces, key=lambda x: x["requirement"]),
            "anomalies": [a.to_dict() for a in found], "referentiel": load().version}
    if dossier.kind == "FORMATION":
        v = fiche.latest_version(db, dossier.program_id)
        snap["programme"] = {"version_id": v.id, "version": v.version, "sha256": v.sha256} if v else None
        dossier.program_version_id = v.id if v else None
    return snap


def transition(db: Session, dossier: m.Dossier, action: str, user: User, perms: frozenset[str], body: dict,
               today: date | None = None) -> m.Dossier:
    today = today or date.today()
    enforce(capability(db, dossier, action, perms, today))
    previous = dossier.status
    if action == "valider":
        dossier.status = "VALIDE_INTERNE"
        dossier.validated_by = user.full_name
        dossier.validated_at = utcnow()
    elif action == "rouvrir":
        dossier.status = "EN_PREPARATION"
        dossier.validated_by = None
        dossier.validated_at = None
    elif action == "declarer_depot":
        submitted_on = body.get("date") or today
        if submitted_on > today:
            raise InvalidStateError("La date de dépôt ne peut pas être dans le futur")
        dossier.submitted_on = submitted_on
        dossier.submitted_by = user.full_name
        dossier.cdc_reference = body.get("reference") or dossier.cdc_reference
        dossier.submission_snapshot = _freeze(db, dossier, checks.anomalies(db, dossier, submitted_on), submitted_on)
        dossier.status = "DEPOSE"
    elif action == "enregistrer_complements":
        items = body.get("items") or []
        if not items:
            raise InvalidStateError("Indiquez au moins une pièce ou information demandée")
        requested_on = body.get("date") or today
        if requested_on > today:
            raise InvalidStateError("La date de la demande ne peut pas être dans le futur")
        refs = {p.code for p in load().pieces}
        rows = []
        for item in items:
            code = item.get("requirement")
            if code and code not in refs:
                raise InvalidStateError(f"Pièce inconnue : {code}")
            label = (item.get("label") or (load().get(code).label if code else "")).strip()[:300]
            if not label:
                raise InvalidStateError("Chaque demande doit avoir un libellé ou une pièce du référentiel")
            rows.append(m.Complement(label=label, requirement=code, requested_on=requested_on,
                                     due_on=item.get("due_on"), created_by=user.full_name))
        dossier.complements.extend(rows)
        dossier.status = "COMPLEMENTS_DEMANDES"
    elif action == "declarer_complements_transmis":
        dossier.status = "DEPOSE"
    elif action == "enregistrer_decision":
        decision = body.get("decision")
        if decision not in m.DECISIONS:
            raise InvalidStateError("Décision attendue : ACCEPTEE ou REFUSEE")
        decided_on = body.get("date")
        if decided_on is None or decided_on > today:
            raise InvalidStateError("Indiquez la date de la décision (pas dans le futur)")
        dossier.decision = decision
        dossier.decision_on = decided_on
        dossier.decision_note = body.get("note")
        dossier.status = "DECISION_RECUE"
    db.flush()
    publish(db, f"edof.{action}", "edof_dossier", dossier.id, program_id=dossier.program_id, actor_id=user.id,
            payload={"from": previous, "to": dossier.status})
    return dossier


# ── Pièces ───────────────────────────────────────────────────────────────────────


def _spec_for(dossier: m.Dossier, requirement: str):  # noqa: ANN202
    spec = load().get(requirement)
    if spec.scope != dossier.kind:
        raise InvalidStateError(f"La pièce {requirement} appartient au dossier {spec.scope.lower()}")
    if spec.generated:
        raise InvalidStateError(f"{spec.label} : produit par GSMS depuis la version validée, pas de dépôt")
    return spec


def _check_editable(dossier: m.Dossier, complement_id: str | None) -> None:
    if dossier.status == "EN_PREPARATION":
        return
    if dossier.status == "COMPLEMENTS_DEMANDES" and complement_id:
        return
    if dossier.status in SUBMITTED and complement_id is None:
        raise InvalidStateError("Dossier déposé : une pièce ne s'ajoute qu'en réponse à une demande de compléments")
    if dossier.status == "VALIDE_INTERNE":
        raise InvalidStateError("Dossier validé : rouvrez-le pour modifier ses pièces")


def _attach(db: Session, dossier: m.Dossier, spec, document: t.Document, *, shared: bool, user: User,  # noqa: ANN001
            meta: dict) -> m.Piece:
    complement_id = meta.get("complement_id")
    if spec.stage != "SUIVI":
        _check_editable(dossier, complement_id)
    if meta.get("siret_on_document") and not meta["siret_on_document"].replace(" ", "").isdigit():
        raise InvalidStateError("SIRET lu sur le document : 14 chiffres attendus")
    previous = checks.current_pieces(dossier).get(spec.code)
    if previous is not None:
        previous.replaced_at = utcnow()
    piece = m.Piece(dossier_id=dossier.id, requirement=spec.code, document_id=document.id, shared=shared,
                    issued_on=meta.get("issued_on"), valid_until=meta.get("valid_until"),
                    siret_on_document=(meta.get("siret_on_document") or "").replace(" ", "") or None,
                    note=meta.get("note"), created_by=user.full_name)
    dossier.pieces.append(piece)
    db.flush()
    if complement_id:
        c = db.get(m.Complement, complement_id)
        if c is None or c.dossier_id != dossier.id:
            raise NotFoundError("Demande de compléments introuvable")
        if c.status != "DEMANDEE":
            raise InvalidStateError("Cette demande n'est plus en attente")
        c.status = "FOURNIE"
        c.piece_id = piece.id
    publish(db, "edof.piece_attached", "edof_piece", piece.id, program_id=dossier.program_id, actor_id=user.id,
            payload={"requirement": spec.code, "document_id": document.id, "shared": shared})
    return piece


def upload_piece(db: Session, dossier: m.Dossier, requirement: str, *, content: bytes, filename: str, mime: str,
                 user: User, perms: frozenset[str], meta: dict) -> m.Piece:
    spec = _spec_for(dossier, requirement)
    if spec.sensitive and "edof.sensitive" not in perms:
        raise InvalidStateError("Pièce sensible : permission « pièces sensibles EDOF » requise")
    stored = storage.store(content, mime)
    previous = checks.current_pieces(dossier).get(spec.code)
    prev_doc = db.get(t.Document, previous.document_id) if previous and not previous.shared else None
    doc = t.Document(
        kind="EDOF_SENSIBLE" if spec.sensitive else "EDOF", title=spec.label, entity_type="EDOF", entity_id=dossier.id,
        program_id=dossier.program_id, version=(prev_doc.version + 1) if prev_doc else 1,
        previous_version_id=prev_doc.id if prev_doc else None, status="EMIS", author_id=user.id,
        mime_type=mime, storage_path=stored.relative_path, sha256=stored.sha256, size_bytes=stored.size,
        original_name=filename[:250], indicator_hints=[], created_by=user.full_name,
    )
    if prev_doc is not None:
        prev_doc.status = "REMPLACE"
    db.add(doc)
    db.flush()
    return _attach(db, dossier, spec, doc, shared=False, user=user, meta=meta)


def link_piece(db: Session, dossier: m.Dossier, requirement: str, document_id: str, *, user: User,
               perms: frozenset[str], meta: dict) -> m.Piece:
    """Rattache un document existant (pièce commune, pièce d'un formateur…) sans le copier."""
    spec = _spec_for(dossier, requirement)
    doc = db.get(t.Document, document_id)
    if doc is None or doc.status == "REMPLACE":
        raise NotFoundError("Document introuvable ou remplacé par une version plus récente")
    if doc.kind == "EDOF_SENSIBLE" and "edof.sensitive" not in perms:
        raise InvalidStateError("Pièce sensible : permission « pièces sensibles EDOF » requise")
    if doc.entity_type == "INSCRIPTION":
        raise InvalidStateError("Un document de stagiaire ne peut pas servir de pièce de référencement")
    return _attach(db, dossier, spec, doc, shared=True, user=user, meta=meta)


def review_piece(db: Session, piece_id: str, *, approve: bool, reason: str | None, user: User) -> m.Piece:
    piece = db.get(m.Piece, piece_id)
    if piece is None or piece.replaced_at is not None:
        raise NotFoundError("Pièce introuvable ou remplacée")
    dossier = piece.dossier
    if dossier.status not in ("EN_PREPARATION", "COMPLEMENTS_DEMANDES", "DEPOSE") and load().get(piece.requirement).stage != "SUIVI":
        raise InvalidStateError("Dossier validé ou clos : rouvrez-le pour revoir ses pièces")
    if not approve and not (reason or "").strip():
        raise InvalidStateError("Indiquez pourquoi la pièce est rejetée")
    piece.status = "VALIDEE" if approve else "REJETEE"
    piece.validated_by = user.full_name
    piece.validated_at = utcnow()
    piece.rejection_reason = None if approve else reason.strip()
    db.flush()
    publish(db, "edof.piece_reviewed", "edof_piece", piece.id, program_id=dossier.program_id, actor_id=user.id,
            payload={"status": piece.status})
    return piece


# ── Accompagnement et compléments ────────────────────────────────────────────────


def add_accompaniment(db: Session, dossier: m.Dossier, body: dict, user: User) -> m.Accompaniment:
    if dossier.kind != "ETABLISSEMENT":
        raise InvalidStateError("L'accompagnement de la CDC se suit sur le dossier de l'établissement")
    if body.get("kind") not in m.ACCOMPANIMENT_KINDS:
        raise InvalidStateError(f"Type attendu : {', '.join(m.ACCOMPANIMENT_KINDS)}")
    a = m.Accompaniment(dossier_id=dossier.id, kind=body["kind"], label=body["label"], planned_on=body.get("planned_on"),
                        done_on=body.get("done_on"), participant=body.get("participant"), note=body.get("note"),
                        created_by=user.full_name)
    db.add(a)
    db.flush()
    return a


def update_accompaniment(db: Session, accompaniment_id: str, body: dict) -> m.Accompaniment:
    a = db.get(m.Accompaniment, accompaniment_id)
    if a is None:
        raise NotFoundError("Suivi introuvable")
    for key in ("label", "planned_on", "done_on", "participant", "note"):
        if key in body:
            setattr(a, key, body[key])
    db.flush()
    return a


def cancel_complement(db: Session, complement_id: str, reason: str, user: User) -> m.Complement:
    c = db.get(m.Complement, complement_id)
    if c is None:
        raise NotFoundError("Demande introuvable")
    if c.status != "DEMANDEE":
        raise InvalidStateError("Cette demande n'est plus en attente")
    if not (reason or "").strip():
        raise InvalidStateError("Indiquez pourquoi la demande est close sans pièce (ex. retirée par la CDC)")
    c.status = "ANNULEE"
    c.note = f"{reason.strip()} ({user.full_name})"
    db.flush()
    return c


# ── Vues ─────────────────────────────────────────────────────────────────────────


def _piece_view(db: Session, piece: m.Piece, sensitive: bool, can_see_sensitive: bool) -> dict:
    doc = db.get(t.Document, piece.document_id)
    hidden = sensitive and not can_see_sensitive
    return {
        "id": piece.id, "status": piece.status, "shared": piece.shared,
        "issued_on": piece.issued_on, "valid_until": piece.valid_until, "siret_on_document": piece.siret_on_document,
        "validated_by": piece.validated_by, "validated_at": piece.validated_at, "rejection_reason": piece.rejection_reason,
        "note": piece.note, "deposited_by": piece.created_by, "deposited_at": piece.created_at,
        "document": None if hidden else {
            "id": doc.id, "name": doc.original_name, "version": doc.version, "sha256": doc.sha256,
            "status": doc.status, "owner": doc.entity_type, "mime": doc.mime_type, "has_file": bool(doc.storage_path),
        },
        "restricted": hidden,
    }


def pieces_view(db: Session, dossier: m.Dossier, found: list[checks.Anomaly], perms: frozenset[str]) -> list[dict]:
    est = db.scalar(select(m.Establishment).where(m.Establishment.organization_id == dossier.organization_id))
    cert = fiche.certification_of(db, dossier.program_id) if dossier.program_id else None
    facts = checks.facts_for(est, cert)
    current = checks.current_pieces(dossier)
    history: dict[str, list[m.Piece]] = {}
    for p in sorted(dossier.pieces, key=lambda x: x.created_at):
        if p.replaced_at is not None:
            history.setdefault(p.requirement, []).append(p)
    by_target: dict[str, list[dict]] = {}
    for a in found:
        if a.cible.get("type") == "piece":
            by_target.setdefault(a.cible["code"], []).append(a.to_dict())
    can_see = "edof.sensitive" in perms
    out = []
    for spec in load().for_scope(dossier.kind):
        applies = spec.applies(facts)
        piece = current.get(spec.code)
        if spec.generated:
            state = "GENEREE"
        elif piece is None:
            state = "NON_APPLICABLE" if applies is False else "A_DETERMINER" if applies is None else "MANQUANTE"
        else:
            state = "REJETEE" if piece.status == "REJETEE" else "VALIDEE" if piece.status == "VALIDEE" else "A_VALIDER"
        if any(x["code"] == "JUSTIFICATIF_EXPIRE" for x in by_target.get(spec.code, [])):
            state = "EXPIREE"
        out.append({
            "code": spec.code, "label": spec.label, "stage": spec.stage, "stage_label": STAGE_LABELS[spec.stage],
            "conditions": spec.conditions_text(), "applies": applies, "group": spec.group,
            "max_age_days": spec.max_age_days, "expires": spec.expires, "siret": spec.siret,
            "sensitive": spec.sensitive, "generated": spec.generated, "provided_by": spec.provided_by,
            "source": load().sources[spec.source], "note": spec.note, "state": state,
            "piece": _piece_view(db, piece, spec.sensitive, can_see) if piece else None,
            "history": [_piece_view(db, h, spec.sensitive, can_see) for h in reversed(history.get(spec.code, []))],
            "anomalies": by_target.get(spec.code, []),
        })
    return out


def dossier_view(db: Session, dossier: m.Dossier, perms: frozenset[str], today: date | None = None) -> dict:
    today = today or date.today()
    found = checks.anomalies(db, dossier, today)
    status = display_status(dossier, found)
    counts = {lvl: sum(1 for a in found if a.niveau == lvl) for lvl in ("BLOQUANT", "A_VERIFIER", "INFO")}
    view = {
        "id": dossier.id, "kind": dossier.kind, "program_id": dossier.program_id, "parent_id": dossier.parent_id,
        "status": dossier.status, "display_status": status, "display_label": DISPLAY_STATUS[status],
        "reminder": "Un dossier complet dans GSMS n'est pas une acceptation : seule la Caisse des Dépôts décide.",
        "validated_by": dossier.validated_by, "validated_at": dossier.validated_at,
        "submitted_on": dossier.submitted_on, "submitted_by": dossier.submitted_by, "cdc_reference": dossier.cdc_reference,
        "decision": dossier.decision, "decision_on": dossier.decision_on, "decision_note": dossier.decision_note,
        "submission_snapshot": dossier.submission_snapshot,
        "anomalies": [a.to_dict() for a in found], "counts": counts,
        "pieces": pieces_view(db, dossier, found, perms),
        "complements": [{"id": c.id, "label": c.label, "requirement": c.requirement, "requested_on": c.requested_on,
                         "due_on": c.due_on, "status": c.status, "piece_id": c.piece_id, "note": c.note}
                        for c in dossier.complements],
        "accompaniments": [{"id": a.id, "kind": a.kind, "label": a.label, "planned_on": a.planned_on,
                            "done_on": a.done_on, "participant": a.participant, "note": a.note}
                           for a in dossier.accompaniments],
        "capabilities": {a: capability(db, dossier, a, perms, today).to_dict() for a in ACTIONS},
        "actions": ACTIONS,
        "referentiel": {"version": load().version, "sources": load().sources},
    }
    if dossier.kind == "FORMATION":
        p = db.get(t.Program, dossier.program_id)
        view["program"] = {"id": p.id, "code": p.code, "title": p.title}
        view["version"] = fiche.version_state(db, p)
        if dossier.program_version_id:
            v = db.get(t.ProgramVersion, dossier.program_version_id)
            view["submitted_version"] = {"id": v.id, "version": v.version, "sha256": v.sha256}
    return view


def establishment_view(db: Session, perms: frozenset[str], today: date | None = None) -> dict:
    org = organization(db)
    dossier = establishment_dossier(db, org)
    est = establishment(db, org)
    formations = []
    for p in db.scalars(select(t.Program).order_by(t.Program.title)):
        d = formation_dossier(db, p.id)
        entry = {"program_id": p.id, "code": p.code, "title": p.title, "dossier": None}
        if d is not None:
            found = checks.anomalies(db, d, today or date.today())
            status = display_status(d, found)
            entry["dossier"] = {"id": d.id, "display_status": status, "display_label": DISPLAY_STATUS[status],
                                "blocking": sum(1 for a in found if a.niveau == "BLOQUANT"),
                                "to_check": sum(1 for a in found if a.niveau == "A_VERIFIER")}
        formations.append(entry)
    return {
        "organization": {"id": org.id, "name": org.name, "siret": org.siret, "nda_number": org.nda_number,
                         "action_categories": org.action_categories},
        "establishment": {c.key: getattr(est, c.key) for c in m.Establishment.__table__.columns
                          if c.key not in ("id", "organization_id", "created_at", "updated_at", "created_by")},
        "dossier": dossier_view(db, dossier, perms, today),
        "formations": formations,
    }


ESTABLISHMENT_FIELDS = {c.key for c in m.Establishment.__table__.columns} - {"id", "organization_id", "created_at",
                                                                            "updated_at", "created_by"}
ORG_FIELDS = {"siret", "nda_number", "action_categories"}
HUMAN_CHECKS = {"identity_checked_on", "nda_checked_on", "qualiopi_checked_on", "obligations_checked_on", "cgu_read_on"}


def update_establishment(db: Session, data: dict, user: User, perms: frozenset[str]) -> None:
    org = organization(db)
    dossier = establishment_dossier(db, org)
    if dossier.status != "EN_PREPARATION":
        raise InvalidStateError("Dossier validé ou déposé : rouvrez-le avant de modifier la situation administrative")
    est = establishment(db, org)
    unknown = set(data) - ESTABLISHMENT_FIELDS - ORG_FIELDS
    if unknown:
        raise InvalidStateError(f"Champs inconnus : {', '.join(sorted(unknown))}")
    if HUMAN_CHECKS & set(data) and "edof.validate" not in perms:
        raise InvalidStateError("Seule une personne habilitée à valider peut attester une vérification")
    for key, label, allowed in (("structure_type", "Type de structure", m.STRUCTURE_TYPES),
                                ("representative_kind", "Nature du représentant", m.REPRESENTATIVE_KINDS),
                                ("efp_connect_status", "Accès EFP Connect", m.EFP_CONNECT_STATUSES)):
        if data.get(key) is not None and data[key] not in allowed:
            raise InvalidStateError(f"{label} : valeurs possibles {', '.join(allowed)}")
    for key, value in data.items():
        if key in ORG_FIELDS:
            setattr(org, key, value)
        else:
            setattr(est, key, value)
    if "efp_connect_status" in data:
        est.efp_connect_updated_on = date.today()
    db.flush()
    publish(db, "edof.establishment_updated", "edof_establishment", est.id, actor_id=user.id,
            payload={"fields": sorted(data)})
