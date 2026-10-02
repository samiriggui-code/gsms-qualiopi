"""Fiche formation unique : instantané, validation en versions figées, programme rédigé, aperçu public.

La fiche (programme + certification + intervenants + contenus) est la seule saisie. Le programme
téléchargeable, l'aperçu du catalogue et le dossier EDOF sont lus dans une **version validée**, jamais
dans la fiche en cours d'édition : une modification ne réécrit rien de ce qui a déjà été émis ou déposé.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.config import BACKEND_DIR
from app.core.db import utcnow
from app.core.errors import NotFoundError
from app.events.publish import publish
from app.platform.decisions import Decision, deny, enforce
from app.training import models as t

TEMPLATES_DIR = BACKEND_DIR / "config" / "documents_generes"
_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=select_autoescape(["html"]),
                   undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)

DELIVERY_LABELS = {"PRESENTIEL": "En présentiel", "DISTANCE": "À distance", "MIXTE": "Mixte (présentiel et distance)"}
ROLE_LABELS = {"FORMATEUR": "Formateur", "EVALUATEUR": "Évaluateur", "RESPONSABLE_PEDAGOGIQUE": "Responsable pédagogique"}

# Rubriques de la fiche : (champ, libellé, message de l'anomalie si vide). Sert aux contrôles et à la validation.
REQUIRED_FIELDS = (
    ("objectives", "Objectifs", "Objectifs manquants"),
    ("skills", "Compétences visées", "Compétences visées manquantes"),
    ("audience", "Public visé", "Public visé manquant"),
    ("prerequisites", "Prérequis", "Prérequis manquants (indiquer « Aucun » s'il n'y en a pas)"),
    ("duration_hours", "Durée", "Durée manquante"),
    ("delivery_mode", "Modalité", "Modalité (présentiel, distance, mixte) manquante"),
    ("modules", "Contenu", "Contenu détaillé (modules) manquant"),
    ("teaching_methods", "Méthodes pédagogiques", "Méthodes pédagogiques manquantes"),
    ("teaching_means", "Moyens pédagogiques et techniques", "Moyens pédagogiques et techniques manquants"),
    ("accessibility_info", "Accessibilité", "Accessibilité aux personnes en situation de handicap non renseignée"),
    ("evaluation_methods", "Modalités d'évaluation", "Modalités d'évaluation manquantes"),
    ("access_delay", "Délai d'accès", "Délai d'accès manquant"),
    ("price_eur", "Tarif", "Tarif manquant"),
)


def _num(v: Decimal | None) -> float | None:
    return float(v) if v is not None else None


def get_program(db: Session, program_id: str) -> t.Program:
    p = db.get(t.Program, program_id)
    if p is None:
        raise NotFoundError("Formation introuvable")
    return p


def certification_of(db: Session, program_id: str) -> t.ProgramCertification | None:
    return db.scalar(select(t.ProgramCertification).where(t.ProgramCertification.program_id == program_id))


def trainers_of(db: Session, program_id: str) -> list[tuple[t.ProgramTrainer, t.Trainer]]:
    rows = db.execute(select(t.ProgramTrainer, t.Trainer).join(t.Trainer, t.Trainer.id == t.ProgramTrainer.trainer_id)
                      .where(t.ProgramTrainer.program_id == program_id)
                      .order_by(t.Trainer.last_name, t.Trainer.first_name)).all()
    return [(r[0], r[1]) for r in rows]


def resources_of(db: Session, program_id: str) -> list[t.ProgramResource]:
    return list(db.scalars(select(t.ProgramResource).where(t.ProgramResource.program_id == program_id)
                           .order_by(t.ProgramResource.module_code, t.ProgramResource.title)))


def missing_fields(p: t.Program) -> list[tuple[str, str, str]]:
    out = []
    for field, label, message in REQUIRED_FIELDS:
        value = getattr(p, field)
        if value is None or value == "" or value == []:
            out.append((field, label, message))
    if not p.modules and p.content:
        out = [m for m in out if m[0] != "modules"]  # un contenu rédigé tient lieu de modules
    return out


def snapshot(db: Session, p: t.Program) -> dict:
    """Ce que dit la fiche aujourd'hui, sous une forme stable (même contenu = même empreinte)."""
    cert = certification_of(db, p.id)
    org = db.scalar(select(t.Organization))
    return {
        "organisme": {"nom": org.name if org else None, "siret": org.siret if org else None,
                      "nda": org.nda_number if org else None},
        "formation": {
            "code": p.code, "intitule": p.title, "categorie": p.action_category,
            "duree_heures": _num(p.duration_hours), "tarif_eur": _num(p.price_eur),
            "public": p.audience, "competences": list(p.skills or []), "objectifs": list(p.objectives or []),
            "prerequis": list(p.prerequisites or []), "modalite": p.delivery_mode,
            "modules": list(p.modules or []), "contenu": p.content,
            "methodes": p.teaching_methods, "moyens": p.teaching_means, "evaluation": p.evaluation_methods,
            "delai_acces": p.access_delay, "accessibilite": p.accessibility_info,
            "adequation_certification": p.certification_alignment,
        },
        "certification": None if cert is None else {
            "fondement": cert.basis, "code": cert.code, "intitule": cert.title, "certificateur": cert.certifier,
            "echeance_enregistrement": cert.registration_end.isoformat() if cert.registration_end else None,
            "habilitation": cert.habilitation, "evaluateur": cert.evaluator_name,
            "correspondance": list(cert.competence_mapping or []),
        },
        "intervenants": [{"nom": tr.full_name, "role": pt.role, "modules": list(pt.modules or [])}
                         for pt, tr in trainers_of(db, p.id)],
        "contenus": [{"titre": r.title, "type": r.kind, "module": r.module_code, "origine": r.origin,
                      "droits": r.rights, "statut": r.status} for r in resources_of(db, p.id)],
    }


def digest(data: dict) -> str:
    """Empreinte du contenu pédagogique. L'en-tête de l'organisme (nom, SIRET, NDA) est figé dans la
    version mais n'en fait pas partie : renseigner le NDA ne doit pas invalider tous les programmes."""
    content = {k: v for k, v in data.items() if k != "organisme"}
    return hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def latest_version(db: Session, program_id: str) -> t.ProgramVersion | None:
    return db.scalar(select(t.ProgramVersion).where(t.ProgramVersion.program_id == program_id)
                     .order_by(t.ProgramVersion.version.desc()).limit(1))


def version_state(db: Session, p: t.Program) -> dict:
    """VALIDEE (la fiche est celle de la dernière version), MODIFIEE (changée depuis) ou JAMAIS_VALIDEE."""
    last = latest_version(db, p.id)
    if last is None:
        return {"state": "JAMAIS_VALIDEE", "version": None}
    current = digest(snapshot(db, p))
    return {"state": "VALIDEE" if current == last.sha256 else "MODIFIEE", "version": last.version,
            "version_id": last.id, "validated_by": last.validated_by, "validated_at": last.validated_at.isoformat()}


def can_validate(db: Session, p: t.Program) -> Decision:
    missing = missing_fields(p)
    if missing:
        return deny("FICHE_INCOMPLETE", "La fiche n'est pas complète : la validation figerait un programme incomplet.",
                    [m[2] for m in missing])
    if not trainers_of(db, p.id):
        return deny("FICHE_SANS_INTERVENANT", "Associez au moins un intervenant avant de valider le programme.")
    state = version_state(db, p)
    if state["state"] == "VALIDEE":
        return deny("DEJA_VALIDEE", f"La fiche n'a pas changé depuis la version {state['version']}.")
    return Decision(True)


def validate_version(db: Session, p: t.Program, user: User, note: str | None = None) -> t.ProgramVersion:
    enforce(can_validate(db, p))
    data = snapshot(db, p)
    number = (db.scalar(select(func.max(t.ProgramVersion.version)).where(t.ProgramVersion.program_id == p.id)) or 0) + 1
    v = t.ProgramVersion(program_id=p.id, version=number, snapshot=data, sha256=digest(data),
                         validated_by=user.full_name, validated_at=utcnow(), note=note, created_by=user.full_name)
    db.add(v)
    db.flush()
    publish(db, "program.version_validated", "program_version", v.id, program_id=p.id, actor_id=user.id,
            payload={"version": number, "sha256": v.sha256})
    return v


def render_programme(v: t.ProgramVersion, today: date | None = None) -> str:
    """Programme de formation rédigé depuis une version validée (jamais depuis la fiche en cours)."""
    s = v.snapshot
    f = s["formation"]
    return _env.get_template("programme.html").render(
        organisme=s["organisme"], formation=f, certification=s["certification"], intervenants=s["intervenants"],
        modalite=DELIVERY_LABELS.get(f["modalite"] or "", f["modalite"] or "Non précisée"), roles=ROLE_LABELS,
        version=v.version, valide_par=v.validated_by, valide_le=v.validated_at.strftime("%d/%m/%Y"),
        empreinte=v.sha256, edite_le=(today or date.today()).strftime("%d/%m/%Y"),
    )


def public_preview(v: t.ProgramVersion) -> dict:
    """Ce que montrerait une fiche du catalogue public : uniquement des informations de la version validée."""
    s = v.snapshot
    f = s["formation"]
    cert = s["certification"] or {}
    return {
        "version": v.version,
        "intitule": f["intitule"], "code": f["code"], "public": f["public"], "objectifs": f["objectifs"],
        "competences": f["competences"], "prerequis": f["prerequis"], "duree_heures": f["duree_heures"],
        "modalite": DELIVERY_LABELS.get(f["modalite"] or "", None), "modules": f["modules"],
        "methodes": f["methodes"], "moyens": f["moyens"], "evaluation": f["evaluation"],
        "delai_acces": f["delai_acces"], "accessibilite": f["accessibilite"], "tarif_eur": f["tarif_eur"],
        "certification": {"code": cert.get("code"), "intitule": cert.get("intitule"),
                          "certificateur": cert.get("certificateur")} if cert.get("code") else None,
        # Le badge CPF ne s'affiche que si une personne a constaté la publication de l'offre sur EDOF.
        "mention_cpf": None,
    }
