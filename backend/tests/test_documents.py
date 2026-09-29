"""Dossier de pièces : dépôt sûr, versions, demandes, et pièces qui deviennent des preuves."""

import hashlib

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.demo import _grid_yes
from app.documents import storage
from app.documents.service import dossier_status, request_document, upload
from app.qualiopi.engine import process_pending
from app.qualiopi.evaluation.models import ControlResult
from app.qualiopi.evidence.models import Evidence
from app.training import models as t
from tests.conftest import TODAY, make_user

PDF = b"%PDF-1.4\n% compte rendu\n%%EOF\n"


def _org(db: Session) -> t.Organization:
    return db.scalar(select(t.Organization))


def test_depot_refuse_si_le_contenu_ment_sur_son_type() -> None:
    with pytest.raises(storage.UploadRefused, match="ne correspond pas"):
        storage.check(b"MZ\x90\x00 executable", "application/pdf")
    with pytest.raises(storage.UploadRefused, match="non accepté"):
        storage.check(PDF, "application/x-msdownload")
    with pytest.raises(storage.UploadRefused, match="vide"):
        storage.check(b"", "application/pdf")


def test_depot_puis_nouvelle_version_sans_ecrasement(demo: Session) -> None:
    org = _org(demo)
    v1 = upload(demo, subject="ORGANISME", subject_id=org.id, requirement="CR_REUNION_PEDAGOGIQUE", content=PDF,
                filename="cr.pdf", mime="application/pdf")
    v2 = upload(demo, subject="ORGANISME", subject_id=org.id, requirement="CR_REUNION_PEDAGOGIQUE", content=PDF + b"v2",
                filename="cr-v2.pdf", mime="application/pdf")
    demo.commit()
    assert (v1.status, v2.status, v2.version, v2.previous_version_id) == ("REMPLACE", "EMIS", 2, v1.id)
    assert v2.sha256 == hashlib.sha256(PDF + b"v2").hexdigest()
    assert storage.read(v1.storage_path, v1.sha256) == PDF, "la version 1 reste lisible"


def test_piece_deposee_devient_preuve_et_ferme_le_trou_i18(demo: Session) -> None:
    org = _org(demo)
    assert demo.scalar(select(ControlResult).where(ControlResult.control_key == "I18.coordination-documents")).status == "PREUVES_INSUFFISANTES"
    upload(demo, subject="ORGANISME", subject_id=org.id, requirement="CR_REUNION_PEDAGOGIQUE", content=PDF,
           filename="cr.pdf", mime="application/pdf", checklist=_grid_yes("ORGANISME", "CR_REUNION_PEDAGOGIQUE"))
    demo.commit()
    process_pending(demo, today=TODAY)
    demo.commit()
    r = demo.scalar(select(ControlResult).where(ControlResult.control_key == "I18.coordination-documents"))
    assert r.status == "DEMONTRABLE" and r.observed == "2/2"
    ev = demo.scalar(select(Evidence).where(Evidence.facts["requirement"].as_string() == "CR_REUNION_PEDAGOGIQUE"))
    assert {link.indicator_number for link in ev.links} == {18}
    assert ev.document_sha256 == hashlib.sha256(PDF).hexdigest() and ev.valid_until is not None


def test_demande_de_piece_satisfaite_au_depot(demo: Session) -> None:
    org = _org(demo)
    req = request_document(demo, subject="ORGANISME", subject_id=org.id, requirement="PROCEDURE_RECLAMATIONS",
                           requested_from="Direction", due_on=TODAY, message="Pour l'audit de novembre")
    state = {i["code"]: i["state"] for i in dossier_status(demo, "ORGANISME", org.id, today=TODAY)["items"]}
    assert state["PROCEDURE_RECLAMATIONS"] == "DEMANDEE" and state["ORGANIGRAMME"] == "RECUE"
    assert state["CR_REUNION_PEDAGOGIQUE"] == "MANQUANTE"
    doc = upload(demo, subject="ORGANISME", subject_id=org.id, requirement="PROCEDURE_RECLAMATIONS", content=PDF,
                 filename="procedure.pdf", mime="application/pdf")
    assert (req.status, req.fulfilled_document_id) == ("SATISFAITE", doc.id)


def test_api_permissions_depot_et_telechargement(demo: Session, client) -> None:  # noqa: ANN001
    org = _org(demo)
    _, gestion = make_user(demo, "gestion")
    _, qualite = make_user(demo, "qualite")
    url = f"/api/v1/dossiers/ORGANISME/{org.id}/pieces/CR_REUNION_PEDAGOGIQUE"
    files = {"file": ("cr.pdf", PDF, "application/pdf")}
    assert client.post(url, headers=gestion, files=files).status_code == 403, "le dossier qualité est réservé à la qualité"
    r = client.post(url, headers=qualite, files=files)
    assert r.status_code == 200, r.text
    got = client.get(f"/api/v1/documents/{r.json()['id']}/contenu", headers=gestion)
    assert got.content == PDF and got.headers["x-content-sha256"] == hashlib.sha256(PDF).hexdigest()
    bad = client.post(url, headers=qualite, files={"file": ("x.pdf", b"pas un pdf", "application/pdf")})
    assert bad.status_code == 422


def test_fichier_altere_sur_disque_refuse() -> None:
    from pathlib import Path

    from app.core.config import get_settings
    from app.core.errors import DomainError

    stored = storage.store(PDF + b"integrite", "application/pdf")
    path = Path(get_settings().documents_dir) / stored.relative_path
    path.write_bytes(PDF + b"falsifie")
    with pytest.raises(DomainError, match="Intégrité"):
        storage.read(stored.relative_path, stored.sha256)
