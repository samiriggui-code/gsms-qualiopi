"""Ressources simples (écrans listes du front) et lecture du référentiel par indicateur."""

from sqlalchemy.orm import Session

from tests.conftest import make_user


def test_listes_des_ecrans_repondent(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    for path in ("programs", "companies", "learners", "trainers", "trainer-qualifications", "staff-development",
                 "subcontractors", "partners", "watch-items", "complaints", "surveys"):
        r = client.get(f"/api/v1/{path}", headers=h)
        assert r.status_code == 200, (path, r.text)
        assert isinstance(r.json(), list)
    programs = client.get("/api/v1/programs", headers=h).json()
    assert programs and {"code", "title", "sessions"} <= set(programs[0])
    learners = client.get("/api/v1/learners", headers=h).json()
    assert {"full_name", "company_name", "enrollments"} <= set(learners[0])


def test_entreprise_creee_modifiee_supprimee_avec_droits(client, demo: Session) -> None:  # noqa: ANN001
    _, gestion = make_user(demo, "gestion")
    _, lecture = make_user(demo, "lecture", email="lecture@test.local")
    body = {"name": "Transports Martin", "siret": "12345678900011", "contact_email": "rh@martin.fr"}
    assert client.post("/api/v1/companies", json=body, headers=lecture).status_code == 403, "lecture seule"
    r = client.post("/api/v1/companies", json=body, headers=gestion)
    assert r.status_code == 201, r.text
    company = r.json()
    assert company["name"] == "Transports Martin" and company["learners"] == 0
    r = client.patch(f"/api/v1/companies/{company['id']}", json={"contact_name": "Mme Martin"}, headers=gestion)
    assert r.json()["contact_name"] == "Mme Martin" and r.json()["siret"] == "12345678900011"
    assert client.delete(f"/api/v1/companies/{company['id']}", headers=gestion).status_code == 204
    assert client.get(f"/api/v1/companies/{company['id']}", headers=gestion).status_code == 404


def test_valeurs_controlees(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "qualite")
    r = client.post("/api/v1/partners", json={"kind": "AUTRE", "name": "Cap emploi"}, headers=h)
    assert r.status_code == 422 and "Type de partenaire" in r.json()["detail"]
    r = client.post("/api/v1/partners", json={"kind": "HANDICAP", "name": "Cap emploi"}, headers=h)
    assert r.status_code == 201


def test_indicateurs_du_referentiel_en_vigueur(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "qualite")
    version = client.get("/api/v1/referentials/active", headers=h).json()
    assert version["criteria"] and version["criteria"][0]["number"] == 1
    indicators = client.get("/api/v1/referentials/active/indicators", headers=h).json()
    assert [i["number"] for i in indicators] == sorted(i["number"] for i in indicators)
    assert indicators[0]["code"] == "I01"
    r = client.get("/api/v1/referentials/active/indicators/4", headers=h)
    assert r.status_code == 200 and r.json()["texts"] and r.json()["controls"] and r.json()["criterion_title"]
    assert client.get("/api/v1/referentials/active/indicators/99", headers=h).status_code == 404


def test_nom_de_fichier_accentue_dans_l_en_tete() -> None:
    from app.core.downloads import content_disposition

    header = content_disposition("Procédure réclamations — œuvre.pdf")
    header.encode("latin-1")  # un en-tête HTTP doit rester encodable, sinon le serveur répond 500
    assert header.startswith('attachment; filename="Procedure reclamations  uvre.pdf"')
    assert "filename*=UTF-8''Proc%C3%A9dure%20r%C3%A9clamations%20%E2%80%94%20%C5%93uvre.pdf" in header
    assert content_disposition("attestation.html", inline=True).startswith("inline;")
