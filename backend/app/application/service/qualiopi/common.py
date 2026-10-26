from sqlalchemy import text
from sqlalchemy.orm import Session


def next_reference(db: Session, prefix: str, width: int = 6) -> str:
    """Référence lisible et unique (EV-000001…), atomique via UPSERT PostgreSQL."""
    value = db.execute(
        text(
            "INSERT INTO qualite.sequence (name, value) VALUES (:n, 1) "
            "ON CONFLICT (name) DO UPDATE SET value = qualite.sequence.value + 1 RETURNING value"
        ),
        {"n": prefix},
    ).scalar_one()
    return f"{prefix}-{value:0{width}d}"
