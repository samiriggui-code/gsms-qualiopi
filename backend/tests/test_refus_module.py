"""Refus d'accès lisibles : un module éteint est nommé, avec l'endroit où le rallumer."""

from sqlalchemy.orm import Session

from app.application.service.platform.features import set_feature
from tests.conftest import make_user


def test_module_desactive_nomme_dans_le_refus(client, demo: Session) -> None:  # noqa: ANN001
    set_feature(demo, "relances", False)
    demo.commit()
    _, h = make_user(demo, "admin", email="admin-module@test.local")
    r = client.get("/api/v1/communications", headers=h)
    assert r.status_code == 403
    assert "désactivé" in r.json()["detail"] and "Paramètres" in r.json()["detail"]


def test_droit_absent_reste_un_refus_de_permission(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "formateur", email="f-refus@test.local")
    r = client.get("/api/v1/journal/recent", headers=h)
    assert r.status_code == 403 and "Permission" in r.json()["detail"]
