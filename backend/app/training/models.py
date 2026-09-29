"""Domaine « organisme de formation » : la vie réelle de l'OF.

Ces tables ne connaissent pas Qualiopi. Elles produisent les données que le moteur
transforme en preuves potentielles. Schéma PostgreSQL : `formation`.
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, new_id

S = {"schema": "formation"}


def fk(table: str) -> ForeignKey:
    return ForeignKey(f"formation.{table}.id", ondelete="CASCADE")


class Organization(TimestampMixin, Base):
    """Paramètres de l'organisme (instance mono-organisme)."""

    __tablename__ = "organization"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    nda_number: Mapped[str | None] = mapped_column(String(40))
    siret: Mapped[str | None] = mapped_column(String(20))
    # Catégories d'actions certifiées : AF (action de formation), BC (bilan de compétences),
    # VAE, APPRENTISSAGE. Détermine l'applicabilité des indicateurs.
    action_categories: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["AF"])
    is_new_entrant: Mapped[bool] = mapped_column(Boolean, default=False)
    # Politique de l'organisme : la personne qui dépose une pièce peut-elle aussi la valider ?
    allow_self_validation: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    disability_referent_name: Mapped[str | None] = mapped_column(String(200))
    disability_referent_email: Mapped[str | None] = mapped_column(String(200))
    mobility_referent_name: Mapped[str | None] = mapped_column(String(200))


class Company(TimestampMixin, Base):
    __tablename__ = "company"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    siret: Mapped[str | None] = mapped_column(String(20))
    contact_name: Mapped[str | None] = mapped_column(String(200))
    contact_email: Mapped[str | None] = mapped_column(String(200))


class Learner(TimestampMixin, Base):
    __tablename__ = "learner"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(40))
    company_id: Mapped[str | None] = mapped_column(ForeignKey("formation.company.id", ondelete="SET NULL"))

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class Trainer(TimestampMixin, Base):
    __tablename__ = "trainer"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200))
    is_external: Mapped[bool] = mapped_column(Boolean, default=False)
    specialties: Mapped[list[str]] = mapped_column(JSON, default=list)

    qualifications: Mapped[list["TrainerQualification"]] = relationship(back_populates="trainer", cascade="all, delete-orphan")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class TrainerQualification(TimestampMixin, Base):
    """Diplôme, carte professionnelle, habilitation d'un intervenant (I21)."""

    __tablename__ = "trainer_qualification"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    trainer_id: Mapped[str] = mapped_column(fk("trainer"))
    label: Mapped[str] = mapped_column(String(200))
    obtained_on: Mapped[date | None] = mapped_column(Date)
    valid_until: Mapped[date | None] = mapped_column(Date)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("formation.document.id", ondelete="SET NULL"))

    trainer: Mapped[Trainer] = relationship(back_populates="qualifications")


class StaffDevelopmentAction(TimestampMixin, Base):
    """Développement des compétences des salariés / intervenants (I22)."""

    __tablename__ = "staff_development_action"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    trainer_id: Mapped[str | None] = mapped_column(fk("trainer"))
    label: Mapped[str] = mapped_column(String(200))
    planned_on: Mapped[date | None] = mapped_column(Date)
    completed_on: Mapped[date | None] = mapped_column(Date)


class Program(TimestampMixin, Base):
    """Formation (offre) : programme, objectifs, prérequis, information publique."""

    __tablename__ = "program"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    title: Mapped[str] = mapped_column(String(250))
    action_category: Mapped[str] = mapped_column(String(20), default="AF")
    is_certifying: Mapped[bool] = mapped_column(Boolean, default=False)
    rncp_code: Mapped[str | None] = mapped_column(String(40))
    duration_hours: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    price_eur: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    prerequisites: Mapped[list[str]] = mapped_column(JSON, default=list)
    objectives: Mapped[list[str]] = mapped_column(JSON, default=list)
    content: Mapped[str | None] = mapped_column(Text)
    teaching_methods: Mapped[str | None] = mapped_column(Text)
    evaluation_methods: Mapped[str | None] = mapped_column(Text)
    access_delay: Mapped[str | None] = mapped_column(String(200))
    accessibility_info: Mapped[str | None] = mapped_column(Text)
    certification_alignment: Mapped[str | None] = mapped_column(Text)
    public_info_reviewed_on: Mapped[date | None] = mapped_column(Date)
    success_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    satisfaction_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))


SESSION_STATUSES = ("PLANIFIEE", "CONFIRMEE", "EN_COURS", "TERMINEE", "CLOTUREE", "ANNULEE")


class TrainingSession(TimestampMixin, Base):
    __tablename__ = "session"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    program_id: Mapped[str] = mapped_column(fk("program"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    location: Mapped[str | None] = mapped_column(String(200))
    room: Mapped[str | None] = mapped_column(String(100))
    trainer_id: Mapped[str | None] = mapped_column(ForeignKey("formation.trainer.id", ondelete="SET NULL"))
    capacity: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="PLANIFIEE")
    subcontractor_id: Mapped[str | None] = mapped_column(ForeignKey("formation.subcontractor.id", ondelete="SET NULL"))

    program: Mapped[Program] = relationship()
    trainer: Mapped[Trainer | None] = relationship()
    enrollments: Mapped[list["Enrollment"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    attendance_slots: Mapped[list["AttendanceSlot"]] = relationship(back_populates="session", cascade="all, delete-orphan")


ENROLLMENT_STATUSES = ("INSCRIT", "CONFIRME", "ANNULE", "ABANDON", "TERMINE")


class Enrollment(TimestampMixin, Base):
    __tablename__ = "enrollment"
    __table_args__ = (UniqueConstraint("session_id", "learner_id"), S)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(fk("session"))
    learner_id: Mapped[str] = mapped_column(fk("learner"))
    company_id: Mapped[str | None] = mapped_column(ForeignKey("formation.company.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), default="INSCRIT")
    funding: Mapped[str | None] = mapped_column(String(60))
    abandoned_on: Mapped[date | None] = mapped_column(Date)
    abandon_reason: Mapped[str | None] = mapped_column(Text)

    session: Mapped[TrainingSession] = relationship(back_populates="enrollments")
    learner: Mapped[Learner] = relationship()
    needs_analysis: Mapped["NeedsAnalysis | None"] = relationship(back_populates="enrollment", cascade="all, delete-orphan", uselist=False)
    positioning: Mapped["Positioning | None"] = relationship(back_populates="enrollment", cascade="all, delete-orphan", uselist=False)
    convocation: Mapped["Convocation | None"] = relationship(back_populates="enrollment", cascade="all, delete-orphan", uselist=False)
    agreement: Mapped["Agreement | None"] = relationship(back_populates="enrollment", cascade="all, delete-orphan", uselist=False)
    assessments: Mapped[list["Assessment"]] = relationship(back_populates="enrollment", cascade="all, delete-orphan")
    certificate: Mapped["Certificate | None"] = relationship(back_populates="enrollment", cascade="all, delete-orphan", uselist=False)
    signatures: Mapped[list["AttendanceSignature"]] = relationship(back_populates="enrollment", cascade="all, delete-orphan")


ADAPTATION_STATUSES = ("AUCUNE", "A_TRAITER", "VALIDEE", "MISE_EN_OEUVRE")


class NeedsAnalysis(TimestampMixin, Base):
    """Analyse du besoin du bénéficiaire (I04) + besoin d'adaptation (I10, I26)."""

    __tablename__ = "needs_analysis"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    enrollment_id: Mapped[str] = mapped_column(fk("enrollment"), unique=True)
    completed_on: Mapped[date | None] = mapped_column(Date)
    summary: Mapped[str | None] = mapped_column(Text)
    adaptation_required: Mapped[bool] = mapped_column(Boolean, default=False)
    adaptation_status: Mapped[str] = mapped_column(String(20), default="AUCUNE")
    adaptation_notes: Mapped[str | None] = mapped_column(Text)

    enrollment: Mapped[Enrollment] = relationship(back_populates="needs_analysis")


class Positioning(TimestampMixin, Base):
    """Positionnement / évaluation des acquis à l'entrée (I08)."""

    __tablename__ = "positioning"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    enrollment_id: Mapped[str] = mapped_column(fk("enrollment"), unique=True)
    method: Mapped[str | None] = mapped_column(String(100))
    completed_on: Mapped[date | None] = mapped_column(Date)
    level: Mapped[str | None] = mapped_column(String(100))
    prerequisites_met: Mapped[bool | None] = mapped_column(Boolean)

    enrollment: Mapped[Enrollment] = relationship(back_populates="positioning")


class Convocation(TimestampMixin, Base):
    """Convocation : conditions de déroulement communiquées (I09)."""

    __tablename__ = "convocation"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    enrollment_id: Mapped[str] = mapped_column(fk("enrollment"), unique=True)
    sent_on: Mapped[date | None] = mapped_column(Date)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("formation.document.id", ondelete="SET NULL"))

    enrollment: Mapped[Enrollment] = relationship(back_populates="convocation")


class Agreement(TimestampMixin, Base):
    """Convention ou contrat de formation."""

    __tablename__ = "agreement"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    enrollment_id: Mapped[str] = mapped_column(fk("enrollment"), unique=True)
    kind: Mapped[str] = mapped_column(String(20), default="CONVENTION")
    sent_on: Mapped[date | None] = mapped_column(Date)
    signed_on: Mapped[date | None] = mapped_column(Date)
    signed_by: Mapped[str | None] = mapped_column(String(200))  # signataire côté client (repris du Contract de Frappe)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("formation.document.id", ondelete="SET NULL"))

    enrollment: Mapped[Enrollment] = relationship(back_populates="agreement")


class AttendanceSlot(TimestampMixin, Base):
    """Demi-journée de formation à émarger."""

    __tablename__ = "attendance_slot"
    __table_args__ = (UniqueConstraint("session_id", "day", "period"), S)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(fk("session"))
    day: Mapped[date] = mapped_column(Date)
    period: Mapped[str] = mapped_column(String(10), default="MATIN")  # MATIN | APRES_MIDI
    trainer_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[TrainingSession] = relationship(back_populates="attendance_slots")
    signatures: Mapped[list["AttendanceSignature"]] = relationship(back_populates="slot", cascade="all, delete-orphan")


class AttendanceSignature(TimestampMixin, Base):
    __tablename__ = "attendance_signature"
    __table_args__ = (UniqueConstraint("slot_id", "enrollment_id"), S)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    slot_id: Mapped[str] = mapped_column(fk("attendance_slot"))
    enrollment_id: Mapped[str] = mapped_column(fk("enrollment"))
    present: Mapped[bool] = mapped_column(Boolean, default=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    slot: Mapped[AttendanceSlot] = relationship(back_populates="signatures")
    enrollment: Mapped[Enrollment] = relationship(back_populates="signatures")


class Assessment(TimestampMixin, Base):
    """Évaluation formative ou sommative (I11)."""

    __tablename__ = "assessment"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    enrollment_id: Mapped[str] = mapped_column(fk("enrollment"))
    kind: Mapped[str] = mapped_column(String(20), default="FORMATIVE")  # FORMATIVE | SOMMATIVE | EXAMEN
    label: Mapped[str] = mapped_column(String(200))
    assessed_on: Mapped[date] = mapped_column(Date)
    score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    passed: Mapped[bool | None] = mapped_column(Boolean)

    enrollment: Mapped[Enrollment] = relationship(back_populates="assessments")


class Certificate(TimestampMixin, Base):
    """Attestation de fin de formation ou certificat (I11, I16)."""

    __tablename__ = "certificate"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    enrollment_id: Mapped[str] = mapped_column(fk("enrollment"), unique=True)
    kind: Mapped[str] = mapped_column(String(20), default="ATTESTATION")
    issued_on: Mapped[date] = mapped_column(Date)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("formation.document.id", ondelete="SET NULL"))

    enrollment: Mapped[Enrollment] = relationship(back_populates="certificate")


SURVEY_AUDIENCES = ("APPRENANT_CHAUD", "APPRENANT_FROID", "ENTREPRISE", "FORMATEUR", "FINANCEUR")


class SatisfactionSurvey(TimestampMixin, Base):
    """Recueil des appréciations (I30)."""

    __tablename__ = "satisfaction_survey"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(fk("session"))
    enrollment_id: Mapped[str | None] = mapped_column(fk("enrollment"))
    audience: Mapped[str] = mapped_column(String(20))
    sent_on: Mapped[date | None] = mapped_column(Date)
    answered_on: Mapped[date | None] = mapped_column(Date)
    score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))  # sur 5
    comment: Mapped[str | None] = mapped_column(Text)


class Complaint(TimestampMixin, Base):
    """Réclamation, difficulté ou aléa (I31)."""

    __tablename__ = "complaint"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("formation.session.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(20), default="RECLAMATION")  # RECLAMATION | DIFFICULTE | ALEA
    stakeholder: Mapped[str] = mapped_column(String(20), default="APPRENANT")
    received_on: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(Text)
    acknowledged_on: Mapped[date | None] = mapped_column(Date)
    answered_on: Mapped[date | None] = mapped_column(Date)
    resolved_on: Mapped[date | None] = mapped_column(Date)
    resolution: Mapped[str | None] = mapped_column(Text)


class WatchItem(TimestampMixin, Base):
    """Veille (I23 légale, I24 métiers, I25 pédagogique)."""

    __tablename__ = "watch_item"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    domain: Mapped[str] = mapped_column(String(20))  # LEGALE | METIERS | PEDAGOGIQUE
    title: Mapped[str] = mapped_column(String(250))
    source: Mapped[str | None] = mapped_column(String(300))
    noted_on: Mapped[date] = mapped_column(Date)
    exploitation: Mapped[str | None] = mapped_column(Text)
    exploited_on: Mapped[date | None] = mapped_column(Date)


class Subcontractor(TimestampMixin, Base):
    """Sous-traitant / portage (I27)."""

    __tablename__ = "subcontractor"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    siret: Mapped[str | None] = mapped_column(String(20))
    qualiopi_certified: Mapped[bool] = mapped_column(Boolean, default=False)
    contract_signed_on: Mapped[date | None] = mapped_column(Date)
    last_review_on: Mapped[date | None] = mapped_column(Date)


class PartnerNetwork(TimestampMixin, Base):
    """Réseau handicap (I26) et partenaires socio-économiques (I28)."""

    __tablename__ = "partner"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(20))  # HANDICAP | SOCIO_ECONOMIQUE
    name: Mapped[str] = mapped_column(String(200))
    last_contact_on: Mapped[date | None] = mapped_column(Date)


class Document(TimestampMixin, Base):
    """Document traçable : version, auteur, empreinte, statut, signature."""

    __tablename__ = "document"
    __table_args__ = S

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(40))  # CONVOCATION, CONVENTION, ATTESTATION, PROGRAMME, PROCEDURE, ...
    title: Mapped[str] = mapped_column(String(250))
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(36))
    session_id: Mapped[str | None] = mapped_column(ForeignKey("formation.session.id", ondelete="SET NULL"))
    program_id: Mapped[str | None] = mapped_column(ForeignKey("formation.program.id", ondelete="SET NULL"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    previous_version_id: Mapped[str | None] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(20), default="BROUILLON")  # BROUILLON | EMIS | SIGNE | REMPLACE
    author_id: Mapped[str | None] = mapped_column(String(36))
    mime_type: Mapped[str] = mapped_column(String(80), default="text/html")
    storage_path: Mapped[str | None] = mapped_column(String(400))
    sha256: Mapped[str | None] = mapped_column(String(64))
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signed_by: Mapped[str | None] = mapped_column(String(200))
    indicator_hints: Mapped[list[int]] = mapped_column(JSON, default=list)
    # Pièce de dossier : FICHIER déposé, ou PAPIER déclaré (l'original est conservé hors GSMS).
    support: Mapped[str] = mapped_column(String(20), default="FICHIER", server_default="FICHIER")
    # Grille cochée par la personne qui dépose, figée avec la version (question posée comprise).
    checklist: Mapped[dict | None] = mapped_column(JSON)
    checklist_note: Mapped[str | None] = mapped_column(Text)
    # Pièce d'un dossier (code de config/dossiers) ; entity_type = ORGANISME | FORMATEUR
    requirement: Mapped[str | None] = mapped_column(String(60), index=True)
    original_name: Mapped[str | None] = mapped_column(String(250))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
