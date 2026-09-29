"""API du socle : démarrage de l'application, fonctionnalités, réglages."""

from datetime import date
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.security import DB, CurrentUser, SettingsManager, permissions_of
from app.platform.features import enabled_features, feature_view, set_feature
from app.platform.settings import ConfigurationService
from app.training import models as t

router = APIRouter(prefix="/api/v1", tags=["socle"])

# Entrées de navigation : visibles si la fonctionnalité est active ET la permission détenue.
NAVIGATION = (
    ("sessions", "Sessions", "training", "sessions.read"),
    ("qualite", "Qualité", "qualiopi", "quality.read"),
    ("dossiers", "Dossiers de pièces", "qualiopi", "quality.read"),
    ("journal", "Journal", "core", "journal.read"),
    ("equipe", "Équipe et rôles", "core", "users.manage"),
    ("parametres", "Paramètres", "core", "settings.manage"),
)


@router.get("/bootstrap")
def bootstrap(user: CurrentUser, db: DB) -> dict:
    """Chargé une fois au démarrage du front : qui, quel organisme, quels modules, quels droits."""
    perms = permissions_of(db, user)
    features = enabled_features(db)
    org = db.scalar(select(t.Organization))
    return {
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "roles": user.roles},
        "permissions": sorted(perms),
        "features": sorted(features),
        "organization": {"id": org.id, "name": org.name} if org else None,
        "navigation": [{"key": k, "label": label} for k, label, f, p in NAVIGATION if f in features and p in perms],
    }


@router.get("/features")
def list_features(db: DB, _: CurrentUser) -> list[dict]:
    return feature_view(db)


class FeatureIn(BaseModel):
    enabled: bool


@router.put("/features/{code}")
def toggle_feature(code: str, body: FeatureIn, db: DB, user: SettingsManager) -> dict:
    set_feature(db, code, body.enabled, actor_id=user.id)
    db.commit()
    return {"code": code, "enabled": code in enabled_features(db)}


@router.get("/settings")
def list_settings(db: DB, _: SettingsManager) -> list[dict]:
    return ConfigurationService(db).view()


@router.get("/settings/{key}/history")
def setting_history(key: str, db: DB, _: SettingsManager) -> list[dict]:
    return ConfigurationService(db).history(key)


class SettingIn(BaseModel):
    value: Any
    effective_from: date | None = None
    reason: str | None = None


@router.put("/settings/{key}")
def change_setting(key: str, body: SettingIn, db: DB, user: SettingsManager) -> dict:
    row = ConfigurationService(db).set(key, body.value, effective_from=body.effective_from, reason=body.reason,
                                       actor_id=user.id)
    db.commit()
    return {"key": key, "value": row.value, "effective_from": row.effective_from.isoformat()}
