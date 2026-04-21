from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import require_roles
from app.config import PARISH_COUNCIL_DOCUMENT_UPLOAD_DIR, UPLOAD_DIR
from app.core.db import get_db
from app.models.member import Member
from app.models.parish_council import (
    ParishCouncilAssignment,
    ParishCouncilAuditEvent,
    ParishCouncilDepartment,
    ParishCouncilDocument,
)
from app.models.user import User
from app.schemas.parish_council import (
    PARISH_COUNCIL_ASSIGNMENT_APPROVAL_STATUSES,
    PARISH_COUNCIL_ASSIGNMENT_STATUSES,
    PARISH_COUNCIL_DEPARTMENT_STATUSES,
    PARISH_COUNCIL_DOCUMENT_TYPES,
    ParishCouncilActivityOut,
    ParishCouncilAssignmentApprovalUpdate,
    ParishCouncilAssignmentCreate,
    ParishCouncilAssignmentListResponse,
    ParishCouncilAssignmentOut,
    ParishCouncilAssignmentUpdate,
    ParishCouncilDepartmentDetail,
    ParishCouncilDepartmentListResponse,
    ParishCouncilDepartmentSummary,
    ParishCouncilDepartmentUpdate,
    ParishCouncilDocumentOut,
    ParishCouncilMetaDepartment,
    ParishCouncilMetaResponse,
    ParishCouncilMemberSearchItem,
    ParishCouncilOverviewResponse,
)
from app.services import parish_councils as parish_council_service

READ_ROLES = ("Admin", "OfficeAdmin", "ParishCouncilAdmin")
WRITE_ROLES = ("Admin", "ParishCouncilAdmin")
MAX_DOCUMENT_SIZE_BYTES = 8 * 1024 * 1024
ALLOWED_DOCUMENT_MIME_TYPES = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
}

router = APIRouter(prefix="/parish-councils", tags=["parish-councils"])


@router.get("/member-search", response_model=list[ParishCouncilMemberSearchItem])
def parish_council_member_search(
    query: str = Query(..., min_length=1),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[ParishCouncilMemberSearchItem]:
    keyword = f"%{query.strip().lower()}%"
    rows = (
        db.query(Member)
        .filter(Member.deleted_at.is_(None))
        .filter(
            or_(
                func.lower(Member.first_name).like(keyword),
                func.lower(Member.last_name).like(keyword),
                func.lower(Member.email).like(keyword),
                func.lower(Member.username).like(keyword),
            )
        )
        .order_by(Member.first_name.asc(), Member.last_name.asc(), Member.id.asc())
        .limit(limit)
        .all()
    )
    return [
        ParishCouncilMemberSearchItem(
            id=item.id,
            first_name=item.first_name,
            last_name=item.last_name,
            email=item.email,
            phone=item.phone,
            birth_date=item.birth_date,
        )
        for item in rows
    ]


def _department_or_404(db: Session, department_id: int) -> ParishCouncilDepartment:
    department = parish_council_service.load_department_detail(db, department_id)
    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parish council department not found")
    return department


def _assignment_or_404(db: Session, assignment_id: int) -> ParishCouncilAssignment:
    assignment = parish_council_service.load_assignment_detail(db, assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parish council assignment not found")
    return assignment


def _document_or_404(db: Session, document_id: int) -> ParishCouncilDocument:
    document = (
        db.query(ParishCouncilDocument)
        .filter(ParishCouncilDocument.id == document_id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parish council document not found")
    return document


def _member_or_400(db: Session, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if not member or member.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Linked member not found")
    return member


def _relative_document_path(filename: str) -> str:
    return filename


def _is_within_root(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return True


def _resolve_upload_path(relative_path: str | None) -> Path | None:
    if not relative_path:
        return None
    document_root = PARISH_COUNCIL_DOCUMENT_UPLOAD_DIR.resolve()
    uploads_root = UPLOAD_DIR.parent.resolve()
    raw_path = Path(relative_path)

    if raw_path.is_absolute():
        candidate = raw_path.resolve()
        if _is_within_root(candidate, document_root) or _is_within_root(candidate, uploads_root):
            return candidate
        return None

    if len(raw_path.parts) == 1:
        candidate = (document_root / raw_path).resolve()
        return candidate if _is_within_root(candidate, document_root) else None

    candidate = (uploads_root / raw_path).resolve()
    return candidate if _is_within_root(candidate, uploads_root) else None


def _delete_file_if_exists(relative_path: str | None) -> None:
    absolute_path = _resolve_upload_path(relative_path)
    if absolute_path is None:
        return
    try:
        absolute_path.unlink(missing_ok=True)
    except OSError:
        return


def _normalized_name_key(first_name: str | None, last_name: str | None) -> tuple[str, str]:
    return (
        (first_name or "").strip().lower(),
        (last_name or "").strip().lower(),
    )


def _same_person(
    *,
    department: ParishCouncilDepartment,
    trainee_member_id: int | None,
    trainee_first_name: str | None,
    trainee_last_name: str | None,
    trainee_email: str | None,
    trainee_phone: str | None,
) -> bool:
    if department.lead_member_id and trainee_member_id and department.lead_member_id == trainee_member_id:
        return True

    lead_name = _normalized_name_key(department.lead_first_name, department.lead_last_name)
    trainee_name = _normalized_name_key(trainee_first_name, trainee_last_name)
    if not any(lead_name) or not any(trainee_name) or lead_name != trainee_name:
        return False

    if department.lead_email and trainee_email and department.lead_email.strip().lower() == trainee_email.strip().lower():
        return True
    if department.lead_phone and trainee_phone and department.lead_phone.strip() == trainee_phone.strip():
        return True
    return False


def _validate_assignment_overlap(
    db: Session,
    *,
    department_id: int,
    trainee_member_id: int | None,
    trainee_first_name: str,
    trainee_last_name: str,
    training_from: date,
    training_to: date,
    exclude_assignment_id: int | None = None,
) -> None:
    query = (
        db.query(ParishCouncilAssignment)
        .filter(
            ParishCouncilAssignment.department_id == department_id,
            ParishCouncilAssignment.training_from <= training_to,
            ParishCouncilAssignment.training_to >= training_from,
            ParishCouncilAssignment.status.in_(tuple(parish_council_service.OPEN_ASSIGNMENT_STATUSES)),
        )
    )
    if exclude_assignment_id:
        query = query.filter(ParishCouncilAssignment.id != exclude_assignment_id)
    if trainee_member_id:
        query = query.filter(ParishCouncilAssignment.trainee_member_id == trainee_member_id)
    else:
        query = query.filter(
            func.lower(ParishCouncilAssignment.trainee_first_name) == trainee_first_name.strip().lower(),
            func.lower(ParishCouncilAssignment.trainee_last_name) == trainee_last_name.strip().lower(),
        )

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This trainee already has an overlapping open assignment in the selected department",
        )


def _resolve_department_lead_values(
    db: Session,
    department: ParishCouncilDepartment,
    payload: ParishCouncilDepartmentUpdate,
) -> dict[str, object]:
    fields_set = payload.__fields_set__
    lead_member_id = payload.lead_member_id if "lead_member_id" in fields_set else department.lead_member_id
    linked_member_changed = "lead_member_id" in fields_set and lead_member_id != department.lead_member_id
    member = _member_or_400(db, lead_member_id) if lead_member_id else None

    def _pick(field_name: str, current_value: object, member_value: object | None = None) -> object:
        if field_name in fields_set:
            return getattr(payload, field_name)
        if linked_member_changed:
            return member_value
        return current_value

    return {
        "lead_member_id": lead_member_id,
        "lead_first_name": _pick("lead_first_name", department.lead_first_name, member.first_name if member else None),
        "lead_last_name": _pick("lead_last_name", department.lead_last_name, member.last_name if member else None),
        "lead_email": _pick("lead_email", department.lead_email, member.email if member else None),
        "lead_phone": _pick("lead_phone", department.lead_phone, member.phone if member else None),
    }


def _resolve_assignment_values(
    db: Session,
    *,
    department: ParishCouncilDepartment,
    payload: ParishCouncilAssignmentCreate | ParishCouncilAssignmentUpdate,
    existing: ParishCouncilAssignment | None = None,
) -> dict[str, object]:
    fields_set = payload.__fields_set__
    current_member_id = existing.trainee_member_id if existing else None
    trainee_member_id = payload.trainee_member_id if "trainee_member_id" in fields_set else current_member_id
    linked_member_changed = "trainee_member_id" in fields_set and trainee_member_id != current_member_id
    member = _member_or_400(db, trainee_member_id) if trainee_member_id else None

    def _current(field_name: str):
        if existing is None:
            return None
        return getattr(existing, field_name)

    def _pick(field_name: str, member_value: object | None = None):
        if field_name in fields_set:
            return getattr(payload, field_name)
        if existing is None or linked_member_changed:
            return member_value
        return _current(field_name)

    values = {
        "department_id": (
            payload.department_id
            if "department_id" in fields_set and payload.department_id is not None
            else (existing.department_id if existing else department.id)
        ),
        "trainee_member_id": trainee_member_id,
        "trainee_first_name": _pick("trainee_first_name", member.first_name if member else None),
        "trainee_last_name": _pick("trainee_last_name", member.last_name if member else None),
        "trainee_email": _pick("trainee_email", member.email if member else None),
        "trainee_phone": _pick("trainee_phone", member.phone if member else None),
        "trainee_birth_date": _pick("trainee_birth_date", member.birth_date if member else None),
        "training_from": payload.training_from if "training_from" in fields_set else (existing.training_from if existing else None),
        "training_to": payload.training_to if "training_to" in fields_set else (existing.training_to if existing else None),
        "status": payload.status if "status" in fields_set else (existing.status if existing else "Planned"),
        "notes": payload.notes if "notes" in fields_set else (existing.notes if existing else None),
        "allow_same_person": getattr(payload, "allow_same_person", False) if "allow_same_person" in fields_set else False,
    }
    return values


def _validate_assignment_payload(
    db: Session,
    *,
    department: ParishCouncilDepartment,
    values: dict[str, object],
    existing_assignment_id: int | None = None,
) -> None:
    status_value = str(values["status"])
    department_status = getattr(department.status, "value", department.status)
    if status_value in parish_council_service.OPEN_ASSIGNMENT_STATUSES and department_status == "Inactive":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive departments cannot receive open trainee assignments",
        )

    trainee_first_name = str(values.get("trainee_first_name") or "").strip()
    trainee_last_name = str(values.get("trainee_last_name") or "").strip()
    if not trainee_first_name or not trainee_last_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trainee first name and last name are required",
        )

    training_from = values.get("training_from")
    training_to = values.get("training_to")
    if not isinstance(training_from, date) or not isinstance(training_to, date):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Training dates are required")
    if training_to < training_from:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Training end date cannot be before the start date")

    trainee_birth_date = values.get("trainee_birth_date")
    minimum_age = int(department.minimum_age or 0)
    if minimum_age > 0:
        if not isinstance(trainee_birth_date, date):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Birth date is required to validate the trainee minimum age",
            )
        age = parish_council_service.calculate_age(trainee_birth_date, training_from)
        if age is None or age < minimum_age:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Trainees for {department.name} must be at least {minimum_age} years old",
            )

    if not bool(values.get("allow_same_person")) and _same_person(
        department=department,
        trainee_member_id=values.get("trainee_member_id"),  # type: ignore[arg-type]
        trainee_first_name=trainee_first_name,
        trainee_last_name=trainee_last_name,
        trainee_email=values.get("trainee_email"),  # type: ignore[arg-type]
        trainee_phone=values.get("trainee_phone"),  # type: ignore[arg-type]
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The department lead and trainee appear to be the same person. Confirm explicitly before saving.",
        )

    _validate_assignment_overlap(
        db,
        department_id=department.id,
        trainee_member_id=values.get("trainee_member_id"),  # type: ignore[arg-type]
        trainee_first_name=trainee_first_name,
        trainee_last_name=trainee_last_name,
        training_from=training_from,
        training_to=training_to,
        exclude_assignment_id=existing_assignment_id,
    )


def _assignment_requires_resubmission(before: dict[str, object], after: dict[str, object]) -> bool:
    tracked_keys = {
        "department_id",
        "trainee_member_id",
        "trainee_first_name",
        "trainee_last_name",
        "trainee_email",
        "trainee_phone",
        "trainee_birth_date",
        "training_from",
        "training_to",
        "status",
        "notes",
    }
    return any(before.get(key) != after.get(key) for key in tracked_keys)


@router.get("/meta", response_model=ParishCouncilMetaResponse)
def parish_council_meta(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> ParishCouncilMetaResponse:
    departments = parish_council_service.ensure_default_departments(db)
    return ParishCouncilMetaResponse(
        departments=[
            ParishCouncilMetaDepartment(
                id=item.id,
                name=item.name,
                status=getattr(item.status, "value", item.status),
                minimum_age=int(item.minimum_age or 0),
            )
            for item in departments
        ],
        department_statuses=list(PARISH_COUNCIL_DEPARTMENT_STATUSES),
        assignment_statuses=list(PARISH_COUNCIL_ASSIGNMENT_STATUSES),
        approval_statuses=list(PARISH_COUNCIL_ASSIGNMENT_APPROVAL_STATUSES),
        document_types=list(PARISH_COUNCIL_DOCUMENT_TYPES),
    )


@router.get("/overview", response_model=ParishCouncilOverviewResponse)
def parish_council_overview(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> ParishCouncilOverviewResponse:
    return ParishCouncilOverviewResponse(**parish_council_service.build_overview_payload(db))


@router.get("/departments", response_model=ParishCouncilDepartmentListResponse)
def list_parish_council_departments(
    q: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    lead_assigned: bool | None = Query(default=None),
    missing_contact: bool | None = Query(default=None),
    expiring_soon: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> ParishCouncilDepartmentListResponse:
    departments = parish_council_service.load_departments_with_relations(db)
    query = (q or "").strip().lower()
    items: list[ParishCouncilDepartmentSummary] = []
    for department in departments:
        summary = parish_council_service.serialize_department_summary(department)
        lead_full_name = str(summary.get("lead_full_name") or "").lower()
        haystack = " ".join(
            filter(
                None,
                [
                    department.name.lower(),
                    str(summary.get("lead_email") or "").lower(),
                    lead_full_name,
                    str(summary.get("description") or "").lower(),
                ],
            )
        )

        if status_filter and summary["status"] != status_filter:
            continue
        if lead_assigned is True and not summary["lead_full_name"]:
            continue
        if lead_assigned is False and summary["lead_full_name"]:
            continue
        if missing_contact is True and int(summary["missing_contact_count"]) == 0:
            continue
        if expiring_soon is True and int(summary["expiring_assignment_count"]) == 0:
            continue
        if query and query not in haystack:
            continue
        items.append(ParishCouncilDepartmentSummary(**summary))
    return ParishCouncilDepartmentListResponse(items=items, total=len(items))


@router.get("/departments/{department_id:int}", response_model=ParishCouncilDepartmentDetail)
def get_parish_council_department(
    department_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> ParishCouncilDepartmentDetail:
    department = _department_or_404(db, department_id)
    return ParishCouncilDepartmentDetail(**parish_council_service.serialize_department_detail(department))


@router.patch("/departments/{department_id:int}", response_model=ParishCouncilDepartmentDetail)
def update_parish_council_department(
    department_id: int,
    payload: ParishCouncilDepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> ParishCouncilDepartmentDetail:
    department = _department_or_404(db, department_id)
    before = parish_council_service.snapshot_department(department)
    fields_set = payload.__fields_set__
    lead_values = _resolve_department_lead_values(db, department, payload)

    if "description" in fields_set:
        department.description = payload.description
    if "status" in fields_set and payload.status is not None:
        department.status = payload.status
    if "minimum_age" in fields_set and payload.minimum_age is not None:
        department.minimum_age = payload.minimum_age
    if "lead_member_id" in fields_set:
        department.lead_member_id = lead_values["lead_member_id"]  # type: ignore[assignment]
    if "lead_first_name" in fields_set or "lead_member_id" in fields_set:
        department.lead_first_name = lead_values["lead_first_name"]  # type: ignore[assignment]
    if "lead_last_name" in fields_set or "lead_member_id" in fields_set:
        department.lead_last_name = lead_values["lead_last_name"]  # type: ignore[assignment]
    if "lead_email" in fields_set or "lead_member_id" in fields_set:
        department.lead_email = lead_values["lead_email"]  # type: ignore[assignment]
    if "lead_phone" in fields_set or "lead_member_id" in fields_set:
        department.lead_phone = lead_values["lead_phone"]  # type: ignore[assignment]
    if "lead_term_start" in fields_set:
        department.lead_term_start = payload.lead_term_start
    if "lead_term_end" in fields_set:
        department.lead_term_end = payload.lead_term_end
    if "notes" in fields_set:
        department.notes = payload.notes
    department.updated_by_id = current_user.id

    after = parish_council_service.snapshot_department(department)
    parish_council_service.record_audit_event(
        db,
        entity_type="Department",
        action="updated",
        summary=f"Updated {department.name}",
        actor_user_id=current_user.id,
        department_id=department.id,
        before_state=before,
        after_state=after,
    )
    db.commit()
    db.refresh(department)
    department = _department_or_404(db, department.id)
    return ParishCouncilDepartmentDetail(**parish_council_service.serialize_department_detail(department))


@router.get("/assignments", response_model=ParishCouncilAssignmentListResponse)
def list_parish_council_assignments(
    department_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    approval_status: str | None = Query(default=None),
    active_only: bool = Query(default=False),
    expiring_in_days: int | None = Query(default=None, ge=1, le=365),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> ParishCouncilAssignmentListResponse:
    items = parish_council_service.list_all_assignments(db)
    query = (q or "").strip().lower()
    output: list[ParishCouncilAssignmentOut] = []
    for assignment in items:
        serialized = parish_council_service.serialize_assignment(assignment)
        haystack = " ".join(
            filter(
                None,
                [
                    serialized["department_name"].lower(),
                    serialized["trainee_full_name"].lower(),
                    str(serialized.get("trainee_email") or "").lower(),
                ],
            )
        )
        if department_id and assignment.department_id != department_id:
            continue
        if status_filter and serialized["status"] != status_filter:
            continue
        if approval_status and serialized["approval_status"] != approval_status:
            continue
        if active_only and not parish_council_service.is_open_assignment(assignment):
            continue
        if expiring_in_days is not None and not parish_council_service.is_expiring_assignment(assignment, within_days=expiring_in_days):
            continue
        if query and query not in haystack:
            continue
        output.append(ParishCouncilAssignmentOut(**serialized))
    return ParishCouncilAssignmentListResponse(items=output, total=len(output))


@router.post("/assignments", response_model=ParishCouncilAssignmentOut, status_code=status.HTTP_201_CREATED)
def create_parish_council_assignment(
    payload: ParishCouncilAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> ParishCouncilAssignmentOut:
    department = _department_or_404(db, payload.department_id)
    values = _resolve_assignment_values(db, department=department, payload=payload, existing=None)
    _validate_assignment_payload(db, department=department, values=values)

    assignment = ParishCouncilAssignment(
        department_id=department.id,
        trainee_member_id=values["trainee_member_id"],
        trainee_first_name=str(values["trainee_first_name"]).strip(),
        trainee_last_name=str(values["trainee_last_name"]).strip(),
        trainee_email=values["trainee_email"],
        trainee_phone=values["trainee_phone"],
        trainee_birth_date=values["trainee_birth_date"],
        training_from=values["training_from"],
        training_to=values["training_to"],
        status=values["status"],
        approval_status="Pending",
        approval_requested_at=datetime.now(UTC),
        approval_requested_by_id=current_user.id,
        notes=values["notes"],
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(assignment)
    db.flush()
    parish_council_service.record_audit_event(
        db,
        entity_type="Assignment",
        action="created",
        summary=f"Assigned {assignment.trainee_first_name} {assignment.trainee_last_name} to {department.name}",
        actor_user_id=current_user.id,
        department_id=department.id,
        assignment_id=assignment.id,
        after_state=parish_council_service.snapshot_assignment(assignment),
    )
    db.commit()
    db.refresh(assignment)
    assignment = _assignment_or_404(db, assignment.id)
    return ParishCouncilAssignmentOut(**parish_council_service.serialize_assignment(assignment))


@router.patch("/assignments/{assignment_id:int}", response_model=ParishCouncilAssignmentOut)
def update_parish_council_assignment(
    assignment_id: int,
    payload: ParishCouncilAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> ParishCouncilAssignmentOut:
    assignment = _assignment_or_404(db, assignment_id)
    target_department = _department_or_404(db, payload.department_id) if "department_id" in payload.__fields_set__ and payload.department_id is not None else assignment.department
    values = _resolve_assignment_values(db, department=target_department, payload=payload, existing=assignment)
    _validate_assignment_payload(
        db,
        department=target_department,
        values=values,
        existing_assignment_id=assignment.id,
    )
    before = parish_council_service.snapshot_assignment(assignment)

    assignment.department_id = values["department_id"]
    assignment.trainee_member_id = values["trainee_member_id"]
    assignment.trainee_first_name = str(values["trainee_first_name"]).strip()
    assignment.trainee_last_name = str(values["trainee_last_name"]).strip()
    assignment.trainee_email = values["trainee_email"]
    assignment.trainee_phone = values["trainee_phone"]
    assignment.trainee_birth_date = values["trainee_birth_date"]
    assignment.training_from = values["training_from"]
    assignment.training_to = values["training_to"]
    assignment.status = values["status"]
    assignment.notes = values["notes"]
    assignment.updated_by_id = current_user.id
    if _assignment_requires_resubmission(before, parish_council_service.snapshot_assignment(assignment)):
        assignment.approval_status = "Pending"
        assignment.approval_requested_at = datetime.now(UTC)
        assignment.approval_requested_by_id = current_user.id
        assignment.approval_decided_at = None
        assignment.approval_decided_by_id = None

    after = parish_council_service.snapshot_assignment(assignment)
    parish_council_service.record_audit_event(
        db,
        entity_type="Assignment",
        action="updated",
        summary=f"Updated trainee assignment for {assignment.trainee_first_name} {assignment.trainee_last_name}",
        actor_user_id=current_user.id,
        department_id=assignment.department_id,
        assignment_id=assignment.id,
        before_state=before,
        after_state=after,
    )
    db.commit()
    db.refresh(assignment)
    assignment = _assignment_or_404(db, assignment.id)
    return ParishCouncilAssignmentOut(**parish_council_service.serialize_assignment(assignment))


@router.post("/assignments/{assignment_id:int}/approval", response_model=ParishCouncilAssignmentOut)
def update_parish_council_assignment_approval(
    assignment_id: int,
    payload: ParishCouncilAssignmentApprovalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> ParishCouncilAssignmentOut:
    assignment = _assignment_or_404(db, assignment_id)
    before = parish_council_service.snapshot_assignment(assignment)
    action_labels = {"submit": "submitted for approval", "approve": "approved", "reject": "rejected"}

    if payload.action == "submit":
        assignment.approval_status = "Pending"
        assignment.approval_requested_at = datetime.now(UTC)
        assignment.approval_requested_by_id = current_user.id
        assignment.approval_decided_at = None
        assignment.approval_decided_by_id = None
        if payload.note is not None:
            assignment.approval_note = payload.note
    elif payload.action == "approve":
        assignment.approval_status = "Approved"
        if assignment.approval_requested_at is None:
            assignment.approval_requested_at = datetime.now(UTC)
            assignment.approval_requested_by_id = current_user.id
        assignment.approval_decided_at = datetime.now(UTC)
        assignment.approval_decided_by_id = current_user.id
        assignment.approval_note = payload.note
    else:
        assignment.approval_status = "Rejected"
        if assignment.approval_requested_at is None:
            assignment.approval_requested_at = datetime.now(UTC)
            assignment.approval_requested_by_id = current_user.id
        assignment.approval_decided_at = datetime.now(UTC)
        assignment.approval_decided_by_id = current_user.id
        assignment.approval_note = payload.note

    assignment.updated_by_id = current_user.id
    after = parish_council_service.snapshot_assignment(assignment)
    parish_council_service.record_audit_event(
        db,
        entity_type="Assignment",
        action=f"approval_{payload.action}",
        summary=f"{assignment.trainee_first_name} {assignment.trainee_last_name} {action_labels[payload.action]}",
        actor_user_id=current_user.id,
        department_id=assignment.department_id,
        assignment_id=assignment.id,
        before_state=before,
        after_state=after,
    )
    db.commit()
    db.refresh(assignment)
    assignment = _assignment_or_404(db, assignment.id)
    return ParishCouncilAssignmentOut(**parish_council_service.serialize_assignment(assignment))


@router.post(
    "/departments/{department_id:int}/documents",
    response_model=ParishCouncilDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_parish_council_document(
    department_id: int,
    file: UploadFile = File(...),
    document_type: str = Form(default="Other"),
    title: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    assignment_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> ParishCouncilDocumentOut:
    department = _department_or_404(db, department_id)
    assignment = None
    if assignment_id is not None:
        assignment = _assignment_or_404(db, assignment_id)
        if assignment.department_id != department.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignment does not belong to this department")

    normalized_type = (document_type or "Other").strip()
    if normalized_type not in PARISH_COUNCIL_DOCUMENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported document type")

    content_type = (file.content_type or "").lower()
    original_name = Path(file.filename or "document").name
    extension = ALLOWED_DOCUMENT_MIME_TYPES.get(content_type)
    if extension is None:
        suffix = Path(original_name).suffix.lower().lstrip(".")
        if suffix not in set(ALLOWED_DOCUMENT_MIME_TYPES.values()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported file type. Allowed files: PDF, images, Word, and Excel documents.",
            )
        extension = suffix

    try:
        data = file.file.read(MAX_DOCUMENT_SIZE_BYTES + 1)
    finally:
        file.file.close()

    if len(data) > MAX_DOCUMENT_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is too large. Maximum allowed size is 8MB.",
        )

    filename = f"{department.id}_{datetime.now(UTC):%Y%m%d%H%M%S%f}_{uuid4().hex}.{extension}"
    target = PARISH_COUNCIL_DOCUMENT_UPLOAD_DIR / filename
    target.write_bytes(data)

    document = ParishCouncilDocument(
        department_id=department.id,
        assignment_id=assignment.id if assignment else None,
        document_type=normalized_type,
        title=title.strip() or None if title else None,
        original_filename=original_name,
        file_path=_relative_document_path(filename),
        content_type=content_type or None,
        size_bytes=len(data),
        notes=notes.strip() or None if notes else None,
        uploaded_by_id=current_user.id,
    )
    db.add(document)
    db.flush()
    parish_council_service.record_audit_event(
        db,
        entity_type="Assignment" if assignment else "Department",
        action="document_uploaded",
        summary=f"Uploaded {normalized_type} document {original_name}",
        actor_user_id=current_user.id,
        department_id=department.id,
        assignment_id=assignment.id if assignment else None,
        after_state=parish_council_service.snapshot_document(document),
    )
    db.commit()
    db.refresh(document)
    document = (
        db.query(ParishCouncilDocument)
        .options(
            joinedload(ParishCouncilDocument.uploaded_by),
            joinedload(ParishCouncilDocument.assignment),
        )
        .filter(ParishCouncilDocument.id == document.id)
        .first()
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Uploaded document could not be reloaded")
    return ParishCouncilDocumentOut(**parish_council_service.serialize_document(document))


@router.get("/documents/{document_id:int}/file")
def get_parish_council_document_file(
    document_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> FileResponse:
    document = _document_or_404(db, document_id)
    absolute_path = _resolve_upload_path(document.file_path)
    if absolute_path is None or not absolute_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parish council document file not found")
    return FileResponse(
        path=absolute_path,
        media_type=document.content_type or "application/octet-stream",
        filename=document.original_filename,
    )


@router.delete("/documents/{document_id:int}", status_code=status.HTTP_204_NO_CONTENT)
def delete_parish_council_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> Response:
    document = _document_or_404(db, document_id)
    relative_path = document.file_path
    snapshot = parish_council_service.snapshot_document(document)
    parish_council_service.record_audit_event(
        db,
        entity_type="Assignment" if document.assignment_id else "Department",
        action="document_deleted",
        summary=f"Deleted document {document.original_filename}",
        actor_user_id=current_user.id,
        department_id=document.department_id,
        assignment_id=document.assignment_id,
        before_state=snapshot,
    )
    db.delete(document)
    db.commit()
    _delete_file_if_exists(relative_path)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/activity", response_model=list[ParishCouncilActivityOut])
def list_parish_council_activity(
    department_id: int | None = Query(default=None),
    assignment_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> list[ParishCouncilActivityOut]:
    parish_council_service.ensure_default_departments(db)
    query = (
        db.query(ParishCouncilAuditEvent)
        .options(joinedload(ParishCouncilAuditEvent.actor))
        .order_by(ParishCouncilAuditEvent.created_at.desc(), ParishCouncilAuditEvent.id.desc())
    )
    if department_id:
        query = query.filter(ParishCouncilAuditEvent.department_id == department_id)
    if assignment_id:
        query = query.filter(ParishCouncilAuditEvent.assignment_id == assignment_id)
    items = query.limit(limit).all()
    return [ParishCouncilActivityOut(**parish_council_service.serialize_activity(item)) for item in items]
