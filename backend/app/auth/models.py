from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, new_id

ROLES = ("admin", "qualite", "assistant_qualite", "gestion", "lecture")


class User(TimestampMixin, Base):
    __tablename__ = "user"
    __table_args__ = {"schema": "iam"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="lecture")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
