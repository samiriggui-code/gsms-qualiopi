"""Fabrique de routes CRUD pour les tables « simples » (une table = une ressource).

Chaque ressource expose :
  GET    /api/v1/<path>          liste (triée)
  GET    /api/v1/<path>/{id}     détail
  POST   /api/v1/<path>          création   (permission d'écriture)
  PATCH  /api/v1/<path>/{id}     mise à jour partielle
  DELETE /api/v1/<path>/{id}     suppression (refusée si la ligne est encore référencée)

Les écrans spécifiques (sessions, référentiel…) gardent leur propre routeur.
"""

from collections.abc import Callable
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, create_model
from sqlalchemy import inspect as sa_inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import DB, require
from app.core.errors import ConflictError, InvalidStateError, NotFoundError
from app.events.publish import publish

Serializer = Callable[[Session, list[Any]], list[dict]]


def to_dict(obj: Any) -> dict:
    """Colonnes de la ligne, prêtes pour JSON (Decimal → float)."""
    out = {}
    for attr in sa_inspect(obj).mapper.column_attrs:
        value = getattr(obj, attr.key)
        if isinstance(value, Decimal):
            value = float(value)
        out[attr.key] = value
    return out


def _partial(schema: type[BaseModel]) -> type[BaseModel]:
    fields = {name: (f.annotation | None, None) for name, f in schema.model_fields.items()}
    return create_model(f"{schema.__name__}Patch", **fields)  # type: ignore[call-overload]


def crud_router(
    *,
    model: type,
    path: str,
    schema_in: type[BaseModel],
    label: str,
    write_permission: str,
    order_by: list | None = None,
    event_entity: str | None = None,
    created_event: str | None = None,
    updated_event: str | None = None,
    serialize: Serializer | None = None,
    validate: Callable[[Session, dict], None] | None = None,
) -> APIRouter:
    router = APIRouter(prefix=f"/api/v1/{path}", tags=[label])
    schema_patch = _partial(schema_in)
    writer = Depends(require(write_permission))
    reader = Depends(require("read"))

    def dump(db: Session, rows: list[Any]) -> list[dict]:
        return serialize(db, rows) if serialize else [to_dict(r) for r in rows]

    def load(db: Session, item_id: str):
        obj = db.get(model, item_id)
        if obj is None:
            raise NotFoundError(f"{label} introuvable")
        return obj

    def commit(db: Session, *, flush_only: bool = False) -> None:
        try:
            db.flush() if flush_only else db.commit()
        except IntegrityError as exc:
            db.rollback()
            state = getattr(exc.orig, "sqlstate", "")
            column = getattr(getattr(exc.orig, "diag", None), "column_name", None)
            if state == "23502":
                raise InvalidStateError(f"Champ obligatoire manquant{f' : {column}' if column else ''}") from None
            if state == "23505":
                raise ConflictError("Cette valeur existe déjà") from None
            raise ConflictError(f"{label} : opération impossible, élément utilisé ailleurs") from None

    def emit(db: Session, name: str | None, obj: Any, user: User) -> None:
        if name:
            publish(
                db,
                name,
                event_entity or model.__tablename__,
                obj.id,
                session_id=getattr(obj, "session_id", None),
                program_id=getattr(obj, "program_id", None),
                actor_id=user.id,
            )

    @router.get("")
    def list_items(db: DB, _: User = reader) -> list[dict]:
        stmt = select(model)
        if order_by:
            stmt = stmt.order_by(*order_by)
        return dump(db, list(db.scalars(stmt).all()))

    @router.get("/{item_id}")
    def get_item(item_id: str, db: DB, _: User = reader) -> dict:
        return dump(db, [load(db, item_id)])[0]

    @router.post("", status_code=201)
    def create_item(body: schema_in, db: DB, user: User = writer) -> dict:  # type: ignore[valid-type]
        data = body.model_dump(exclude_none=True)
        if validate:
            validate(db, data)
        obj = model(**data)
        if hasattr(obj, "created_by"):
            obj.created_by = user.full_name
        db.add(obj)
        commit(db, flush_only=True)
        emit(db, created_event or updated_event, obj, user)
        commit(db)
        db.refresh(obj)
        return dump(db, [obj])[0]

    @router.patch("/{item_id}")
    def update_item(item_id: str, body: schema_patch, db: DB, user: User = writer) -> dict:  # type: ignore[valid-type]
        obj = load(db, item_id)
        data = body.model_dump(exclude_unset=True)
        if validate:
            validate(db, {**to_dict(obj), **data})
        for key, value in data.items():
            setattr(obj, key, value)
        emit(db, updated_event, obj, user)
        commit(db)
        db.refresh(obj)
        return dump(db, [obj])[0]

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: str, db: DB, user: User = writer) -> None:
        obj = load(db, item_id)
        db.delete(obj)
        commit(db)

    return router

