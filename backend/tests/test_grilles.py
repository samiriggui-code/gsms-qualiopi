"""Trames de rédaction et grilles de relecture des pièces du dossier organisme."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError
from app.documents.dossier import load_templates
from app.documents.service import upload
from app.qualiopi.engine import refresh_all
from app.qualiopi.evidence.models import Evidence, EvidenceValidation
from app.qualiopi.evidence.service import validate
from app.training import models as t
from tests.conftest import TODAY, make_user

PDF = b"%PDF-1.4\n% procedure violences\n%%EOF\n"
VIOLENCES = "PROCEDURE_VIOLENCES_DISCRIMINATIONS"
TOUT_OUI = {c: "OUI" for c in ("SITUATIONS", "CADRE_FORMATION", "PREVENTION", "TRAITEMENT", "SIGNALEMENT", "INFORMATION", "VERSION")}


def _piece(demo: Session, content: bytes = PDF) -> Evidence:
    org = demo.scalar(select(t.Organization))
    doc = upload(demo, subject="ORGANISME", subject_id=org.id, requirement=VIOLENCES, content=content,
                 filename="procedure.pdf", mime="application/pdf")
    refresh_all(demo, trigger="test", today=TODAY)
    demo.commit()
    return demo.scalar(select(Evidence).where(Evidence.source_id == doc.id))


def _validate(demo: Session, ev: Evidence, decision: str = "VALIDEE", checklist: dict | None = None, comment: str | None = None):  # noqa: ANN202
    return validate(demo, ev.id, decision, comment, "u1", "Responsable qualité", checklist=checklist)


def test_pieces_v10_ont_une_trame_et_une_grille() -> None:
    items = {i.code: i for i in load_templates()["ORGANISME"].items}
    for code in (VIOLENCES, "ANALYSE_RISQUES_QUALITE"):
        assert items[code].modele and items[code].grille
        officiels = [g for g in items[code].grille if g.exigence == "REFERENTIEL"]
        assert officiels and all("énoncé" in g.source for g in officiels), "un point « référentiel » cite l'énoncé"


def test_trame_telechargeable(client, db: Session) -> None:  # noqa: ANN001
    _, headers = make_user(db, "lecture")
    r = client.get("/api/v1/dossiers/ORGANISME/modeles/ANALYSE_RISQUES_QUALITE", headers=headers)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/markdown")
    assert "Registre des risques" in r.text and "décret n° 2026-728" in r.text
    assert client.get("/api/v1/dossiers/ORGANISME/modeles/ORGANIGRAMME", headers=headers).status_code == 404


def test_valider_exige_une_grille_complete_et_satisfaite(demo: Session) -> None:
    ev = _piece(demo)
    with pytest.raises(InvalidStateError, match="grille"):
        _validate(demo, ev)
    with pytest.raises(InvalidStateError, match="sans réponse"):
        _validate(demo, ev, checklist={"SITUATIONS": "OUI"})
    with pytest.raises(InvalidStateError, match="TRAITEMENT"):
        _validate(demo, ev, checklist=TOUT_OUI | {"TRAITEMENT": "NON"})
    with pytest.raises(InvalidStateError, match="énoncé officiel"):
        _validate(demo, ev, checklist=TOUT_OUI | {"PREVENTION": "SANS_OBJET"}, comment="pas concerné")
    with pytest.raises(InvalidStateError, match="motivé"):
        _validate(demo, ev, checklist=TOUT_OUI | {"INFORMATION": "SANS_OBJET"})

    _validate(demo, ev, checklist=TOUT_OUI | {"INFORMATION": "SANS_OBJET"}, comment="Stagiaires informés par le portail")
    demo.commit()
    assert ev.status == "VALIDEE"
    saved = demo.scalar(select(EvidenceValidation).where(EvidenceValidation.evidence_id == ev.id))
    assert saved.checklist["TRAITEMENT"] == {"reponse": "OUI", "question": saved.checklist["TRAITEMENT"]["question"],
                                             "exigence": "REFERENTIEL"}
    assert saved.checklist["INFORMATION"]["reponse"] == "SANS_OBJET"


def test_rejet_trace_les_points_non_satisfaits(demo: Session) -> None:
    ev = _piece(demo)
    _validate(demo, ev, "REJETEE", checklist=TOUT_OUI | {"TRAITEMENT": "NON"}, comment="Aucun délai de traitement")
    demo.commit()
    assert ev.status == "REJETEE"
    saved = demo.scalar(select(EvidenceValidation).where(EvidenceValidation.evidence_id == ev.id))
    assert saved.checklist["TRAITEMENT"]["reponse"] == "NON"


def test_nouvelle_version_de_la_piece_remet_la_validation_a_zero(demo: Session) -> None:
    ev = _piece(demo)
    _validate(demo, ev, checklist=TOUT_OUI)
    demo.commit()
    nouvelle = _piece(demo, PDF + b"v2")
    assert nouvelle.status != "VALIDEE", "la version 2 n'a pas été relue"


def test_pas_de_grille_pas_de_reponses(demo: Session) -> None:
    ev = demo.scalar(select(Evidence).where(Evidence.source_table == "formation.program",
                                            Evidence.status.in_(("EXPLOITABLE", "DOCUMENTEE"))))
    assert ev is not None, "une preuve issue d'une fiche formation n'a pas de grille"
    with pytest.raises(InvalidStateError, match="pas de grille"):
        _validate(demo, ev, checklist={"X": "OUI"})
    _validate(demo, ev)
    assert ev.status == "VALIDEE"
