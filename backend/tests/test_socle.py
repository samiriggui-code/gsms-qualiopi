"""Socle de configuration : réglages datés, fonctionnalités, rôles personnalisés, démarrage du front."""

from datetime import date, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError, NotFoundError
from app.core.journal import ChangeLog
from app.events.models import OutboxEvent
from app.platform.features import enabled_features, set_feature
from app.platform.settings import ConfigurationService, definitions
from tests.conftest import make_user

KEY = "quality.allow_self_validation"
TODAY = date.today()


# ── Réglages ─────────────────────────────────────────────────────────────────────


def test_valeur_par_defaut_puis_valeur_datee(db: Session) -> None:
    config = ConfigurationService(db)
    assert config.get(KEY) is False, "défaut déclaré par le domaine"
    config.set(KEY, True, effective_from=TODAY + timedelta(days=10), reason="Petite équipe à partir du mois prochain")
    db.commit()
    assert config.get(KEY) is False, "pas encore en vigueur"
    assert config.get(KEY, at=TODAY + timedelta(days=10)) is True
    vue = next(v for v in config.view() if v["key"] == KEY)
    assert vue["value"] is False and vue["next"]["value"] is True


def test_reglage_jamais_retroactif_type_et_motif_verifies(db: Session) -> None:
    config = ConfigurationService(db)
    with pytest.raises(InvalidStateError, match="passé"):
        config.set(KEY, True, effective_from=TODAY - timedelta(days=1), reason="x")
    with pytest.raises(InvalidStateError, match="motif"):
        config.set(KEY, True)
    with pytest.raises(InvalidStateError, match="valeur invalide"):
        config.set(KEY, "peut-être", reason="x")
    with pytest.raises(InvalidStateError, match="valeur invalide"):
        config.set("general.timezone", "Mars/Olympus")
    with pytest.raises(NotFoundError):
        config.set("quality.indicateur_12_obligatoire", False)


def test_changement_journalise_et_publie(db: Session) -> None:
    ConfigurationService(db).set(KEY, True, reason="Équipe de deux personnes")
    db.commit()
    assert db.scalar(select(ChangeLog).where(ChangeLog.table_name == "config.setting_value")) is not None
    ev = db.scalar(select(OutboxEvent).where(OutboxEvent.name == "settings.changed"))
    assert ev.payload["key"] == KEY and ev.payload["domain"] == "quality"


def test_chaque_reglage_declare_a_un_defaut_valide() -> None:
    for d in definitions().values():
        d.adapter().validate_python(d.default)
        assert "." in d.key and d.label


# ── Fonctionnalités ─────────────────────────────────────────────────────────────


def test_fonctionnalites_par_defaut_et_dependances(db: Session) -> None:
    on = enabled_features(db)
    assert {"core", "training", "qualiopi"} <= on and "funding" not in on
    with pytest.raises(InvalidStateError, match="pas encore disponible"):
        set_feature(db, "signature", True)
    with pytest.raises(InvalidStateError, match="Activez d'abord"):
        set_feature(db, "funding.cpf", True)
    with pytest.raises(InvalidStateError, match="Désactivez d'abord"):
        set_feature(db, "training", False)


def test_desactiver_qualiopi_retire_ses_droits(client, db: Session) -> None:  # noqa: ANN001
    _, headers = make_user(db, "qualite")
    assert client.get("/api/v1/qualiopi/echeances", headers=headers).status_code == 200
    r = client.put("/api/v1/features/qualiopi", json={"enabled": False}, headers=headers)
    assert r.status_code == 200 and r.json()["enabled"] is False
    assert client.get("/api/v1/qualiopi/echeances", headers=headers).status_code == 403
    nav = [n["key"] for n in client.get("/api/v1/bootstrap", headers=headers).json()["navigation"]]
    assert "qualite" not in nav and "parametres" in nav
    domains = {v["domain"] for v in client.get("/api/v1/settings", headers=headers).json()}
    assert "quality" not in domains and "general" in domains, "les réglages qualité disparaissent avec le module"


# ── Rôles personnalisés et démarrage ────────────────────────────────────────────


def test_role_personnalise_cree_par_l_organisme(client, db: Session) -> None:  # noqa: ANN001
    _, hq = make_user(db, "qualite")
    staff, _ = make_user(db, "lecture", email="relecteur@test.local")
    r = client.post("/api/v1/auth/roles", headers=hq, json={
        "code": "relecteur_qualite", "label": "Relecteur qualité",
        "permissions": ["quality.read", "evidence.validate"]})
    assert r.status_code == 201
    assert client.post("/api/v1/auth/roles", headers=hq, json={
        "code": "chef_formations", "label": "Chef", "permissions": ["sessions.write"]}).status_code == 403, "anti-escalade"
    assert client.post("/api/v1/auth/roles", headers=hq, json={
        "code": "x_inconnu", "label": "X", "permissions": ["tout.faire"]}).status_code == 422
    assert client.put(f"/api/v1/auth/users/{staff.id}/roles", headers=hq, json={"roles": ["relecteur_qualite"]}).status_code == 200

    from app.auth.security import create_token

    hs = {"Authorization": f"Bearer {create_token(staff)}"}
    boot = client.get("/api/v1/bootstrap", headers=hs).json()
    assert boot["user"]["roles"] == ["relecteur_qualite"]
    assert boot["permissions"] == ["evidence.validate", "quality.read"]
    assert [n["key"] for n in boot["navigation"]] == ["qualite", "dossiers"]
    assert client.delete("/api/v1/auth/roles/relecteur_qualite", headers=hq).status_code == 409, "rôle encore attribué"
    assert client.put("/api/v1/auth/roles/qualite", headers=hq, json={"label": "X"}).status_code == 403, "rôle système"
