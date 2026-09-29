"""Import d'une version de référentiel : source Markdown (qualiopi-markdown) + couche normative YAML.

Le parseur est volontairement strict : un indicateur ou une section obligatoire manquant,
une incohérence entre source et normatif, et l'import est refusé.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import yaml
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, DomainError
from app.qualiopi.referential.models import ControlDefinition, Criterion, Indicator, IndicatorText, ReferentialVersion

REQUIRED_SECTIONS = ("Énoncé", "Exemples de preuves", "Non-conformité")
KNOWN_CHECKS = {
    "program_evidence",
    "per_enrollment_evidence",
    "session_evidence",
    "attendance_tracking",
    "org_evidence",
    "trainer_qualification",
    "subcontractors",
    "complaints",
    "procedure_documented",
    "required_documents",
}


class ReferentialImportError(DomainError):
    status_code = 422
    code = "referential_invalid"


@dataclass
class SourceIndicator:
    number: int
    criterion: int
    criterion_title: str
    slug: str
    ponderation: str
    new_entrant: bool
    subcontracting: str
    editorial_note: str | None
    sections: list[tuple[str, str]]
    sha256: str


@dataclass
class ParsedReferential:
    meta: dict
    criteria: dict[int, str]
    source: dict[int, SourceIndicator]
    normative: dict[int, dict]
    new_entrant_control: dict
    source_sha256: str
    normative_sha256: str
    upstream_ref: str | None
    warnings: list[str] = field(default_factory=list)


_FM = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n(.*)$", re.S)


def _parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    m = _FM.match(text)
    if not m:
        raise ReferentialImportError("front-matter YAML manquant")
    data = yaml.safe_load(m.group(1)) or {}
    return {k: ("" if v is None else str(v)) for k, v in data.items()}, m.group(2)


def _sections(body: str) -> list[tuple[str, str]]:
    out: list[tuple[str, list[str]]] = []
    for line in body.splitlines():
        h = re.match(r"^##\s+(.+?)\s*$", line)
        if h:
            out.append((h.group(1), []))
        elif out:
            out[-1][1].append(line)
    return [(title, "\n".join(lines).strip()) for title, lines in out]


def parse_source_dir(source_dir: Path) -> tuple[dict[int, SourceIndicator], str]:
    files = sorted(p for p in source_dir.glob("*.md") if re.match(r"^\d{2}-", p.name))
    if not files:
        raise ReferentialImportError(f"aucun fichier indicateur dans {source_dir}")
    global_hash = hashlib.sha256()
    out: dict[int, SourceIndicator] = {}
    for path in files:
        raw = path.read_bytes()
        global_hash.update(path.name.encode() + b"\0" + raw)
        meta, body = _parse_front_matter(raw.decode("utf-8"))
        try:
            n = int(meta["indicateur"])
            crit = int(meta["critere"])
        except (KeyError, ValueError):
            raise ReferentialImportError(f"{path.name} : indicateur/critère illisible") from None
        secs = _sections(body)
        titles = {t for t, _ in secs}
        missing = [s for s in REQUIRED_SECTIONS if s not in titles]
        if missing:
            raise ReferentialImportError(f"{path.name} : sections manquantes {missing}")
        if n in out:
            raise ReferentialImportError(f"indicateur {n} en double")
        out[n] = SourceIndicator(
            number=n,
            criterion=crit,
            criterion_title=meta.get("critere_titre", ""),
            slug=meta.get("slug", path.stem),
            ponderation=meta.get("ponderation", ""),
            new_entrant=meta.get("nouveaux_entrants", "").lower() == "oui",
            subcontracting=meta.get("sous_traitance", ""),
            editorial_note=meta.get("editorial_note") or None,
            sections=secs,
            sha256=hashlib.sha256(raw).hexdigest(),
        )
    return out, global_hash.hexdigest()


def load_referential(folder: Path) -> ParsedReferential:
    source, source_sha = parse_source_dir(folder / "source")
    norm_files = sorted((folder / "normative").glob("*.yaml"))
    if len(norm_files) != 1:
        raise ReferentialImportError("un seul fichier normatif YAML attendu par version")
    norm_raw = norm_files[0].read_bytes()
    norm = yaml.safe_load(norm_raw)
    meta = norm.get("referential") or {}
    for k in ("code", "version", "title", "effective_from", "source_label"):
        if not meta.get(k):
            raise ReferentialImportError(f"normatif : referential.{k} manquant")
    indicators = {int(k): v or {} for k, v in (norm.get("indicators") or {}).items()}
    criteria = {int(k): str(v) for k, v in (norm.get("criteria") or {}).items()}

    if set(indicators) != set(source):
        raise ReferentialImportError(
            f"indicateurs source {sorted(source)} ≠ normatif {sorted(indicators)}"
        )
    warnings: list[str] = []
    keys: set[str] = set()
    for n, spec in indicators.items():
        if source[n].criterion not in criteria:
            raise ReferentialImportError(f"critère {source[n].criterion} sans titre dans le normatif")
        if spec.get("scope") not in ("ORGANISME", "FORMATION", "SESSION"):
            raise ReferentialImportError(f"indicateur {n} : scope invalide")
        for c in spec.get("controls") or []:
            if c.get("check") not in KNOWN_CHECKS:
                raise ReferentialImportError(f"indicateur {n} : check inconnu {c.get('check')}")
            if c["key"] in keys:
                raise ReferentialImportError(f"clé de contrôle en double {c['key']}")
            keys.add(c["key"])
            if not c["key"].startswith(f"I{n:02d}."):
                raise ReferentialImportError(f"{c['key']} ne correspond pas à l'indicateur {n}")
        if not spec.get("controls"):
            warnings.append(f"I{n:02d} : aucun contrôle automatisé (revue humaine)")

    upstream = folder / "source" / "UPSTREAM_COMMIT"
    return ParsedReferential(
        meta=meta,
        criteria=criteria,
        source=source,
        normative=indicators,
        new_entrant_control=norm.get("new_entrant_control") or {},
        source_sha256=source_sha,
        normative_sha256=hashlib.sha256(norm_raw).hexdigest(),
        upstream_ref=upstream.read_text().strip() if upstream.exists() else None,
        warnings=warnings,
    )


def import_referential(db: Session, folder: Path, *, activate: bool = True, actor_id: str | None = None) -> ReferentialVersion:
    parsed = load_referential(folder)
    m = parsed.meta
    existing = db.scalar(
        select(ReferentialVersion).where(ReferentialVersion.code == m["code"], ReferentialVersion.version == m["version"])
    )
    if existing is not None:
        if existing.source_sha256 == parsed.source_sha256 and existing.normative_sha256 == parsed.normative_sha256:
            if activate and not existing.is_active:
                _activate(db, existing)
            return existing
        raise ConflictError(
            f"{m['code']} {m['version']} déjà importé avec un contenu différent : créez une nouvelle version"
        )

    eff = m["effective_from"]
    version = ReferentialVersion(
        code=m["code"],
        version=m["version"],
        title=m["title"],
        effective_from=eff if isinstance(eff, date) else date.fromisoformat(str(eff)),
        source_label=m["source_label"],
        source_url=m.get("source_url"),
        source_sha256=parsed.source_sha256,
        normative_sha256=parsed.normative_sha256,
        upstream_ref=parsed.upstream_ref,
        imported_by=actor_id,
    )
    db.add(version)
    db.flush()
    for num, title in sorted(parsed.criteria.items()):
        db.add(Criterion(version_id=version.id, number=num, title=title))

    nec = parsed.new_entrant_control
    for n in sorted(parsed.source):
        src = parsed.source[n]
        spec = parsed.normative[n]
        ind = Indicator(
            version_id=version.id,
            criterion_number=src.criterion,
            number=n,
            slug=src.slug,
            title=spec.get("title") or src.slug,
            ponderation=src.ponderation,
            new_entrant_adapted=src.new_entrant,
            subcontracting=src.subcontracting,
            source_sha256=src.sha256,
            editorial_note=src.editorial_note,
            scope=spec["scope"],
            applicability=spec.get("applicability") or {},
            expected_evidence=[{"type": t} for t in spec.get("expected_evidence") or []],
            human_review=spec.get("human_review") or "",
        )
        db.add(ind)
        db.flush()
        for pos, (title, body) in enumerate(src.sections):
            db.add(IndicatorText(indicator_id=ind.id, position=pos, section=title, body=body))
        for c in spec.get("controls") or []:
            db.add(
                ControlDefinition(
                    indicator_id=ind.id,
                    key=c["key"],
                    control_version=int(c.get("version", 1)),
                    label=c["label"],
                    check=c["check"],
                    scope=spec["scope"],
                    params=c.get("params") or {},
                    severity=c.get("severity", "majeure"),
                    remediation=c.get("remediation", ""),
                    guide_section=c.get("guide_section"),
                    new_entrant_mode="same",
                )
            )
        if src.new_entrant and nec:
            db.add(
                ControlDefinition(
                    indicator_id=ind.id,
                    key=f"I{n:02d}.new-entrant-procedure",
                    control_version=1,
                    label=nec.get("label", "Processus formalisé"),
                    check=nec.get("check", "procedure_documented"),
                    scope="ORGANISME",
                    params={"indicator": n},
                    severity=nec.get("severity", "majeure"),
                    remediation=nec.get("remediation", ""),
                    new_entrant_mode="only",
                )
            )
    if activate:
        _activate(db, version)
    db.flush()
    return version


def _activate(db: Session, version: ReferentialVersion) -> None:
    db.execute(
        update(ReferentialVersion).where(ReferentialVersion.code == version.code).values(is_active=False)
    )
    version.is_active = True


def active_version(db: Session, code: str = "QUALIOPI") -> ReferentialVersion:
    v = db.scalar(select(ReferentialVersion).where(ReferentialVersion.code == code, ReferentialVersion.is_active.is_(True)))
    if v is None:
        raise DomainError("Aucun référentiel actif : importez-en un (POST /api/v1/referentials/import)")
    return v
