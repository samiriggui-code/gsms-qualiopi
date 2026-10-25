"""Feuille de route : toutes les échéances sur une ligne de temps, selon les droits du compte."""

from sqlalchemy.orm import Session

from tests.conftest import make_user


def test_feuille_de_route_triee_et_par_droits(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "admin")
    body = client.get("/api/v1/pilotage/feuille-de-route?semaines=8", headers=h).json()
    assert body["elements"] and "SESSION" in body["sources"]
    order = {"EN_RETARD": 0, "A_ECHEANCE": 1, "A_VENIR": 2}
    keys = [(order[i["etat"]], i["echeance"]) for i in body["elements"]]
    assert keys == sorted(keys)
    assert all(i["echeance"] <= body["jusqu_au"] for i in body["elements"] if i["etat"] == "A_VENIR")
    first = body["elements"][0]
    assert first["semaine"] <= first["echeance"] and first["lien"]

    _, hf = make_user(demo, "formateur", email="f-route@test.local")
    mine = client.get("/api/v1/pilotage/feuille-de-route", headers=hf).json()
    assert "SESSION" not in mine["sources"] and all(i["source"] not in ("SESSION", "ACTION") for i in mine["elements"])
    assert client.get("/api/v1/pilotage/feuille-de-route?semaines=99", headers=h).status_code == 422
