"""Réglages : valeurs typées, déclarées par chaque domaine, datées et journalisées.

- Un domaine déclare ses réglages (`SettingDef`) dans son propre module ; `DOMAIN_SETTINGS`
  ci-dessous les rassemble. Pas de clé libre : une clé non déclarée est refusée.
- Changer un réglage ajoute une ligne avec une date d'effet (aujourd'hui ou plus tard, jamais
  dans le passé) : une séance de février se lit avec les réglages de février.
- Un réglage marqué `regulatory` (conséquence sur la preuve, le financement, la conformité)
  exige un motif.
- Un réglage ne désactive jamais une règle métier : il choisit parmi les options qu'elle admet.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidStateError, NotFoundError
from app.events.publish import publish
from app.platform.features import is_enabled
from app.platform.models import SettingValue


@dataclass(frozen=True)
class SettingDef:
    key: str  # « domaine.nom »
    label: str
    type: Any  # type Python validé par Pydantic (bool, int, str, Literal…, modèle)
    default: Any
    feature: str  # fonctionnalité qui porte le réglage
    regulatory: bool = False
    help: str = ""

    @property
    def domain(self) -> str:
        return self.key.split(".", 1)[0]

    def adapter(self) -> TypeAdapter:
        return TypeAdapter(self.type)


def _registry() -> dict[str, SettingDef]:
    from app.attendance.settings import SETTINGS as attendance
    from app.platform.general import SETTINGS as general
    from app.qualiopi.settings import SETTINGS as quality
    from app.relances.settings import SETTINGS as relances
    from app.training.settings import SETTINGS as training

    out: dict[str, SettingDef] = {}
    for d in (*general, *training, *attendance, *quality, *relances):
        if d.key in out:
            raise ValueError(f"réglage déclaré deux fois : {d.key}")
        d.adapter().validate_python(d.default)
        out[d.key] = d
    return out


DOMAIN_SETTINGS: dict[str, SettingDef] = {}


def definitions() -> dict[str, SettingDef]:
    if not DOMAIN_SETTINGS:
        DOMAIN_SETTINGS.update(_registry())
    return DOMAIN_SETTINGS


def definition(key: str) -> SettingDef:
    d = definitions().get(key)
    if d is None:
        raise NotFoundError(f"Réglage inconnu : {key}")
    return d


class ConfigurationService:
    """Seul point de lecture et d'écriture des réglages pour les domaines."""

    def __init__(self, db: Session):
        self.db = db

    def _rows(self, key: str) -> list[SettingValue]:
        return list(self.db.scalars(
            select(SettingValue).where(SettingValue.key == key)
            .order_by(SettingValue.effective_from.desc(), SettingValue.created_at.desc())
        ))

    def get(self, key: str, at: date | None = None) -> Any:
        """Valeur en vigueur à la date `at` (aujourd'hui par défaut)."""
        d = definition(key)
        at = at or date.today()
        row = next((r for r in self._rows(key) if r.effective_from <= at), None)
        return d.adapter().validate_python(row.value) if row else d.default

    def set(self, key: str, value: Any, *, effective_from: date | None = None, reason: str | None = None,
            actor_id: str | None = None, today: date | None = None) -> SettingValue:
        d = definition(key)
        today = today or date.today()
        effective_from = effective_from or today
        if effective_from < today:
            raise InvalidStateError("Un réglage ne s'applique pas au passé : choisissez aujourd'hui ou une date future")
        if not is_enabled(self.db, d.feature):
            raise InvalidStateError(f"Réglage indisponible : la fonctionnalité « {d.feature} » est désactivée")
        if d.regulatory and not (reason or "").strip():
            raise InvalidStateError("Ce réglage a une conséquence réglementaire : indiquez le motif du changement")
        try:
            clean = d.adapter().validate_python(value)
        except ValidationError as e:
            raise InvalidStateError(f"{key} : valeur invalide ({e.errors()[0]['msg']})") from None
        row = SettingValue(key=key, value=d.adapter().dump_python(clean, mode="json"),
                           effective_from=effective_from, reason=reason)
        self.db.add(row)
        self.db.flush()
        publish(self.db, "settings.changed", "setting", row.id, actor_id=actor_id,
                payload={"key": key, "domain": d.domain, "effective_from": effective_from.isoformat()})
        return row

    def view(self, today: date | None = None) -> list[dict]:
        """Réglages des fonctionnalités actives, par domaine, avec la valeur en vigueur et la prochaine."""
        today = today or date.today()
        out = []
        for d in definitions().values():
            if not is_enabled(self.db, d.feature):
                continue
            rows = self._rows(d.key)
            current = next((r for r in rows if r.effective_from <= today), None)
            upcoming = sorted((r for r in rows if r.effective_from > today), key=lambda r: r.effective_from)
            out.append({
                "key": d.key, "domain": d.domain, "label": d.label, "help": d.help, "regulatory": d.regulatory,
                "schema": d.adapter().json_schema(), "default": d.adapter().dump_python(d.default, mode="json"),
                "value": current.value if current else d.adapter().dump_python(d.default, mode="json"),
                "since": current.effective_from.isoformat() if current else None,
                "next": {"value": upcoming[0].value, "from": upcoming[0].effective_from.isoformat()} if upcoming else None,
            })
        return out

    def history(self, key: str) -> list[dict]:
        definition(key)
        return [{"value": r.value, "effective_from": r.effective_from.isoformat(), "reason": r.reason,
                 "by": r.created_by, "at": r.created_at.isoformat()} for r in self._rows(key)]
