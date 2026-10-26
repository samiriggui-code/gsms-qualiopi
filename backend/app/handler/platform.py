"""API du socle : démarrage de l'application, fonctionnalités, réglages."""

from datetime import date
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.application.service.platform.features import enabled_features, feature_view, set_feature
from app.application.service.platform.settings import ConfigurationService
from app.errors.errors import InvalidStateError
from app.event.publish import publish
from app.middleware.auth import DB, CurrentUser, SettingsManager, permissions_of
from app.types import hr
from app.types import training as t

router = APIRouter(prefix="/api/v1", tags=["socle"])

# Entrées de navigation : visibles si la fonctionnalité est active ET la permission détenue.
NAVIGATION = (
    ("sessions", "Sessions", "training", "sessions.read"),
    ("mes_sessions", "Mes sessions", "training", "sessions.read_own"),
    ("emargement", "Émargement", "attendance", "attendance.write"),
    ("financement", "Financement", "funding", "funding.read"),
    ("personnel", "Personnel", "hr", "staff.read"),
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
    config = ConfigurationService(db)
    return {
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "roles": user.roles},
        "permissions": sorted(perms),
        "features": sorted(features),
        "organization": {"id": org.id, "name": org.name,
                         "short_name": config.get("general.brand_short_name") or org.name,
                         "brand_color": config.get("general.brand_color")} if org else None,
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


# ── Organisme ────────────────────────────────────────────────────────────────────
# Identité réglementaire de l'organisme. Les catégories d'actions et le statut de nouvel entrant
# changent l'applicabilité des indicateurs : la modification relance le moteur (organization.updated).
ACTION_CATEGORIES = {"AF": "Actions de formation", "BC": "Bilans de compétences", "VAE": "Validation des acquis de l'expérience",
                     "APPRENTISSAGE": "Actions de formation par apprentissage"}
ORG_FIELDS = ("name", "nda_number", "siret", "action_categories", "is_new_entrant", "disability_referent_name",
              "disability_referent_email", "mobility_referent_name")


def _org_view(org: t.Organization | None) -> dict:
    return {
        "existe": org is not None,
        "id": org.id if org else None,  # sujet du dossier de pièces ORGANISME
        **{f: getattr(org, f) if org else None for f in ORG_FIELDS},
        "categories_possibles": [{"code": k, "libelle": v} for k, v in ACTION_CATEGORIES.items()],
    }


# Listes de valeurs que l'API accepte en saisie : (code de la liste, libellé, constante de app/types/training.py, ou de
# app/types/hr.py si le nom commence par « hr. »).
VALUE_LISTS = (
    ("types_de_lieu", "Types de lieu", "PREMISES_KINDS"),
    ("statuts_de_lieu", "Statuts d'un lieu ou d'un équipement", "PLACE_STATUSES"),
    ("categories_d_equipement", "Catégories d'équipement", "EQUIPMENT_CATEGORIES"),
    ("types_de_partenaire", "Types de partenaire", "PARTNER_KINDS"),
    ("domaines_de_veille", "Domaines de veille", "WATCH_DOMAINS"),
    ("types_de_reclamation", "Types de réclamation", "COMPLAINT_KINDS"),
    ("parties_prenantes", "Parties prenantes d'une réclamation", "COMPLAINT_STAKEHOLDERS"),
    ("publics_d_enquete", "Publics d'une enquête de satisfaction", "SURVEY_AUDIENCES"),
    ("types_de_titre", "Types de titre d'un formateur", "QUALIFICATION_KINDS"),
    ("services_du_personnel", "Services du personnel", "hr.STAFF_SERVICES"),
)


@router.get("/listes-de-valeurs")
def value_lists(_: CurrentUser) -> list[dict]:
    """Listes code → libellé définies dans le code (lecture seule) : le front n'a pas à les recopier."""
    return [{"code": code, "libelle": label, "source": name,
             "valeurs": [{"code": k, "libelle": v} for k, v in
                         (getattr(hr, name[3:]) if name.startswith("hr.") else getattr(t, name)).items()]}
            for code, label, name in VALUE_LISTS]


@router.get("/organisme")
def get_organization(db: DB, _: CurrentUser) -> dict:
    return _org_view(db.scalar(select(t.Organization)))


class OrganizationIn(BaseModel):
    name: str | None = Field(None, max_length=200)
    nda_number: str | None = Field(None, max_length=40)
    siret: str | None = None
    action_categories: list[str] | None = None
    is_new_entrant: bool | None = None
    disability_referent_name: str | None = Field(None, max_length=200)
    disability_referent_email: str | None = Field(None, max_length=200)
    mobility_referent_name: str | None = Field(None, max_length=200)


@router.patch("/organisme")
def update_organization(body: OrganizationIn, db: DB, user: SettingsManager) -> dict:
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and not (changes["name"] or "").strip():
        raise InvalidStateError("Le nom de l'organisme est obligatoire")
    if "action_categories" in changes:
        cats = changes["action_categories"] or []
        unknown = set(cats) - set(ACTION_CATEGORIES)
        if unknown or not cats:
            raise InvalidStateError("Catégories d'actions : au moins une parmi AF, BC, VAE, APPRENTISSAGE")
        changes["action_categories"] = [c for c in ACTION_CATEGORIES if c in cats]
    if "siret" in changes and changes["siret"]:
        siret = changes["siret"].replace(" ", "")
        if not (siret.isdigit() and len(siret) == 14):
            raise InvalidStateError("SIRET : 14 chiffres")
        changes["siret"] = siret
    if "is_new_entrant" in changes and changes["is_new_entrant"] is None:
        raise InvalidStateError("Nouvel entrant : oui ou non")
    org = db.scalar(select(t.Organization))
    if org is None:
        if not changes.get("name"):
            raise InvalidStateError("Le nom de l'organisme est obligatoire")
        org = t.Organization(name=changes["name"], created_by=user.full_name)
        db.add(org)
    for field, value in changes.items():
        setattr(org, field, value.strip() if isinstance(value, str) else value)
    db.flush()
    publish(db, "organization.updated", "organization", org.id, actor_id=user.id, payload={"champs": sorted(changes)})
    db.commit()
    return _org_view(org)
