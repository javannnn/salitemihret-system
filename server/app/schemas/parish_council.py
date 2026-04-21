from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, root_validator, validator

from app.schemas.member import normalize_optional_member_phone

ParishCouncilDepartmentStatus = Literal["Active", "Inactive"]
ParishCouncilAssignmentStatus = Literal["Planned", "Active", "Completed", "Cancelled", "OnHold"]
ParishCouncilAssignmentApprovalStatus = Literal["Pending", "Approved", "Rejected"]
ParishCouncilApprovalAction = Literal["submit", "approve", "reject"]
ParishCouncilAuditEntityType = Literal["Department", "Assignment"]
ParishCouncilDocumentType = Literal["ApprovalForm", "TrainingMaterial", "Evaluation", "Notes", "Other"]

PARISH_COUNCIL_DEPARTMENT_STATUSES: tuple[ParishCouncilDepartmentStatus, ...] = ("Active", "Inactive")
PARISH_COUNCIL_ASSIGNMENT_STATUSES: tuple[ParishCouncilAssignmentStatus, ...] = (
    "Planned",
    "Active",
    "Completed",
    "Cancelled",
    "OnHold",
)
PARISH_COUNCIL_ASSIGNMENT_APPROVAL_STATUSES: tuple[ParishCouncilAssignmentApprovalStatus, ...] = (
    "Pending",
    "Approved",
    "Rejected",
)
PARISH_COUNCIL_DOCUMENT_TYPES: tuple[ParishCouncilDocumentType, ...] = (
    "ApprovalForm",
    "TrainingMaterial",
    "Evaluation",
    "Notes",
    "Other",
)


def _clean_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


class ParishCouncilMetaDepartment(BaseModel):
    id: int
    name: str
    status: ParishCouncilDepartmentStatus
    minimum_age: int


class ParishCouncilMemberSearchItem(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    birth_date: date | None = None


class ParishCouncilMetaResponse(BaseModel):
    departments: list[ParishCouncilMetaDepartment]
    department_statuses: list[ParishCouncilDepartmentStatus]
    assignment_statuses: list[ParishCouncilAssignmentStatus]
    approval_statuses: list[ParishCouncilAssignmentApprovalStatus]
    document_types: list[ParishCouncilDocumentType]


class ParishCouncilActivityOut(BaseModel):
    id: int
    entity_type: ParishCouncilAuditEntityType
    action: str
    summary: str
    actor_name: str | None = None
    created_at: datetime
    department_id: int | None = None
    assignment_id: int | None = None
    changes: list[str] = Field(default_factory=list)
    before_state: dict | None = None
    after_state: dict | None = None


class ParishCouncilDocumentOut(BaseModel):
    id: int
    department_id: int
    assignment_id: int | None = None
    document_type: ParishCouncilDocumentType
    title: str | None = None
    original_filename: str
    file_url: str
    content_type: str | None = None
    size_bytes: int
    notes: str | None = None
    uploaded_by_name: str | None = None
    assignment_label: str | None = None
    created_at: datetime


class ParishCouncilAssignmentOut(BaseModel):
    id: int
    department_id: int
    department_name: str
    trainee_member_id: int | None = None
    trainee_first_name: str
    trainee_last_name: str
    trainee_full_name: str
    trainee_email: str | None = None
    trainee_phone: str | None = None
    trainee_birth_date: date | None = None
    trainee_age: int | None = None
    training_from: date
    training_to: date
    status: ParishCouncilAssignmentStatus
    approval_status: ParishCouncilAssignmentApprovalStatus
    approval_requested_at: datetime | None = None
    approval_requested_by_name: str | None = None
    approval_decided_at: datetime | None = None
    approval_decided_by_name: str | None = None
    approval_note: str | None = None
    notes: str | None = None
    document_count: int = 0
    missing_contact_fields: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ParishCouncilDepartmentSummary(BaseModel):
    id: int
    name: str
    description: str | None = None
    status: ParishCouncilDepartmentStatus
    minimum_age: int
    lead_member_id: int | None = None
    lead_first_name: str | None = None
    lead_last_name: str | None = None
    lead_full_name: str | None = None
    lead_email: str | None = None
    lead_phone: str | None = None
    lead_term_start: date | None = None
    lead_term_end: date | None = None
    notes: str | None = None
    active_trainee_count: int = 0
    expiring_assignment_count: int = 0
    missing_contact_count: int = 0
    open_assignment_count: int = 0
    document_count: int = 0
    updated_at: datetime


class ParishCouncilDepartmentDetail(ParishCouncilDepartmentSummary):
    assignments: list[ParishCouncilAssignmentOut] = Field(default_factory=list)
    documents: list[ParishCouncilDocumentOut] = Field(default_factory=list)
    activity: list[ParishCouncilActivityOut] = Field(default_factory=list)


class ParishCouncilDepartmentListResponse(BaseModel):
    items: list[ParishCouncilDepartmentSummary]
    total: int


class ParishCouncilAssignmentListResponse(BaseModel):
    items: list[ParishCouncilAssignmentOut]
    total: int


class ParishCouncilUpcomingAssignmentOut(BaseModel):
    id: int
    department_id: int
    department_name: str
    trainee_full_name: str
    training_to: date
    status: ParishCouncilAssignmentStatus


class ParishCouncilDepartmentOccupancyItem(BaseModel):
    department_id: int
    department_name: str
    active_trainees: int
    open_assignments: int
    minimum_age: int
    status: ParishCouncilDepartmentStatus


class ParishCouncilOverviewSummary(BaseModel):
    total_departments: int
    active_departments: int
    active_leads: int
    active_trainees: int
    open_assignments: int
    expiring_assignments_30_days: int
    missing_contact_records: int
    total_documents: int
    underage_validation_issues: int
    pending_approvals: int


class ParishCouncilStatusBreakdownItem(BaseModel):
    label: str
    value: int


class ParishCouncilOverviewResponse(BaseModel):
    summary: ParishCouncilOverviewSummary
    status_breakdown: list[ParishCouncilStatusBreakdownItem] = Field(default_factory=list)
    department_occupancy: list[ParishCouncilDepartmentOccupancyItem] = Field(default_factory=list)
    upcoming_end_dates: list[ParishCouncilUpcomingAssignmentOut] = Field(default_factory=list)
    recent_activity: list[ParishCouncilActivityOut] = Field(default_factory=list)


class ParishCouncilDepartmentUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=1000)
    status: Optional[ParishCouncilDepartmentStatus] = None
    minimum_age: Optional[int] = Field(None, ge=0, le=99)
    lead_member_id: Optional[int] = None
    lead_first_name: Optional[str] = Field(None, max_length=100)
    lead_last_name: Optional[str] = Field(None, max_length=100)
    lead_email: Optional[EmailStr] = None
    lead_phone: Optional[str] = Field(None, max_length=40)
    lead_term_start: Optional[date] = None
    lead_term_end: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=2000)

    @validator("description", "notes", "lead_first_name", "lead_last_name")
    def clean_optional_text_fields(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @validator("lead_phone")
    def validate_lead_phone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_member_phone(value)

    @root_validator(skip_on_failure=True)
    def validate_term_window(cls, values: dict) -> dict:
        start = values.get("lead_term_start")
        end = values.get("lead_term_end")
        if start and end and end < start:
            raise ValueError("Lead term end date cannot be before the start date")
        return values


class ParishCouncilAssignmentCreate(BaseModel):
    department_id: int
    trainee_member_id: Optional[int] = None
    trainee_first_name: Optional[str] = Field(None, max_length=100)
    trainee_last_name: Optional[str] = Field(None, max_length=100)
    trainee_email: Optional[EmailStr] = None
    trainee_phone: Optional[str] = Field(None, max_length=40)
    trainee_birth_date: Optional[date] = None
    training_from: date
    training_to: date
    status: ParishCouncilAssignmentStatus = "Planned"
    notes: Optional[str] = Field(None, max_length=2000)
    allow_same_person: bool = False

    @validator("trainee_first_name", "trainee_last_name", "notes")
    def clean_assignment_text(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @validator("trainee_phone")
    def validate_trainee_phone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_member_phone(value)

    @root_validator(skip_on_failure=True)
    def validate_training_window(cls, values: dict) -> dict:
        start = values.get("training_from")
        end = values.get("training_to")
        if start and end and end < start:
            raise ValueError("Training end date cannot be before the start date")
        return values


class ParishCouncilAssignmentUpdate(BaseModel):
    department_id: Optional[int] = None
    trainee_member_id: Optional[int] = None
    trainee_first_name: Optional[str] = Field(None, max_length=100)
    trainee_last_name: Optional[str] = Field(None, max_length=100)
    trainee_email: Optional[EmailStr] = None
    trainee_phone: Optional[str] = Field(None, max_length=40)
    trainee_birth_date: Optional[date] = None
    training_from: Optional[date] = None
    training_to: Optional[date] = None
    status: Optional[ParishCouncilAssignmentStatus] = None
    notes: Optional[str] = Field(None, max_length=2000)
    allow_same_person: Optional[bool] = None

    @validator("trainee_first_name", "trainee_last_name", "notes")
    def clean_update_text(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @validator("trainee_phone")
    def validate_update_phone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_member_phone(value)

    @root_validator(skip_on_failure=True)
    def validate_update_window(cls, values: dict) -> dict:
        start = values.get("training_from")
        end = values.get("training_to")
        if start and end and end < start:
            raise ValueError("Training end date cannot be before the start date")
        return values


class ParishCouncilAssignmentApprovalUpdate(BaseModel):
    action: ParishCouncilApprovalAction
    note: Optional[str] = Field(None, max_length=1000)

    @validator("note")
    def clean_approval_note(cls, value: Optional[str]) -> Optional[str]:
        return _clean_optional_text(value)

    @root_validator(skip_on_failure=True)
    def validate_action_requirements(cls, values: dict) -> dict:
        action = values.get("action")
        note = values.get("note")
        if action == "reject" and not note:
            raise ValueError("A rejection note is required when rejecting an assignment")
        return values
