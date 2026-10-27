"""Outils MCP étendus : chaque outil rend ce que rend sa route, avec les droits de la personne."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.config.config import get_settings
from app.handler import mcp_outils
from app.types import training as t
from tests.conftest import find_session, make_user
from tests.test_mcp import tool

MODULES = ("funding", "invoicing", "edof", "relances")

# (outil, route de liste équivalente, clé de la liste dans la réponse de l'outil)
LISTS = [
    ("lister_lieux", "/api/v1/premises", "lieux"),
    ("lister_equipements", "/api/v1/equipment", "equipements"),
    ("lister_formateurs", "/api/v1/trainers", "formateurs"),
    ("lister_titres_formateurs", "/api/v1/trainer-qualifications", "titres"),
    ("lister_personnel", "/api/v1/rh/personnel", "personnel"),
    ("lister_dossiers_financement", "/api/v1/financement/dossiers", "dossiers"),
    ("lister_factures", "/api/v1/factures", "factures"),
    ("lister_encaissements", "/api/v1/encaissements", "encaissements"),
    ("lister_documents_professionnels", "/api/v1/editions", "documents"),
    ("lister_enquetes_satisfaction", "/api/v1/surveys", "enquetes"),
    ("lister_stagiaires", "/api/v1/learners", "stagiaires"),
    ("lister_entreprises", "/api/v1/companies", "entreprises"),
]


@pytest.fixture
def admin(client, demo: Session) -> dict:  # noqa: ANN001
    _, headers = make_user(demo, "admin", email="direction-mcp@test.local")
    for module in MODULES:
        client.put(f"/api/v1/features/{module}", json={"enabled": True}, headers=headers)
    return headers


@pytest.mark.parametrize(("name", "url", "key"), LISTS)
def test_listes_identiques_a_la_route(client, admin: dict, name: str, url: str, key: str) -> None:  # noqa: ANN001
    route = client.get(url, headers=admin)
    is_error, out = tool(client, admin, name, limite=200)
    if route.status_code != 200:  # module éteint, etc. : l'outil refuse aussi, lisiblement
        assert is_error, out
        return
    rows = route.json()
    rows = rows if isinstance(rows, list) else rows.get(key) or rows.get("lignes") or rows.get("items") or []
    assert not is_error, out
    assert out["total"] == len(rows) and out[key] == rows[:200]


def test_fiches_identiques_a_la_route(client, demo: Session, admin: dict) -> None:  # noqa: ANN001
    session = find_session(demo, "SSIAP1-2026-01")
    assert tool(client, admin, "fiche_session", session="SSIAP1-2026-01")[1] == \
        client.get(f"/api/v1/sessions/{session.id}", headers=admin).json()
    assert tool(client, admin, "parcours_session", session=session.id)[1] == \
        client.get(f"/api/v1/sessions/{session.id}/parcours", headers=admin).json()
    trainer = demo.query(t.Trainer).first()
    assert tool(client, admin, "fiche_formateur", formateur=trainer.id)[1] == \
        client.get(f"/api/v1/trainers/{trainer.id}", headers=admin).json()
    audits = client.get("/api/v1/qualiopi/audits", headers=admin).json()["audits"]
    if audits:
        audit_id = audits[0]["id"]
        assert tool(client, admin, "fiche_audit", audit=audit_id)[1] == \
            client.get(f"/api/v1/qualiopi/audits/{audit_id}", headers=admin).json()
    assert tool(client, admin, "synthese_factures")[1] == client.get("/api/v1/factures/synthese", headers=admin).json()
    assert tool(client, admin, "fiche_session", session="X-0000")[0]  # introuvable : erreur lisible


def test_droits_de_la_personne(client, demo: Session) -> None:  # noqa: ANN001
    _, formatrice = make_user(demo, "formateur", email="formatrice-mcp@test.local")
    is_error, text = tool(client, formatrice, "lister_factures")
    assert is_error and "invoices.read" in text
    is_error, text = tool(client, formatrice, "lister_personnel")
    assert is_error and "staff.read" in text


def test_coordonnees_masquees_seulement_sur_reglage(client, admin: dict, monkeypatch) -> None:  # noqa: ANN001
    visible = tool(client, admin, "lister_stagiaires", limite=200)[1]["stagiaires"]
    assert visible == client.get("/api/v1/learners", headers=admin).json()[:200]  # rien de retiré par défaut
    monkeypatch.setattr(get_settings(), "ia_masquer_coordonnees", True)
    masked = tool(client, admin, "lister_stagiaires", limite=200)[1]["stagiaires"]
    assert all(not any(mcp_outils._is_contact(k) for k in row) for row in masked)
    # Les lieux gardent leur adresse : ce n'est pas une donnée personnelle.
    assert tool(client, admin, "lister_lieux", limite=200)[1]["lieux"] == \
        client.get("/api/v1/premises", headers=admin).json()[:200]


def test_filtre_des_coordonnees() -> None:
    data = {"nom": "Durand", "email": "a@b.fr", "contact_email": "c@d.fr", "telephone": "06",
            "notes": "écrire à x@y.fr", "lieu": {"adresse": "1 rue", "ville": "Lyon"}, "liste": [{"phone": "07"}]}
    out = mcp_outils.sans_contact(data)
    assert out == {"nom": "Durand", "notes": f"écrire à {mcp_outils.EMAIL_MASK}", "lieu": {}, "liste": [{}]}
    kept = mcp_outils.sans_contact(data, keep=mcp_outils.SITE_ADDRESS_KEYS)
    assert kept["lieu"] == {"adresse": "1 rue", "ville": "Lyon"} and "email" not in kept
