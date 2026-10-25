"""Administration et compte : profil, mot de passe, journal global, organisme, référentiels."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events.models import OutboxEvent
from tests.conftest import make_user


def test_profil_et_mot_de_passe(client, demo: Session) -> None:  # noqa: ANN001
    user, h = make_user(demo, "gestion", email="profil@test.local")
    r = client.patch("/api/v1/auth/me", json={"full_name": "  Claire Martin "}, headers=h)
    assert r.status_code == 200 and r.json()["full_name"] == "Claire Martin"
    assert client.patch("/api/v1/auth/me", json={"full_name": " "}, headers=h).status_code == 422

    bad = client.post("/api/v1/auth/me/password", json={"actuel": "faux", "nouveau": "nouveau-mot-de-passe"}, headers=h)
    assert bad.status_code == 403
    short = client.post("/api/v1/auth/me/password", json={"actuel": "mot-de-passe-test", "nouveau": "court"}, headers=h)
    assert short.status_code == 422
    ok = client.post("/api/v1/auth/me/password", json={"actuel": "mot-de-passe-test", "nouveau": "nouveau-mot-de-passe"},
                     headers=h)
    assert ok.status_code == 204
    login = client.post("/api/v1/auth/login", json={"email": "profil@test.local", "password": "nouveau-mot-de-passe"})
    assert login.status_code == 200


def test_journal_recent_pagine(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "admin")
    first = client.get("/api/v1/journal/recent?limite=5", headers=h).json()
    assert len(first["lignes"]) == 5 and first["suite"] == first["lignes"][-1]["id"]
    ids = [row["id"] for row in first["lignes"]]
    assert ids == sorted(ids, reverse=True)
    nxt = client.get(f"/api/v1/journal/recent?limite=5&avant={first['suite']}", headers=h).json()
    assert all(row["id"] < first["suite"] for row in nxt["lignes"])
    table = first["lignes"][0]["table"]
    only = client.get(f"/api/v1/journal/recent?table={table}", headers=h).json()
    assert only["lignes"] and all(row["table"] == table for row in only["lignes"])
    _, hf = make_user(demo, "formateur", email="f-journal@test.local")
    assert client.get("/api/v1/journal/recent", headers=hf).status_code == 403


def test_organisme_modifie_relance_le_moteur(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "admin")
    org = client.get("/api/v1/organisme", headers=h).json()
    assert org["existe"] and {c["code"] for c in org["categories_possibles"]} >= {"AF", "BC"}
    r = client.patch("/api/v1/organisme", json={"action_categories": ["BC", "AF"], "siret": "123 456 789 00012"}, headers=h)
    assert r.status_code == 200
    assert r.json()["action_categories"] == ["AF", "BC"] and r.json()["siret"] == "12345678900012"
    assert demo.scalar(select(OutboxEvent).where(OutboxEvent.name == "organization.updated")) is not None
    assert client.patch("/api/v1/organisme", json={"siret": "123"}, headers=h).status_code in (409, 422)
    assert client.patch("/api/v1/organisme", json={"action_categories": []}, headers=h).status_code in (409, 422)
    _, hg = make_user(demo, "formateur", email="f-org@test.local")
    assert client.patch("/api/v1/organisme", json={"name": "X"}, headers=hg).status_code == 403


def test_referentiels_listes(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "admin")
    body = client.get("/api/v1/referentials", headers=h).json()
    assert any(v["is_active"] for v in body["versions"])
    assert "qualiopi/v9" in body["dossiers"]


def test_saisies_hors_limites_refusees_proprement(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "admin", email="limites@test.local")
    assert client.patch("/api/v1/organisme", json={"is_new_entrant": None}, headers=h).status_code in (409, 422)
    assert client.patch("/api/v1/organisme", json={"nda_number": "9" * 41}, headers=h).status_code == 422
    long = "é" * 40  # 80 octets
    r = client.post("/api/v1/auth/me/password", json={"actuel": "mot-de-passe-test", "nouveau": long}, headers=h)
    assert r.status_code == 422
