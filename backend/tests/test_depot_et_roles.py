"""Grille cochée au dépôt, pièce papier, séparation dépôt / validation, rôles attribués par l'organisme."""

import json

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError
from app.demo import _grid_yes
from app.documents.service import declare_paper, dossier_status, upload
from app.platform.decisions import PolicyDenied
from app.platform.settings import ConfigurationService
from app.qualiopi.engine import refresh_all
from app.qualiopi.evidence.models import Evidence, EvidenceValidation
from app.qualiopi.evidence.service import validate
from app.training import models as t
from tests.conftest import TODAY, make_user

PDF = b"%PDF-1.4\n% reclamations\n%%EOF\n"
RECLAMATIONS = "PROCEDURE_RECLAMATIONS"


def _org(db: Session) -> t.Organization:
    return db.scalar(select(t.Organization))


def _deposit(demo: Session, checklist: dict | None, actor_id: str | None = None, content: bytes = PDF) -> Evidence:
    doc = upload(demo, subject="ORGANISME", subject_id=_org(demo).id, requirement=RECLAMATIONS, content=content,
                 filename="reclamations.pdf", mime="application/pdf", checklist=checklist, actor_id=actor_id)
    refresh_all(demo, trigger="test", today=TODAY)
    demo.commit()
    return demo.scalar(select(Evidence).where(Evidence.source_id == doc.id))


def _state(demo: Session, code: str) -> dict:
    return next(i for i in dossier_status(demo, "ORGANISME", _org(demo).id, today=TODAY)["items"] if i["code"] == code)


# ── Grille au dépôt ─────────────────────────────────────────────────────────────


def test_grille_complete_au_depot_rend_la_piece_exploitable(demo: Session) -> None:
    ev = _deposit(demo, _grid_yes("ORGANISME", RECLAMATIONS))
    assert ev.status == "EXPLOITABLE" and ev.form_issues == []
    item = _state(demo, RECLAMATIONS)
    assert item["state"] == "RECUE" and item["document"]["grille_depot"]["ALEAS"]["reponse"] == "OUI"


def test_point_non_ou_grille_absente_laisse_la_piece_a_completer(demo: Session) -> None:
    ev = _deposit(demo, _grid_yes("ORGANISME", RECLAMATIONS) | {"ALEAS": "NON"})
    assert ev.status == "DOCUMENTEE"
    assert ev.form_issues == ["ALEAS non satisfait : Traite les aléas survenus en cours de prestation"]
    assert _state(demo, RECLAMATIONS)["state"] == "A_COMPLETER"

    sans = _deposit(demo, None, content=PDF + b"v2")
    assert sans.status == "DOCUMENTEE" and sans.form_issues == ["grille de dépôt non renseignée"]


def test_point_officiel_jamais_sans_objet_au_depot(demo: Session) -> None:
    with pytest.raises(InvalidStateError, match="énoncé officiel"):
        _deposit(demo, _grid_yes("ORGANISME", RECLAMATIONS) | {"RECLAMATIONS": "SANS_OBJET"})


def test_piece_papier_declaree(demo: Session) -> None:
    org = _org(demo)
    with pytest.raises(InvalidStateError, match="original papier"):
        declare_paper(demo, subject="ORGANISME", subject_id=org.id, requirement="REGLEMENT_INTERIEUR",
                      checklist=_grid_yes("ORGANISME", "REGLEMENT_INTERIEUR"), location=" ")
    doc = declare_paper(demo, subject="ORGANISME", subject_id=org.id, requirement="REGLEMENT_INTERIEUR",
                        checklist=_grid_yes("ORGANISME", "REGLEMENT_INTERIEUR"), location="Classeur qualité, bureau direction")
    refresh_all(demo, trigger="test", today=TODAY)
    demo.commit()
    assert doc.support == "PAPIER" and doc.storage_path is None and len(doc.sha256) == 64
    ev = demo.scalar(select(Evidence).where(Evidence.source_id == doc.id))
    assert ev.status == "EXPLOITABLE" and ev.facts["support"] == "PAPIER"


# ── Séparation dépôt / validation ───────────────────────────────────────────────


def test_le_deposant_ne_valide_pas_sa_piece_sauf_si_l_organisme_l_autorise(demo: Session) -> None:
    grid = _grid_yes("ORGANISME", RECLAMATIONS)
    ev = _deposit(demo, grid, actor_id="u-assistant")
    with pytest.raises(PolicyDenied, match="un autre membre") as refus:
        validate(demo, ev.id, "VALIDEE", None, "u-assistant", "Assistante", checklist=grid)
    assert refus.value.code == "SELF_VALIDATION_FORBIDDEN"

    ConfigurationService(demo).set("quality.allow_self_validation", True, reason="Équipe de deux personnes")
    validate(demo, ev.id, "VALIDEE", None, "u-assistant", "Assistante", checklist=grid)
    demo.commit()
    saved = demo.scalar(select(EvidenceValidation).where(EvidenceValidation.evidence_id == ev.id))
    assert ev.status == "VALIDEE" and saved.self_validated is True


def test_un_autre_membre_valide_normalement(demo: Session) -> None:
    grid = _grid_yes("ORGANISME", RECLAMATIONS)
    ev = _deposit(demo, grid, actor_id="u-assistant")
    validate(demo, ev.id, "VALIDEE", None, "u-qualite", "Responsable qualité", checklist=grid)
    demo.commit()
    saved = demo.scalar(select(EvidenceValidation).where(EvidenceValidation.evidence_id == ev.id))
    assert saved.self_validated is False


# ── API : rôles et dépôt ────────────────────────────────────────────────────────


def test_catalogue_des_roles(client, db: Session) -> None:  # noqa: ANN001
    _, headers = make_user(db, "lecture")
    roles = {r["code"]: r for r in client.get("/api/v1/auth/roles", headers=headers).json()}
    assert "evidence.validate" not in roles["assistant_qualite"]["permissions"]
    assert "quality.write" in roles["assistant_qualite"]["permissions"]


def test_le_responsable_qualite_attribue_les_roles(client, db: Session) -> None:  # noqa: ANN001
    qualite, hq = make_user(db, "qualite")
    staff, _ = make_user(db, "lecture", email="staff@test.local")
    admin, ha = make_user(db, "admin")

    r = client.put(f"/api/v1/auth/users/{staff.id}/roles", json={"roles": ["assistant_qualite", "lecture"]}, headers=hq)
    assert r.status_code == 200 and r.json()["roles"] == ["assistant_qualite", "lecture"]
    r = client.put(f"/api/v1/auth/users/{staff.id}/roles", json={"roles": ["gestion"]}, headers=hq)
    assert r.status_code == 403 and "sessions.write" in r.json()["detail"], "la qualité n'a pas les droits de gestion"
    # Anti-escalade : on ne donne pas des droits qu'on n'a pas, on ne touche pas plus puissant que soi.
    assert client.put(f"/api/v1/auth/users/{staff.id}/roles", json={"roles": ["admin"]}, headers=hq).status_code == 403
    assert client.put(f"/api/v1/auth/users/{admin.id}/active", json={"is_active": False}, headers=hq).status_code == 403
    assert client.put(f"/api/v1/auth/users/{qualite.id}/roles", json={"roles": ["admin"]}, headers=hq).status_code == 403
    assert client.put(f"/api/v1/auth/users/{staff.id}/roles", json={"roles": ["chef"]}, headers=hq).status_code == 422
    assert client.put(f"/api/v1/auth/users/{staff.id}/roles", json={"roles": ["admin"]}, headers=ha).status_code == 200
    _, hl = make_user(db, "lecture", email="lecteur@test.local")
    assert client.get("/api/v1/auth/users", headers=hl).status_code == 403


def test_assistant_depose_avec_grille_mais_ne_valide_pas(client, demo: Session) -> None:  # noqa: ANN001
    _, headers = make_user(demo, "assistant_qualite")
    org = _org(demo)
    r = client.post(f"/api/v1/dossiers/ORGANISME/{org.id}/pieces/{RECLAMATIONS}", headers=headers,
                    files={"file": ("reclamations.pdf", PDF, "application/pdf")},
                    data={"grille": json.dumps(_grid_yes("ORGANISME", RECLAMATIONS))})
    assert r.status_code == 200, r.text
    refresh_all(demo, trigger="test", today=TODAY)
    demo.commit()
    ev = demo.scalar(select(Evidence).where(Evidence.source_id == r.json()["id"]))
    assert ev.status == "EXPLOITABLE"
    r = client.post(f"/api/v1/evidence/{ev.id}/validation", headers=headers,
                    json={"decision": "VALIDEE", "checklist": _grid_yes("ORGANISME", RECLAMATIONS)})
    assert r.status_code == 403


def test_parametre_auto_validation(client, demo: Session) -> None:  # noqa: ANN001
    _, hq = make_user(demo, "qualite")
    url = "/api/v1/settings/quality.allow_self_validation"
    assert client.put(url, json={"value": True}, headers=hq).status_code == 422, "réglage réglementaire : motif exigé"
    r = client.put(url, json={"value": True, "reason": "Équipe de deux personnes"}, headers=hq)
    assert r.status_code == 200 and r.json()["value"] is True
    _, hg = make_user(demo, "gestion")
    assert client.put(url, json={"value": False, "reason": "x"}, headers=hg).status_code == 403
