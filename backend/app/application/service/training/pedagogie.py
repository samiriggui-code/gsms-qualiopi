"""Import d'un dossier pédagogique (pedagogie/<formation>/) en ressources de la formation.

Chaque fichier Markdown ou YAML devient une ressource : titre, type, module, fichier dans le stockage de GSMS (empreinte).
Les contenus arrivent en « Brouillon », droits « Propriétaire » (rédigés pour l'organisme) : un formateur les relit et
les valide dans la fiche. Idempotent : un fichier déjà importé n'est mis à jour que si son contenu a changé, et une
ressource validée dont le fichier change repasse en brouillon. Les sources brutes (06-ressources-sources) et les
outils ne sont jamais importés : anciens supports d'un autre organisme, données nominatives possibles.
"""

from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.documents import storage
from app.errors.errors import NotFoundError
from app.types import training as t

# Sous-dossier → type de ressource ; un dossier absent de la table n'est pas importé.
FOLDER_KINDS = {
    "00-referentiel": "SUPPORT",
    "01-cours-initial": "COURS",
    "02-qcm": "QUIZ",
    "03-evaluation": "EVALUATION",
    "04-qualiopi": "AUTRE",
    "05-mac-aps": "COURS",
}
MIME = {".md": "text/markdown", ".yaml": "application/yaml", ".yml": "application/yaml"}
DRAFT_NOTE = "Brouillon rédigé par IA : à relire et valider par un formateur avant tout usage."
_MODULE = re.compile(r"^([ABM]\d{2})-")


def _title(path: Path, text: str) -> str:
    """Intitulé : module ou titre de l'en-tête, sinon premier titre, sinon nom du fichier."""
    head = text.split("\n---", 1)[0] if text.startswith("---") else ""
    for key in ("module", "titre"):
        m = re.search(rf'^{key}:\s*"?(.+?)"?\s*$', head, re.M)
        if m:
            return m.group(1)
    m = re.search(r"^# (.+)$", text, re.M)
    return (m.group(1) if m else path.stem.replace("-", " ")).strip()


def import_pedagogie(db: Session, slug: str, root: Path, actor: str = "import pédagogie") -> dict:
    program = db.scalar(select(t.Program).where(t.Program.catalog_slug == slug))
    if program is None:
        raise NotFoundError(f"Aucune formation du catalogue « {slug} »")
    existing = {r.source_ref: r for r in db.scalars(
        select(t.ProgramResource).where(t.ProgramResource.program_id == program.id))}
    created, updated, unchanged = [], [], 0
    files = [p for folder in FOLDER_KINDS for p in sorted((root / folder).glob("*"))
             if p.is_file() and p.suffix in MIME]
    files += [p for p in (root / "LISEZMOI.md",) if p.is_file()]
    for path in files:
        folder = path.parent.name if path.parent != root else ""
        content = path.read_bytes()
        stored = storage.store_text(content, MIME[path.suffix])
        ref = f"pedagogie/{slug}/{path.relative_to(root).as_posix()}"
        text = content.decode("utf-8")
        module = _MODULE.match(path.name)
        title = _title(path, text)
        if folder == "05-mac-aps":
            title = f"MAC — {title}"
        fields = {"title": title[:250], "kind": FOLDER_KINDS.get(folder, "SUPPORT"),
                  "module_code": module.group(1) if module else None, "file_name": path.name,
                  "mime_type": MIME[path.suffix], "storage_path": stored.relative_path, "sha256": stored.sha256}
        r = existing.get(ref)
        if r is None:
            db.add(t.ProgramResource(program_id=program.id, origin="INTERNE", source_ref=ref, rights="PROPRIETAIRE",
                                     status="BROUILLON", note=DRAFT_NOTE, created_by=actor, **fields))
            created.append(ref)
        elif r.sha256 != stored.sha256:
            for key, value in fields.items():
                setattr(r, key, value)
            if r.status == "VALIDE":
                r.status = "BROUILLON"
                r.note = f"{DRAFT_NOTE} Fichier modifié depuis la validation."
            updated.append(ref)
        else:
            unchanged += 1
    db.flush()
    return {"formation": program.code, "crees": created, "mis_a_jour": updated, "inchanges": unchanged}
