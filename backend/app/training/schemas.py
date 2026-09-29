from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OrganizationIn(BaseModel):
    name: str | None = None
    nda_number: str | None = None
    siret: str | None = None
    action_categories: list[str] | None = None
    is_new_entrant: bool | None = None
    disability_referent_name: str | None = None
    disability_referent_email: str | None = None
    mobility_referent_name: str | None = None


class OrganizationOut(ORM):
    id: str
    name: str
    nda_number: str | None
    siret: str | None
    action_categories: list[str]
    is_new_entrant: bool
    disability_referent_name: str | None
    disability_referent_email: str | None
    mobility_referent_name: str | None


class ProgramIn(BaseModel):
    code: str | None = None
    title: str | None = None
    action_category: str | None = None
    is_certifying: bool | None = None
    rncp_code: str | None = None
    duration_hours: Decimal | None = None
    price_eur: Decimal | None = None
    prerequisites: list[str] | None = None
    objectives: list[str] | None = None
    content: str | None = None
    teaching_methods: str | None = None
    evaluation_methods: str | None = None
    access_delay: str | None = None
    accessibility_info: str | None = None
    certification_alignment: str | None = None
    public_info_reviewed_on: date | None = None
    success_rate: Decimal | None = None
    satisfaction_rate: Decimal | None = None


class ProgramOut(ORM):
    id: str
    code: str
    title: str
    action_category: str
    is_certifying: bool
    rncp_code: str | None
    duration_hours: Decimal | None
    price_eur: Decimal | None
    prerequisites: list[str]
    objectives: list[str]
    content: str | None
    teaching_methods: str | None
    evaluation_methods: str | None
    access_delay: str | None
    accessibility_info: str | None
    certification_alignment: str | None
    public_info_reviewed_on: date | None
    success_rate: Decimal | None
    satisfaction_rate: Decimal | None


class SessionIn(BaseModel):
    reference: str | None = None
    program_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    location: str | None = None
    room: str | None = None
    trainer_id: str | None = None
    capacity: int | None = None
    status: str | None = None
    subcontractor_id: str | None = None


class SessionOut(ORM):
    id: str
    reference: str
    program_id: str
    start_date: date
    end_date: date
    location: str | None
    room: str | None
    trainer_id: str | None
    capacity: int | None
    status: str


class PersonIn(BaseModel):
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    company_id: str | None = None


class LearnerOut(ORM):
    id: str
    first_name: str
    last_name: str
    email: str | None
    company_id: str | None


class TrainerIn(BaseModel):
    first_name: str
    last_name: str
    email: str | None = None
    is_external: bool = False
    specialties: list[str] = Field(default_factory=list)


class QualificationOut(ORM):
    id: str
    label: str
    obtained_on: date | None
    valid_until: date | None
    document_id: str | None


class TrainerOut(ORM):
    id: str
    first_name: str
    last_name: str
    email: str | None
    is_external: bool
    specialties: list[str]
    qualifications: list[QualificationOut] = []


class QualificationIn(BaseModel):
    label: str
    obtained_on: date | None = None
    valid_until: date | None = None
    document_id: str | None = None


class StaffDevelopmentIn(BaseModel):
    trainer_id: str | None = None
    label: str
    planned_on: date | None = None
    completed_on: date | None = None


class EnrollmentIn(BaseModel):
    learner_id: str
    company_id: str | None = None
    status: str = "INSCRIT"
    funding: str | None = None


class EnrollmentPatch(BaseModel):
    status: str | None = None
    funding: str | None = None
    abandoned_on: date | None = None
    abandon_reason: str | None = None


class NeedsAnalysisIn(BaseModel):
    completed_on: date | None = None
    summary: str | None = None
    adaptation_required: bool = False
    adaptation_status: str = "AUCUNE"
    adaptation_notes: str | None = None


class PositioningIn(BaseModel):
    method: str | None = None
    completed_on: date | None = None
    level: str | None = None
    prerequisites_met: bool | None = None


class ConvocationIn(BaseModel):
    sent_on: date | None = None
    document_id: str | None = None


class AgreementIn(BaseModel):
    kind: str = "CONVENTION"
    sent_on: date | None = None
    signed_on: date | None = None
    document_id: str | None = None


class AssessmentIn(BaseModel):
    kind: str = "FORMATIVE"
    label: str
    assessed_on: date
    score: Decimal | None = None
    passed: bool | None = None


class CertificateIn(BaseModel):
    kind: str = "ATTESTATION"
    issued_on: date
    document_id: str | None = None


class SlotsIn(BaseModel):
    """Génère les demi-journées entre les dates de la session (jours ouvrés)."""

    periods: list[str] = Field(default_factory=lambda: ["MATIN", "APRES_MIDI"])


class SignatureIn(BaseModel):
    enrollment_id: str
    present: bool = True
    signed_at: datetime | None = None


class SurveyIn(BaseModel):
    enrollment_id: str | None = None
    audience: str
    sent_on: date | None = None
    answered_on: date | None = None
    score: Decimal | None = None
    comment: str | None = None


class ComplaintIn(BaseModel):
    session_id: str | None = None
    kind: str = "RECLAMATION"
    stakeholder: str = "APPRENANT"
    received_on: date | None = None
    description: str | None = None
    acknowledged_on: date | None = None
    answered_on: date | None = None
    resolved_on: date | None = None
    resolution: str | None = None


class WatchIn(BaseModel):
    domain: str | None = None
    title: str | None = None
    source: str | None = None
    noted_on: date | None = None
    exploitation: str | None = None
    exploited_on: date | None = None


class SubcontractorIn(BaseModel):
    name: str | None = None
    siret: str | None = None
    qualiopi_certified: bool | None = None
    contract_signed_on: date | None = None
    last_review_on: date | None = None


class PartnerIn(BaseModel):
    kind: str
    name: str
    last_contact_on: date | None = None


class CompanyIn(BaseModel):
    name: str
    siret: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
