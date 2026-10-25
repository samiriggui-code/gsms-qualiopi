"""Espace du stagiaire : lien signé, ce qu'il montre, ce qu'il refuse."""

from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from app.journey import espace
from app.questionnaires.service import LinkClosed
from tests.conftest import find_session, make_user


def _enrollment(demo: Session, ref: str = "SST-2026-02"):  # noqa: ANN202
    return next(e for e in find_session(demo, ref).enrollments if e.status != "ANNULE")


def test_lien_puis_espace_public(client, demo: Session) -> None:  # noqa: ANN001
    e = _enrollment(demo)
    _, h = make_user(demo, "gestion")
    r = client.post(f"/api/v1/inscriptions/{e.id}/espace", headers=h)
    assert r.status_code == 200
    token = r.json()["lien"].rsplit("/espace/", 1)[1]
    page = client.get(f"/api/v1/public/espace/{token}")
    assert page.status_code == 200
    body = page.json()
    assert body["stagiaire"]["prenom"] == e.learner.first_name
    assert body["formation"]["reference"] == "SST-2026-02"
    assert "email" not in body["stagiaire"]  # rien d'autre que le prénom
    for doc in body["documents"]:
        assert "/api/public/documents/" in doc["lien"]
    tampered = token[:-1] + ("1" if token[-1] != "1" else "2")  # signature hexadécimale : toujours différente
    assert client.get(f"/api/v1/public/espace/{tampered}").status_code == 404
    assert client.get("/api/v1/public/espace/n-importe-quoi").status_code == 404


def test_droits_et_expiration(client, demo: Session) -> None:  # noqa: ANN001
    e = _enrollment(demo)
    _, hl = make_user(demo, "lecture")
    assert client.post(f"/api/v1/inscriptions/{e.id}/espace", headers=hl).status_code == 403
    token = espace.link(e).rsplit("/espace/", 1)[1]
    with pytest.raises(LinkClosed):
        espace.public_view(demo, token, today=espace.expires_on(e) + timedelta(days=1))
    assert espace.public_view(demo, token, today=espace.expires_on(e))["expire_le"]
