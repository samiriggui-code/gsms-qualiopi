"""Base « Documents de l'organisme » : liste blanche des documents versés, ajouts et retraits synchronisés."""

import json

from sqlalchemy.orm import Session

from app.application.service.documents import storage
from app.application.service.ia import documents
from app.config.config import get_settings
from app.types import training as t

PDF = b"%PDF-1.7\n% document de test\n"
KB = {"id": "kb-docs", "name": "Documents de l'organisme", "embedding_model_id": "modele-embedding"}


def add_document(db: Session, title: str, *, content: bytes = PDF, mime: str = "application/pdf", **fields) -> t.Document:  # noqa: ANN003
    stored = storage.store(content, mime) if content else None
    doc = t.Document(title=title, kind=fields.pop("kind", "PROCEDURE"), status=fields.pop("status", "EMIS"),
                     entity_type=fields.pop("entity_type", "ORGANISME"), mime_type=mime,
                     storage_path=stored.relative_path if stored else None, sha256=stored.sha256 if stored else None,
                     **fields)
    db.add(doc)
    db.commit()
    return doc


def fake_kb(monkeypatch, rows: list[dict]) -> dict:  # noqa: ANN001
    state = {"rows": rows, "uploads": [], "deleted": []}

    def call(method, path, payload=None, token=None, timeout=30):  # noqa: ANN001, ANN202, ARG001
        assert token == "jeton-service"
        if (method, path) == ("GET", "/api/v1/knowledge-bases"):
            return 200, {"success": True, "data": [KB]}
        if method == "DELETE" and path.startswith("/api/v1/knowledge/"):
            state["deleted"].append(path.rsplit("/", 1)[1])
            return 200, {"success": True}
        raise AssertionError(f"appel inattendu {method} {path}")

    def upload(path, fields, file_name, content, mime, token, timeout=120):  # noqa: ANN001, ANN202, ARG001
        assert path == "/api/v1/knowledge-bases/kb-docs/knowledge/file" and token == "jeton-service"
        state["uploads"].append({"meta": json.loads(fields["metadata"]), "name": file_name, "content": content, "mime": mime})
        return 200, {"success": True, "data": {"id": f"k-{len(state['uploads'])}"}}

    monkeypatch.setattr(documents, "call", call)
    monkeypatch.setattr(documents, "upload", upload)
    monkeypatch.setattr(documents, "_all_knowledge", lambda kb_id, token: state["rows"])
    return state


def test_liste_blanche_jamais_de_piece_nominative(demo: Session, tmp_path, monkeypatch) -> None:  # noqa: ANN001
    db = demo
    monkeypatch.setattr(get_settings(), "documents_dir", tmp_path)
    before = {d.id for d in db.query(t.Document)}
    session = db.query(t.TrainingSession).first()
    program = db.query(t.Program).first()
    ok = add_document(db, "Procédure de traitement des réclamations")
    signed = add_document(db, "Règlement intérieur", content=PDF + b"r", status="SIGNE")
    add_document(db, "Brouillon de procédure", content=PDF + b"b", status="BROUILLON")
    add_document(db, "Ancienne procédure", content=PDF + b"a", status="REMPLACE")
    add_document(db, "CV du formateur", content=PDF + b"c", entity_type="FORMATEUR", kind="CV")
    add_document(db, "Facture", content=PDF + b"f", entity_type="FACTURE", kind="FACTURE")
    add_document(db, "Pièce déclarée sur papier", content=b"")
    add_document(db, "Photo de la salle", content=b"\x89PNG\r\n\x1a\n" + b"x", mime="image/png")
    add_document(db, "Convocation", content=PDF + b"s", entity_type="ORGANISME", session_id=session.id)
    programme = add_document(db, "Programme SST", content=PDF + b"p", entity_type=None, kind="PROGRAMME",
                             program_id=program.id)
    add_document(db, "Programme sans formation", content=PDF + b"q", entity_type=None, kind="PROGRAMME")
    created = {d.id for d in db.query(t.Document)} - before
    assert {d.id for d in documents.eligible_documents(db)} & created == {ok.id, signed.id, programme.id}


def test_synchronisation_verse_et_retire(db: Session, tmp_path, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(get_settings(), "documents_dir", tmp_path)
    kept = add_document(db, "Organigramme")
    new = add_document(db, "Procédure accueil handicap", content=PDF + b"h", version=2)
    old = add_document(db, "Procédure accueil handicap", content=PDF + b"v1", status="REMPLACE")
    rows = [
        {"id": "k-kept", "title": "Organigramme", "parse_status": "completed",
         "metadata": {"gsms_document_id": kept.id, "gsms_sha256": kept.sha256}},
        {"id": "k-old", "title": "Procédure (v1)", "metadata": {"gsms_document_id": old.id, "gsms_sha256": old.sha256}},
        {"id": "k-change", "title": "Organigramme modifié",
         "metadata": {"gsms_document_id": kept.id, "gsms_sha256": "autre-empreinte"}},
        {"id": "k-gone", "title": "Pièce supprimée", "metadata": {"gsms_document_id": "inconnu", "gsms_sha256": "x"}},
        {"id": "k-main", "title": "Déposé à la main", "metadata": {}},
    ]
    state = fake_kb(monkeypatch, rows)
    monkeypatch.setattr(documents, "_attach_models", lambda kb, token, report: None)

    report = documents.sync_org_documents(db, "jeton-service")

    assert sorted(state["deleted"]) == ["k-change", "k-gone", "k-old"]  # « k-main » n'appartient pas à GSMS
    assert [u["meta"]["gsms_document_id"] for u in state["uploads"]] == [new.id]
    upload = state["uploads"][0]
    assert upload["meta"] == {"gsms_document_id": new.id, "gsms_version": "2", "gsms_sha256": new.sha256,
                              "gsms_kind": "PROCEDURE", "source": "GSMS Qualiopi"}
    assert upload["name"] == "Procédure accueil handicap (v2).pdf" and upload["content"] == PDF + b"h"
    assert "2 document(s) de l'organisme dans la base sur 2 éligible(s)" in report.done
    assert any("déposé(s) à la main" in p for p in report.problems)

    # Deuxième passage : rien à faire (idempotent).
    state["rows"] = [rows[0], {"id": "k-1", "title": "Procédure", "parse_status": "completed",
                               "metadata": {"gsms_document_id": new.id, "gsms_sha256": new.sha256}}]
    state["uploads"].clear()
    state["deleted"].clear()
    report = documents.sync_org_documents(db, "jeton-service")
    assert state["uploads"] == [] and state["deleted"] == [] and report.ok


def test_fichier_altere_non_verse(db: Session, tmp_path, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(get_settings(), "documents_dir", tmp_path)
    doc = add_document(db, "Livret d'accueil")
    (tmp_path / doc.storage_path).write_bytes(PDF + b"modifie hors GSMS")
    state = fake_kb(monkeypatch, [])
    monkeypatch.setattr(documents, "_attach_models", lambda kb, token, report: None)
    report = documents.sync_org_documents(db, "jeton-service")
    assert state["uploads"] == [] and any("Intégrité" in p for p in report.problems)
