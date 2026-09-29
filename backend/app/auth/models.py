from sqlalchemy import JSON, Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id


class User(TimestampMixin, Base):
    __tablename__ = "user"
    __table_args__ = {"schema": "iam"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    role_links: Mapped[list["UserRole"]] = relationship(back_populates="user", cascade="all, delete-orphan", lazy="selectin")

    @property
    def roles(self) -> list[str]:
        return sorted(link.role for link in self.role_links)


class UserRole(TimestampMixin, Base):
    """Rôle attribué à un compte (plusieurs rôles possibles, comme dans Frappe)."""

    __tablename__ = "user_role"
    __table_args__ = (UniqueConstraint("user_id", "role"), {"schema": "iam"})

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("iam.user.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(40))  # rôle système ou code d'un rôle personnalisé

    user: Mapped[User] = relationship(back_populates="role_links")


class CustomRole(TimestampMixin, Base):
    """Rôle créé par l'organisme en cochant des permissions du catalogue."""

    __tablename__ = "role"
    __table_args__ = {"schema": "iam"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    label: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)
