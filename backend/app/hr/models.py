"""Personnel, contrats, absences (schéma `rh`).

Un compte (qui se connecte) n'est pas un membre du personnel (qui travaille pour l'organisme) :
un formateur indépendant a un compte sans contrat de travail, un salarié peut n'avoir aucun compte.
Pas de paie ici. Les absences ne portent qu'une nature, jamais de motif médical détaillé.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id

R = {"schema": "rh"}
STAFF_KINDS = ("SALARIE", "INDEPENDANT", "SOUS_TRAITANT", "INTERIMAIRE", "STAGIAIRE")
CONTRACT_KINDS = ("CDI", "CDD", "INTERIM", "STAGE", "APPRENTISSAGE", "PRESTATION", "SOUS_TRAITANCE")
WORK_TIMES = ("TEMPS_PLEIN", "TEMPS_PARTIEL")
ABSENCE_KINDS = ("CONGE", "MALADIE", "FORMATION", "AUTRE")


class StaffMember(TimestampMixin, Base):
    __tablename__ = "staff_member"
    __table_args__ = R

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20), default="SALARIE")
    job_title: Mapped[str | None] = mapped_column(String(150))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("iam.user.id", ondelete="SET NULL"), unique=True)
    trainer_id: Mapped[str | None] = mapped_column(ForeignKey("formation.trainer.id", ondelete="SET NULL"), unique=True)

    contracts: Mapped[list["StaffContract"]] = relationship(back_populates="staff", cascade="all, delete-orphan",
                                                            order_by="StaffContract.start_date")
    absences: Mapped[list["StaffAbsence"]] = relationship(back_populates="staff", cascade="all, delete-orphan",
                                                          order_by="StaffAbsence.start_date")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class StaffContract(TimestampMixin, Base):
    __tablename__ = "staff_contract"
    __table_args__ = R

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    staff_id: Mapped[str] = mapped_column(ForeignKey("rh.staff_member.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)  # vide = sans terme (CDI)
    work_time: Mapped[str | None] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)

    staff: Mapped[StaffMember] = relationship(back_populates="contracts")

    def covers(self, start: date, end: date) -> bool:
        return self.start_date <= start and (self.end_date is None or self.end_date >= end)


class StaffAbsence(TimestampMixin, Base):
    __tablename__ = "staff_absence"
    __table_args__ = R

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    staff_id: Mapped[str] = mapped_column(ForeignKey("rh.staff_member.id", ondelete="CASCADE"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)

    staff: Mapped[StaffMember] = relationship(back_populates="absences")

    def overlaps(self, start: date, end: date) -> bool:
        return self.start_date <= end and self.end_date >= start
