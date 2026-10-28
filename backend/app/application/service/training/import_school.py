"""Import de l'offre de Form'SSI reprise de GSMS School (config/catalogue/gsms-school.yaml).

Formations, lieux et équipements. Idempotent et prudent, comme app.application.service.edof.formssi : une valeur déjà saisie
n'est jamais remplacée, tout ce qui est créé garde sa source, et les lieux et équipements arrivent
« à vérifier sur place » : une donnée d'amorçage ne prouve pas qu'une salle ou un mannequin existe.
Une formation déjà importée n'est que complétée, sur les rubriques encore vides (COMPLETABLE).
Les compléments relevés sur la landing (complements_landing) complètent aussi une formation d'une autre origine
(TFP APS), sur LANDING_FIELDS seulement ; un texte de remplissage (FILLER) n'est jamais repris.
Enfin, la rédaction GSMS (DRAFTS) remplit objectifs, compétences, évaluation, moyens et détail vide des modules (« à relire »).
"""

from __future__ import annotations

import re

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.training.images import complete_program_images
from app.config.config import BACKEND_DIR
from app.types import training as t

CATALOGUE = BACKEND_DIR / "config" / "catalogue" / "gsms-school.yaml"

LMS_RESOURCES = (
    ("Cours en ligne (LMS GSMS School)", "COURS", "Un chapitre par module",
     "Chapitres générés automatiquement à l'amorçage du LMS à partir des intitulés de modules (vidéo de remplissage, "
     "synthèse générique) : à rédiger par un formateur."),
    ("Quiz de fin de module (LMS GSMS School)", "QUIZ", "Activités quiz du cours",
     "Deux questions génériques par module produites automatiquement : elles ne constituent pas une évaluation des acquis."),
)


# Rubriques ajoutées au fichier après un premier import : remplies seulement si elles sont encore vides.
COMPLETABLE = {"track": "filière", "pathway": "parcours", "skills": "compétences visées",
               "evaluation_steps": "épreuves d'évaluation"}


# Rubriques que la landing peut compléter quand elles sont vides.
LANDING_FIELDS = {"modules": "modules", "teaching_methods": "méthodes pédagogiques", "prerequisites": "prérequis",
                  "audience": "public visé", "content": "description", "outcomes": "débouchés",
                  "trainees_min": "effectif minimum", "trainees_max": "effectif maximum",
                  "access_conditions": "conditions d'accès", "badge": "badge"}

# Rubriques rédigées par GSMS d'après les textes officiels (config/catalogue/redaction-gsms.yaml), là où ni la vitrine
# ni la landing ne disent rien : remplies seulement si elles sont vides, chacune avec sa note « à relire ».
DRAFTS = BACKEND_DIR / "config" / "catalogue" / "redaction-gsms.yaml"
DRAFT_FIELDS = {"objectives": "objectifs", "skills": "compétences visées", "evaluation_methods": "modalités d'évaluation",
                "teaching_means": "moyens pédagogiques et techniques"}
# Textes génériques des fiches de la landing, identiques d'une formation à l'autre : aucune information réelle.
FILLER = re.compile(
    r"^Approfondissement des objectifs du module|^Conformité avec le référentiel et les objectifs pédagogiques"
    r"|conformes? aux exigences du organisme|pièces et niveau demandés au bulletin d'inscription"
    r"|^Compréhension et expression adaptées aux mises en situation|^Assiduité, posture professionnelle et respect"
    r"|ou dérogation conforme au référentiel|^Bloc \d+$",
    re.IGNORECASE,
)


def is_filler(text: str) -> bool:
    return bool(FILLER.search(text.strip()))


def without_filler(key: str, value: object) -> object:
    """Retire d'une valeur de la landing tout texte de remplissage ; rend None s'il ne reste rien."""
    if key == "modules":
        kept = [{**m, "details": [d for d in m.get("details") or [] if not is_filler(d)]}
                for m in value or [] if not is_filler(m["title"])]
        return kept or None
    if isinstance(value, list):
        return [v for v in value if not (isinstance(v, str) and is_filler(v))] or None
    if not isinstance(value, str):
        return value or None
    return None if not value or is_filler(value) else value


def load() -> dict:
    return yaml.safe_load(CATALOGUE.read_text(encoding="utf-8"))


def import_gsms_school(db: Session, actor: str = "import GSMS School") -> dict:
    data = load()
    sources = data["sources"]
    report: list[str] = [f"Formation {n['catalog_slug']} non importée : {n['raison']}" for n in data["non_importees"]]

    created: list[str] = []
    completed: list[str] = []
    for f in data["formations"]:
        notes = [{**n, "source": sources.get(n["source"], n["source"])} for n in f["review_notes"]]
        existing = db.scalar(select(t.Program).where(t.Program.catalog_slug == f["catalog_slug"]))
        if existing:
            filled = [label for key, label in COMPLETABLE.items() if f.get(key) and not getattr(existing, key)]
            for key, label in COMPLETABLE.items():
                if label in filled:
                    setattr(existing, key, f[key])
            known = {(n.get("champ"), n.get("message")) for n in existing.review_notes or []}
            added = [n for n in notes if n["champ"] in COMPLETABLE and (n["champ"], n["message"]) not in known]
            if added:
                existing.review_notes = [*(existing.review_notes or []), *added]
            if filled or added:
                completed.append(existing.code)
                report.append(f"Formation {existing.code} complétée : {', '.join(filled) or 'points à arbitrer'}")
            else:
                report.append(f"Formation {f['code']} déjà présente : rien à compléter depuis la fiche vitrine")
            continue
        if db.scalar(select(t.Program).where(t.Program.code == f["code"])):
            report.append(f"Code {f['code']} déjà utilisé par une autre formation : import ignoré")
            continue
        p = t.Program(
            code=f["code"], title=f["title"], action_category="AF", catalog_slug=f["catalog_slug"],
            audience=f["audience"], delivery_mode=f["delivery_mode"], prerequisites=f["prerequisites"],
            content=f["content"], teaching_methods=f["teaching_methods"], evaluation_methods=f["evaluation_methods"],
            duration_hours=f["duration_hours"], price_eur=f["price_eur"], modules=f["modules"], review_notes=notes,
            objectives=[], skills=f.get("skills") or [], track=f.get("track"), pathway=f.get("pathway"),
            evaluation_steps=f.get("evaluation_steps") or [], created_by=actor,
        )
        db.add(p)
        db.flush()
        for title, kind, ref, note in LMS_RESOURCES:
            db.add(t.ProgramResource(program_id=p.id, title=title, kind=kind, origin="GSMS_SCHOOL",
                                     source_ref=f"Cours lms-{f['catalog_slug']} — {ref}", rights="PROPRIETAIRE",
                                     status="A_REDIGER", note=note, created_by=actor))
        created.append(p.code)

    for code in [*complete_from_landing(db, data, report), *complete_from_drafts(db, report)]:
        if code not in completed and code not in created:
            completed.append(code)
    for code in complete_program_images(db, [f["code"] for f in data["formations"]]):
        report.append(f"Formation {code} : vignette ajoutée")

    premises = {r.code: r for r in db.scalars(select(t.Premises))}
    places: list[str] = []
    for lieu in data["locaux"]:
        if lieu["code"] in premises:
            report.append(f"Lieu {lieu['code']} déjà présent : non modifié")
            continue
        parent = premises.get(lieu["parent"]) if lieu["parent"] else None
        p = t.Premises(code=lieu["code"], name=lieu["name"], kind=lieu["kind"], parent_id=parent.id if parent else None,
                       address=lieu["address"], floor=lieu["floor"], capacity=lieu["capacity"], note=lieu["note"],
                       source=sources["school_lieux"], status="A_VERIFIER", created_by=actor)
        db.add(p)
        db.flush()
        premises[p.code] = p
        places.append(p.code)

    known = set(db.scalars(select(t.Equipment.code)))
    equipment = 0
    for e in data["equipements"]:
        if e["code"] in known:
            report.append(f"Équipement {e['code']} déjà présent : non modifié")
            continue
        where = premises.get(e["location"])
        db.add(t.Equipment(code=e["code"], label=e["label"], category=e["category"], quantity=e["quantity"],
                           premises_id=where.id if where else None, regulatory_ref=e["regulatory_ref"],
                           source=sources["school_inventaire"], status="A_VERIFIER", created_by=actor))
        equipment += 1
    db.flush()
    return {"formations": created, "completees": completed, "lieux": places, "equipements": equipment, "report": report, "releve_le": data["releve_le"]}


def complete_from_landing(db: Session, data: dict, report: list[str]) -> list[str]:
    """Remplit les rubriques vides depuis complements_landing et ajoute les points à relire ; ne remplace rien."""
    source = data["sources"]["landing_fiches"]
    touched: list[str] = []
    for c in data.get("complements_landing") or []:
        p = db.scalar(select(t.Program).where(t.Program.catalog_slug == c["catalog_slug"]))
        if p is None:
            continue
        filled = []
        for key in LANDING_FIELDS:
            value = without_filler(key, c.get(key))
            if value and not getattr(p, key):
                setattr(p, key, value)
                filled.append(key)
        known = {(n.get("champ"), n.get("message")) for n in p.review_notes or []}
        # La note « à relire » d'une valeur fournie ne vaut que si la valeur a été reprise ; un écart vaut toujours.
        added = [{**n, "source": source} for n in c.get("review_notes") or []
                 if (n["champ"], n["message"]) not in known and (n["champ"] not in c or n["champ"] in filled)]
        if added:
            p.review_notes = [*(p.review_notes or []), *added]
        if filled or added:
            touched.append(p.code)
            what = ", ".join(LANDING_FIELDS[k] for k in filled) or "points à arbitrer"
            report.append(f"Formation {p.code} complétée par la landing : {what}")
    db.flush()
    return touched


def load_drafts() -> dict:
    return yaml.safe_load(DRAFTS.read_text(encoding="utf-8"))


def complete_from_drafts(db: Session, report: list[str]) -> list[str]:
    """Remplit les rubriques vides et le détail vide des modules depuis la rédaction GSMS ; ne remplace rien."""
    data = load_drafts()
    touched: list[str] = []
    for d in data["formations"]:
        p = db.scalar(select(t.Program).where(t.Program.catalog_slug == d["catalog_slug"]))
        if p is None:
            continue
        filled = [key for key in DRAFT_FIELDS if d.get(key) and not getattr(p, key)]
        for key in filled:
            setattr(p, key, d[key])
        details = d.get("module_details") or {}
        modules = [{**m, "details": details[m["code"]]} if not m.get("details") and m.get("code") in details else m
                   for m in p.modules or []]
        if modules != (p.modules or []):
            p.modules = modules
            filled.append("modules")
        known = {(n.get("champ"), n.get("message")) for n in p.review_notes or []}
        notes = [{"champ": key, "message": f"Rédigé par GSMS d'après {d['textes']} : à relire et à valider par le "
                  "responsable pédagogique avant publication.", "source": data["source"]} for key in filled]
        added = [n for n in notes if (n["champ"], n["message"]) not in known]
        if added:
            p.review_notes = [*(p.review_notes or []), *added]
        if filled:
            touched.append(p.code)
            labels = {**DRAFT_FIELDS, "modules": "détail des modules"}
            report.append(f"Formation {p.code} complétée par la rédaction GSMS : {', '.join(labels[k] for k in filled)}")
    db.flush()
    return touched
