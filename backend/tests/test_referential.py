import shutil
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.core.errors import ConflictError
from app.qualiopi.referential.importer import (
    ReferentialImportError,
    active_version,
    import_referential,
    load_referential,
)

V9 = Path(__file__).resolve().parents[1] / "referentials" / "qualiopi" / "v9"


def test_parse_32_indicateurs_7_criteres() -> None:
    parsed = load_referential(V9)
    assert sorted(parsed.source) == list(range(1, 33))
    assert sorted(parsed.criteria) == list(range(1, 8))
    assert parsed.upstream_ref and len(parsed.upstream_ref) == 40
    # Les indicateurs sans contrôle automatique sont signalés, pas masqués.
    sans_controle = sorted(int(w[1:3]) for w in parsed.warnings)
    assert sans_controle == [13, 14, 15, 20, 28, 29]


def test_import_en_base_puis_reimport_idempotent(db: Session) -> None:
    v = import_referential(db, V9)
    db.commit()
    assert v.is_active and v.code == "QUALIOPI" and v.version == "V9"
    assert len(v.indicators) == 32
    assert len(v.criteria) == 7
    assert all(ind.texts for ind in v.indicators), "chaque indicateur garde le texte du guide"
    assert active_version(db).id == v.id

    again = import_referential(db, V9)
    assert again.id == v.id


def test_contenu_modifie_sous_le_meme_numero_refuse(db: Session, tmp_path: Path) -> None:
    import_referential(db, V9)
    db.commit()
    copy = tmp_path / "v9"
    shutil.copytree(V9, copy)
    norm = copy / "normative" / "v9.yaml"
    norm.write_text(norm.read_text(encoding="utf-8").replace("warning_ratio: 0.8", "warning_ratio: 0.5", 1), encoding="utf-8")
    with pytest.raises(ConflictError):
        import_referential(db, copy)


def test_check_inconnu_refuse(tmp_path: Path) -> None:
    copy = tmp_path / "v9"
    shutil.copytree(V9, copy)
    norm = copy / "normative" / "v9.yaml"
    norm.write_text(norm.read_text(encoding="utf-8").replace("check: program_evidence", "check: devine_moi", 1), encoding="utf-8")
    with pytest.raises(ReferentialImportError):
        load_referential(copy)
