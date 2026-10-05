"""Import des données réelles de Form'SSI (config/edof/formssi.yaml) : première tranche EDOF.

Idempotent et prudent : une valeur déjà saisie dans GSMS n'est jamais remplacée. Une différence entre
la base et la source est rapportée comme un écart à arbitrer.
"""

from __future__ import annotations

import json
from datetime import date

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR
from app.edof import models as m
from app.edof import service
from app.training import models as t

CONFIG_DIR = BACKEND_DIR / "config" / "edof"


def _fill(obj, values: dict, report: list[str], label: str) -> None:  # noqa: ANN001
    for key, value in values.items():
        if value is None:
            continue
        current = getattr(obj, key)
        if current in (None, "", []):
            setattr(obj, key, value)
        elif current != value:
            report.append(f"Écart conservé ({label}.{key}) : GSMS « {current} », source « {value} »")


def import_formssi(db: Session, actor: str = "import Form'SSI") -> dict:
    data = yaml.safe_load((CONFIG_DIR / "formssi.yaml").read_text(encoding="utf-8"))
    sources = data["sources"]
    report: list[str] = []

    org = db.scalar(select(t.Organization))
    if org is None:
        org = t.Organization(name=data["organisme"]["name"], created_by=actor)
        db.add(org)
        db.flush()
        report.append("Organisme créé")
    _fill(org, {"siret": data["organisme"]["siret"], "nda_number": data["organisme"]["nda_number"]}, report, "organisme")

    est = service.establishment(db, org)
    est_data = dict(data["etablissement"])
    est_data["identity_source"] = sources[est_data["identity_source"]]
    _fill(est, est_data, report, "établissement")
    service.establishment_dossier(db, org)

    created = []
    for f in data["formations"]:
        if db.scalar(select(t.Program).where(t.Program.catalog_slug == f["catalog_slug"])):
            report.append(f"Formation {f['code']} déjà présente : non modifiée")
            continue
        if db.scalar(select(t.Program).where(t.Program.code == f["code"])):
            report.append(f"Code {f['code']} déjà utilisé par une autre formation : import ignoré")
            continue
        modules = json.loads((CONFIG_DIR / f["modules_file"]).read_text(encoding="utf-8"))["modules"]
        notes = [{**n, "source": sources.get(n["source"], n["source"])} for n in f["review_notes"]]
        p = t.Program(
            code=f["code"], title=f["title"], action_category=f["action_category"], catalog_slug=f["catalog_slug"],
            audience=f["audience"], delivery_mode=f["delivery_mode"], prerequisites=f["prerequisites"],
            teaching_methods=" ".join(f["teaching_methods"].split()), modules=modules, review_notes=notes,
            objectives=[], skills=[], created_by=actor,
        )
        db.add(p)
        db.flush()
        cert = f["certification"]
        db.add(t.ProgramCertification(program_id=p.id, basis=cert["basis"], habilitation=cert["habilitation"],
                                      other_requirements=cert.get("other_requirements", []), created_by=actor))
        for r in f["resources"]:
            db.add(t.ProgramResource(program_id=p.id, created_by=actor, **r))
        service.formation_dossier(db, p.id, create=True)
        created.append(p.code)
    db.flush()
    return {"organisme": org.name, "formations": created, "report": report, "releve_le": data["releve_le"],
            "dossiers": db.scalar(select(m.Dossier.id).where(m.Dossier.kind == "ETABLISSEMENT")) is not None,
            "date": date.today().isoformat()}
