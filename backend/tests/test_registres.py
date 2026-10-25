"""Registres du parcours : mêmes états que le dossier de session, toutes sessions visibles confondues."""

from sqlalchemy.orm import Session

from app.journey.service import journey_view
from app.training import models as t
from tests.conftest import make_user


def test_registre_d_une_etape_reprend_le_dossier_de_session(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    r = client.get("/api/v1/parcours/registres/convocation", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["lignes"] and sum(body["compteurs"].values()) == len(body["lignes"])
    first = body["lignes"][0]
    e = demo.get(t.Enrollment, first["inscription"])
    step = next(st for st in journey_view(demo, e, None)["etapes"] if st["etape"] == "convocation")
    assert first["etape"]["etat"] == step["etat"]
    assert first["action"]["cle"] == "convocation" and "allowed" in first["action"]
    # ce qui presse d'abord : aucun retard après une ligne qui n'en est pas
    states = [row["etape"]["etat"] for row in body["lignes"]]
    assert states == sorted(states, key=["EN_RETARD", "A_ECHEANCE", "A_VENIR", "FAIT", "SANS_OBJET"].index)


def test_registres_inscriptions_abandons_certification(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    ins = client.get("/api/v1/parcours/registres/inscriptions", headers=h).json()
    assert all(0 <= row["avancement"]["faits"] <= row["avancement"]["applicables"] for row in ins["lignes"])
    ab = client.get("/api/v1/parcours/registres/abandons", headers=h).json()
    assert ab["lignes"] and all(row["statut"] in ("ABANDON", "ANNULE") and row["abandon"] for row in ab["lignes"])
    cert = client.get("/api/v1/parcours/registres/certification", headers=h).json()
    assert cert["lignes"] and all(row["epreuves"] for row in cert["lignes"])
    assert client.get("/api/v1/parcours/registres/inconnu", headers=h).status_code == 404


def test_registre_limite_aux_sessions_du_formateur(client, demo: Session) -> None:  # noqa: ANN001
    _, hg = make_user(demo, "gestion")
    _, hf = make_user(demo, "formateur", email="sans-session@test.local")
    assert client.get("/api/v1/parcours/registres/inscriptions", headers=hg).json()["lignes"]
    assert client.get("/api/v1/parcours/registres/inscriptions", headers=hf).json()["lignes"] == []


def test_synthese_concorde_avec_les_registres(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion", email="g-synthese@test.local")
    body = client.get("/api/v1/parcours/synthese", headers=h).json()
    conv = client.get("/api/v1/parcours/registres/convocation", headers=h).json()["compteurs"]
    assert body["etapes"]["convocation"] == conv
    assert sum(body["inscriptions"].values()) == len(client.get("/api/v1/parcours/registres/inscriptions", headers=h).json()["lignes"])
    assert all(r["etape"] in body["etapes"] for r in body["en_retard"])
