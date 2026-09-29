"""Registre des fonctionnalités : quels modules existent pour cet organisme.

Deux sources : ce que le déploiement ou l'abonnement rend disponible (`FEATURES_AVAILABLE`,
réglé par l'éditeur GSMS) et ce que l'organisme active. Une fonctionnalité inactive retire
ses permissions à tous les comptes : ses routes, sa navigation et ses capacités disparaissent.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import InvalidStateError, NotFoundError
from app.events.publish import publish
from app.platform.models import FeatureState

CORE = "core"  # toujours active : comptes, réglages, journal


@dataclass(frozen=True)
class Feature:
    code: str
    label: str
    default: bool
    depends_on: tuple[str, ...] = ()
    built: bool = True  # False = prévue, pas encore construite : ne peut pas être activée


FEATURES: dict[str, Feature] = {f.code: f for f in (
    Feature("training", "Formations, sessions et inscriptions", True),
    Feature("qualiopi", "Moteur de préparation Qualiopi et dossiers de pièces", True, ("training",)),
    Feature("attendance", "Émargement électronique", True, ("training",)),
    Feature("hr", "Ressources humaines", False),
    Feature("funding", "Financement des formations", False, ("training",), built=False),
    Feature("funding.cpf", "CPF (EDOF)", False, ("funding",), built=False),
    Feature("funding.opco", "OPCO", False, ("funding",), built=False),
    Feature("funding.france_travail", "France Travail (AIF, POEI)", False, ("funding",), built=False),
    Feature("signature", "Signature électronique et preuve", False, built=False),
    Feature("lms", "Formation à distance", False, ("training",), built=False),
    Feature("agents", "Agents IA", False, built=False),
)}


def available() -> set[str]:
    raw = get_settings().features_available.strip()
    return set(FEATURES) if raw in ("", "*") else {c.strip() for c in raw.split(",") if c.strip()}


def enabled_features(db: Session) -> frozenset[str]:
    """Fonctionnalités actives (mises en cache sur la session de base de données)."""
    if "features" not in db.info:
        chosen = {s.feature: s.enabled for s in db.scalars(select(FeatureState))}
        avail = available()
        on: set[str] = set()
        # Les dépendances sont déclarées avant leurs dépendants dans FEATURES.
        for code, f in FEATURES.items():
            if f.built and code in avail and chosen.get(code, f.default) and all(d in on for d in f.depends_on):
                on.add(code)
        db.info["features"] = frozenset(on | {CORE})
    return db.info["features"]


def is_enabled(db: Session, code: str) -> bool:
    return code in enabled_features(db)


def forget(db: Session) -> None:
    db.info.pop("features", None)
    db.info.pop("permissions", None)


def set_feature(db: Session, code: str, enabled: bool, actor_id: str | None = None) -> None:
    f = FEATURES.get(code)
    if f is None:
        raise NotFoundError(f"Fonctionnalité inconnue : {code}")
    if enabled:
        if not f.built:
            raise InvalidStateError(f"{f.label} : fonctionnalité pas encore disponible dans GSMS")
        if code not in available():
            raise InvalidStateError(f"{f.label} : non incluse dans votre abonnement")
        missing = [d for d in f.depends_on if not is_enabled(db, d)]
        if missing:
            raise InvalidStateError(f"Activez d'abord : {', '.join(FEATURES[d].label for d in missing)}")
    else:
        dependents = [g.label for g in FEATURES.values() if code in g.depends_on and is_enabled(db, g.code)]
        if dependents:
            raise InvalidStateError(f"Désactivez d'abord : {', '.join(dependents)}")
    state = db.scalar(select(FeatureState).where(FeatureState.feature == code))
    if state is None:
        db.add(FeatureState(feature=code, enabled=enabled))
    else:
        state.enabled = enabled
    db.flush()
    forget(db)
    publish(db, "feature.changed", "feature", code, actor_id=actor_id, payload={"feature": code, "enabled": enabled})


def feature_view(db: Session) -> list[dict]:
    on = enabled_features(db)
    avail = available()
    return [{"code": f.code, "label": f.label, "enabled": f.code in on, "available": f.built and f.code in avail,
             "depends_on": list(f.depends_on)} for f in FEATURES.values()]
