"""Import de l'offre de Form'SSI reprise de GSMS School (config/catalogue/gsms-school.yaml).

Formations, lieux et équipements. Idempotent et prudent, comme app.application.service.edof.formssi : une valeur déjà saisie
n'est jamais remplacée, tout ce qui est créé garde sa source, et les lieux et équipements arrivent
« à vérifier sur place » : une donnée d'amorçage ne prouve pas qu'une salle ou un mannequin existe.
Une formation déjà importée n'est que complétée, sur les rubriques encore vides (COMPLETABLE).
"""

from __future__ import annotations

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

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
                report.append(f"Formation {f['code']} déjà présente : non modifiée")
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
