from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.parish_council import (
    ParishCouncilAssignment,
    ParishCouncilAuditEvent,
    ParishCouncilDepartment,
    ParishCouncilDocument,
)

DEFAULT_PARISH_COUNCIL_DEPARTMENTS: tuple[dict[str, Any], ...] = (
    {
        "name": "Office of Chairman",
        "description": "Leadership office coordinating parish council direction and governance.",
        "minimum_age": 13,
    },
    {
        "name": "Finance Department",
        "description": "Financial stewardship, budgeting, and contribution oversight.",
        "minimum_age": 13,
    },
    {
        "name": "Public Relation",
        "description": "Communication, community visibility, and member engagement.",
        "minimum_age": 13,
    },
    {
        "name": "Gospel Department",
        "description": "Gospel and outreach coordination across parish programs.",
        "minimum_age": 0,
    },
    {
        "name": "Development and Property",
        "description": "Facilities, capital projects, and property stewardship.",
        "minimum_age": 13,
    },
    {
        "name": "Sunday School Teacher",
        "description": "Sunday school teaching leadership and trainee mentorship.",
        "minimum_age": 13,
    },
)

OPEN_ASSIGNMENT_STATUSES = {"Planned", "Active", "OnHold"}
_FIELD_LABELS = {
    "description": "Description",
    "status": "Status",
    "minimum_age": "Minimum age",
    "lead_first_name": "Lead first name",
    "lead_last_name": "Lead last name",
    "lead_email": "Lead email",
    "lead_phone": "Lead phone",
    "lead_term_start": "Lead term start",
    "lead_term_end": "Lead term end",
    "trainee_first_name": "Trainee first name",
    "trainee_last_name": "Trainee last name",
    "trainee_email": "Trainee email",
    "trainee_phone": "Trainee phone",
    "trainee_birth_date": "Trainee birth date",
    "training_from": "Training start",
    "training_to": "Training end",
    "approval_status": "Approval",
    "approval_note": "Approval note",
    "document_type": "Document type",
    "title": "Document title",
    "original_filename": "File",
    "notes": "Notes",
}


def _enum_value(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _full_name(first_name: str | None, last_name: str | None) -> str | None:
    parts = [part.strip() for part in [first_name, last_name] if part and part.strip()]
    if not parts:
        return None
    return " ".join(parts)


def _actor_name(actor) -> str | None:
    if not actor:
        return None
    return actor.full_name or actor.username or actor.email


def _to_utc_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _jsonable(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _field_label(field: str) -> str:
    return _FIELD_LABELS.get(field, field.replace("_", " ").strip().title())


def _change_highlights(before: dict[str, Any] | None, after: dict[str, Any] | None) -> list[str]:
    if not before and not after:
        return []
    keys = sorted(set((before or {}).keys()) | set((after or {}).keys()))
    highlights: list[str] = []
    for key in keys:
        before_value = _jsonable((before or {}).get(key))
        after_value = _jsonable((after or {}).get(key))
        if before_value == after_value:
            continue
        label = _field_label(key)
        if before_value in (None, "") and after_value not in (None, ""):
            highlights.append(f"{label} added")
        elif after_value in (None, ""):
            highlights.append(f"{label} cleared")
        else:
            highlights.append(f"{label} changed")
    return highlights[:6]


def ensure_default_departments(db: Session) -> list[ParishCouncilDepartment]:
    existing = {
        department.name: department
        for department in db.query(ParishCouncilDepartment).all()
    }
    created = False
    for item in DEFAULT_PARISH_COUNCIL_DEPARTMENTS:
        if item["name"] in existing:
            continue
        department = ParishCouncilDepartment(
            name=item["name"],
            description=item["description"],
            minimum_age=item["minimum_age"],
            status="Active",
        )
        db.add(department)
        created = True
    if created:
        db.commit()
    return (
        db.query(ParishCouncilDepartment)
        .options(selectinload(ParishCouncilDepartment.assignments))
        .order_by(ParishCouncilDepartment.name.asc())
        .all()
    )


def calculate_age(birth_date: date | None, reference_date: date | None = None) -> int | None:
    if birth_date is None:
        return None
    reference = reference_date or date.today()
    return reference.year - birth_date.year - (
        (reference.month, reference.day) < (birth_date.month, birth_date.day)
    )


def is_open_assignment(assignment: ParishCouncilAssignment) -> bool:
    return (_enum_value(assignment.status) or "") in OPEN_ASSIGNMENT_STATUSES


def is_expiring_assignment(
    assignment: ParishCouncilAssignment,
    *,
    within_days: int = 30,
    today: date | None = None,
) -> bool:
    reference = today or date.today()
    if not is_open_assignment(assignment):
        return False
    return reference <= assignment.training_to <= reference + timedelta(days=within_days)


def department_missing_contact_fields(department: ParishCouncilDepartment) -> list[str]:
    missing: list[str] = []
    if not _clean_text(department.lead_first_name):
        missing.append("lead_first_name")
    if not _clean_text(department.lead_last_name):
        missing.append("lead_last_name")
    if not _clean_text(department.lead_email):
        missing.append("lead_email")
    if not _clean_text(department.lead_phone):
        missing.append("lead_phone")
    return missing


def assignment_missing_contact_fields(assignment: ParishCouncilAssignment) -> list[str]:
    missing: list[str] = []
    if not _clean_text(assignment.trainee_email):
        missing.append("trainee_email")
    if not _clean_text(assignment.trainee_phone):
        missing.append("trainee_phone")
    return missing


def assignment_has_underage_issue(
    assignment: ParishCouncilAssignment,
    department: ParishCouncilDepartment,
) -> bool:
    minimum_age = int(department.minimum_age or 0)
    if minimum_age <= 0:
        return False
    age = calculate_age(assignment.trainee_birth_date, assignment.training_from)
    return age is None or age < minimum_age


def snapshot_department(department: ParishCouncilDepartment) -> dict[str, Any]:
    return {
        "id": department.id,
        "name": department.name,
        "description": _clean_text(department.description),
        "status": _enum_value(department.status),
        "minimum_age": int(department.minimum_age or 0),
        "lead_member_id": department.lead_member_id,
        "lead_first_name": _clean_text(department.lead_first_name),
        "lead_last_name": _clean_text(department.lead_last_name),
        "lead_email": _clean_text(department.lead_email),
        "lead_phone": _clean_text(department.lead_phone),
        "lead_term_start": _jsonable(department.lead_term_start),
        "lead_term_end": _jsonable(department.lead_term_end),
        "notes": _clean_text(department.notes),
    }


def snapshot_assignment(assignment: ParishCouncilAssignment) -> dict[str, Any]:
    return {
        "id": assignment.id,
        "department_id": assignment.department_id,
        "trainee_member_id": assignment.trainee_member_id,
        "trainee_first_name": _clean_text(assignment.trainee_first_name),
        "trainee_last_name": _clean_text(assignment.trainee_last_name),
        "trainee_email": _clean_text(assignment.trainee_email),
        "trainee_phone": _clean_text(assignment.trainee_phone),
        "trainee_birth_date": _jsonable(assignment.trainee_birth_date),
        "training_from": _jsonable(assignment.training_from),
        "training_to": _jsonable(assignment.training_to),
        "status": _enum_value(assignment.status),
        "approval_status": _enum_value(assignment.approval_status),
        "approval_requested_at": _jsonable(assignment.approval_requested_at),
        "approval_decided_at": _jsonable(assignment.approval_decided_at),
        "approval_note": _clean_text(assignment.approval_note),
        "notes": _clean_text(assignment.notes),
    }


def snapshot_document(document: ParishCouncilDocument) -> dict[str, Any]:
    return {
        "id": document.id,
        "department_id": document.department_id,
        "assignment_id": document.assignment_id,
        "document_type": document.document_type,
        "title": _clean_text(document.title),
        "original_filename": document.original_filename,
        "file_path": document.file_path,
        "content_type": _clean_text(document.content_type),
        "size_bytes": int(document.size_bytes or 0),
        "notes": _clean_text(document.notes),
    }


def record_audit_event(
    db: Session,
    *,
    entity_type: str,
    action: str,
    summary: str,
    actor_user_id: int | None,
    department_id: int | None = None,
    assignment_id: int | None = None,
    before_state: dict[str, Any] | None = None,
    after_state: dict[str, Any] | None = None,
) -> ParishCouncilAuditEvent:
    event = ParishCouncilAuditEvent(
        entity_type=entity_type,
        action=action,
        summary=summary,
        actor_user_id=actor_user_id,
        department_id=department_id,
        assignment_id=assignment_id,
        before_state=before_state,
        after_state=after_state,
    )
    db.add(event)
    return event


def serialize_activity(event: ParishCouncilAuditEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "entity_type": _enum_value(event.entity_type),
        "action": event.action,
        "summary": event.summary,
        "actor_name": _actor_name(event.actor),
        "created_at": _to_utc_timestamp(event.created_at),
        "department_id": event.department_id,
        "assignment_id": event.assignment_id,
        "changes": _change_highlights(event.before_state, event.after_state),
        "before_state": event.before_state,
        "after_state": event.after_state,
    }


def serialize_document(document: ParishCouncilDocument) -> dict[str, Any]:
    assignment = document.assignment
    assignment_label = None
    if assignment:
        assignment_label = _full_name(assignment.trainee_first_name, assignment.trainee_last_name) or f"Assignment #{assignment.id}"
    return {
        "id": document.id,
        "department_id": document.department_id,
        "assignment_id": document.assignment_id,
        "document_type": document.document_type,
        "title": _clean_text(document.title),
        "original_filename": document.original_filename,
        "file_url": f"/parish-councils/documents/{document.id}/file",
        "content_type": _clean_text(document.content_type),
        "size_bytes": int(document.size_bytes or 0),
        "notes": _clean_text(document.notes),
        "uploaded_by_name": _actor_name(document.uploaded_by),
        "assignment_label": assignment_label,
        "created_at": _to_utc_timestamp(document.created_at),
    }


def serialize_assignment(assignment: ParishCouncilAssignment) -> dict[str, Any]:
    department = assignment.department
    trainee_full_name = _full_name(assignment.trainee_first_name, assignment.trainee_last_name) or "Unnamed trainee"
    return {
        "id": assignment.id,
        "department_id": assignment.department_id,
        "department_name": department.name if department else "",
        "trainee_member_id": assignment.trainee_member_id,
        "trainee_first_name": assignment.trainee_first_name,
        "trainee_last_name": assignment.trainee_last_name,
        "trainee_full_name": trainee_full_name,
        "trainee_email": _clean_text(assignment.trainee_email),
        "trainee_phone": _clean_text(assignment.trainee_phone),
        "trainee_birth_date": assignment.trainee_birth_date,
        "trainee_age": calculate_age(assignment.trainee_birth_date, assignment.training_from),
        "training_from": assignment.training_from,
        "training_to": assignment.training_to,
        "status": _enum_value(assignment.status),
        "approval_status": _enum_value(assignment.approval_status),
        "approval_requested_at": _to_utc_timestamp(assignment.approval_requested_at) if assignment.approval_requested_at else None,
        "approval_requested_by_name": _actor_name(assignment.approval_requested_by),
        "approval_decided_at": _to_utc_timestamp(assignment.approval_decided_at) if assignment.approval_decided_at else None,
        "approval_decided_by_name": _actor_name(assignment.approval_decided_by),
        "approval_note": _clean_text(assignment.approval_note),
        "notes": _clean_text(assignment.notes),
        "document_count": len(assignment.documents or []),
        "missing_contact_fields": assignment_missing_contact_fields(assignment),
        "created_at": _to_utc_timestamp(assignment.created_at),
        "updated_at": _to_utc_timestamp(assignment.updated_at),
    }


def serialize_department_summary(
    department: ParishCouncilDepartment,
    *,
    expiring_within_days: int = 30,
) -> dict[str, Any]:
    assignments = list(department.assignments or [])
    open_assignments = [item for item in assignments if is_open_assignment(item)]
    expiring = [item for item in open_assignments if is_expiring_assignment(item, within_days=expiring_within_days)]
    missing_contact_count = len(department_missing_contact_fields(department)) + sum(
        len(assignment_missing_contact_fields(item)) for item in assignments
    )
    return {
        "id": department.id,
        "name": department.name,
        "description": _clean_text(department.description),
        "status": _enum_value(department.status),
        "minimum_age": int(department.minimum_age or 0),
        "lead_member_id": department.lead_member_id,
        "lead_first_name": _clean_text(department.lead_first_name),
        "lead_last_name": _clean_text(department.lead_last_name),
        "lead_full_name": _full_name(department.lead_first_name, department.lead_last_name),
        "lead_email": _clean_text(department.lead_email),
        "lead_phone": _clean_text(department.lead_phone),
        "lead_term_start": department.lead_term_start,
        "lead_term_end": department.lead_term_end,
        "notes": _clean_text(department.notes),
        "active_trainee_count": len(open_assignments),
        "expiring_assignment_count": len(expiring),
        "missing_contact_count": missing_contact_count,
        "open_assignment_count": len(open_assignments),
        "document_count": len(department.documents or []),
        "updated_at": _to_utc_timestamp(department.updated_at),
    }


def serialize_department_detail(department: ParishCouncilDepartment) -> dict[str, Any]:
    activity = [
        serialize_activity(item)
        for item in sorted(
            department.audit_events or [],
            key=lambda entry: (entry.created_at, entry.id),
            reverse=True,
        )[:25]
    ]
    assignments = [
        serialize_assignment(item)
        for item in sorted(
            department.assignments or [],
            key=lambda entry: (entry.training_to, entry.id),
        )
    ]
    documents = [
        serialize_document(item)
        for item in sorted(
            department.documents or [],
            key=lambda entry: (entry.created_at, entry.id),
            reverse=True,
        )
    ]
    return {
        **serialize_department_summary(department),
        "assignments": assignments,
        "documents": documents,
        "activity": activity,
    }


def load_departments_with_relations(db: Session) -> list[ParishCouncilDepartment]:
    ensure_default_departments(db)
    return (
        db.query(ParishCouncilDepartment)
        .options(
            selectinload(ParishCouncilDepartment.assignments)
            .joinedload(ParishCouncilAssignment.department),
            selectinload(ParishCouncilDepartment.assignments)
            .selectinload(ParishCouncilAssignment.documents),
            selectinload(ParishCouncilDepartment.audit_events).joinedload(ParishCouncilAuditEvent.actor),
            selectinload(ParishCouncilDepartment.documents).joinedload(ParishCouncilDocument.uploaded_by),
        )
        .order_by(ParishCouncilDepartment.name.asc())
        .all()
    )


def load_department_detail(db: Session, department_id: int) -> ParishCouncilDepartment | None:
    ensure_default_departments(db)
    return (
        db.query(ParishCouncilDepartment)
        .options(
            selectinload(ParishCouncilDepartment.assignments)
            .joinedload(ParishCouncilAssignment.department),
            selectinload(ParishCouncilDepartment.assignments)
            .joinedload(ParishCouncilAssignment.approval_requested_by),
            selectinload(ParishCouncilDepartment.assignments)
            .joinedload(ParishCouncilAssignment.approval_decided_by),
            selectinload(ParishCouncilDepartment.assignments)
            .selectinload(ParishCouncilAssignment.documents),
            selectinload(ParishCouncilDepartment.audit_events).joinedload(ParishCouncilAuditEvent.actor),
            selectinload(ParishCouncilDepartment.documents).joinedload(ParishCouncilDocument.uploaded_by),
            selectinload(ParishCouncilDepartment.documents).joinedload(ParishCouncilDocument.assignment),
        )
        .filter(ParishCouncilDepartment.id == department_id)
        .first()
    )


def load_assignment_detail(db: Session, assignment_id: int) -> ParishCouncilAssignment | None:
    return (
        db.query(ParishCouncilAssignment)
        .options(
            joinedload(ParishCouncilAssignment.department),
            joinedload(ParishCouncilAssignment.approval_requested_by),
            joinedload(ParishCouncilAssignment.approval_decided_by),
            selectinload(ParishCouncilAssignment.documents).joinedload(ParishCouncilDocument.uploaded_by),
            selectinload(ParishCouncilAssignment.audit_events).joinedload(ParishCouncilAuditEvent.actor),
        )
        .filter(ParishCouncilAssignment.id == assignment_id)
        .first()
    )


def list_all_assignments(db: Session) -> list[ParishCouncilAssignment]:
    ensure_default_departments(db)
    return (
        db.query(ParishCouncilAssignment)
        .options(
            joinedload(ParishCouncilAssignment.department),
            joinedload(ParishCouncilAssignment.approval_requested_by),
            joinedload(ParishCouncilAssignment.approval_decided_by),
            selectinload(ParishCouncilAssignment.documents),
        )
        .order_by(ParishCouncilAssignment.training_to.asc(), ParishCouncilAssignment.id.desc())
        .all()
    )


def build_overview_payload(db: Session) -> dict[str, Any]:
    departments = load_departments_with_relations(db)
    assignments = [assignment for department in departments for assignment in department.assignments]
    documents = [document for department in departments for document in department.documents]
    status_counts = Counter((_enum_value(item.status) or "Unknown") for item in assignments)
    recent_activity = (
        db.query(ParishCouncilAuditEvent)
        .options(joinedload(ParishCouncilAuditEvent.actor))
        .order_by(ParishCouncilAuditEvent.created_at.desc(), ParishCouncilAuditEvent.id.desc())
        .limit(10)
        .all()
    )

    open_assignments = [item for item in assignments if is_open_assignment(item)]
    underage_issues = sum(
        1
        for department in departments
        for assignment in department.assignments
        if assignment_has_underage_issue(assignment, department)
    )
    expiring_assignments = [
        item for item in open_assignments if is_expiring_assignment(item, within_days=30)
    ]
    upcoming_end_dates = [
        {
            "id": item.id,
            "department_id": item.department_id,
            "department_name": item.department.name if item.department else "",
            "trainee_full_name": _full_name(item.trainee_first_name, item.trainee_last_name) or "Unnamed trainee",
            "training_to": item.training_to,
            "status": _enum_value(item.status),
        }
        for item in sorted(expiring_assignments, key=lambda entry: (entry.training_to, entry.id))[:8]
    ]
    occupancy = [
        {
            "department_id": department.id,
            "department_name": department.name,
            "active_trainees": len([item for item in department.assignments if is_open_assignment(item)]),
            "open_assignments": len([item for item in department.assignments if is_open_assignment(item)]),
            "minimum_age": int(department.minimum_age or 0),
            "status": _enum_value(department.status),
        }
        for department in departments
    ]
    missing_contact_records = sum(
        len(department_missing_contact_fields(department)) for department in departments
    ) + sum(len(assignment_missing_contact_fields(item)) for item in assignments)

    return {
        "summary": {
            "total_departments": len(departments),
            "active_departments": len([item for item in departments if _enum_value(item.status) == "Active"]),
            "active_leads": len([item for item in departments if _full_name(item.lead_first_name, item.lead_last_name)]),
            "active_trainees": len(open_assignments),
            "open_assignments": len(open_assignments),
            "expiring_assignments_30_days": len(expiring_assignments),
            "missing_contact_records": missing_contact_records,
            "total_documents": len(documents),
            "underage_validation_issues": underage_issues,
            "pending_approvals": len([item for item in assignments if _enum_value(item.approval_status) == "Pending"]),
        },
        "status_breakdown": [
            {"label": label, "value": value}
            for label, value in sorted(status_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
        "department_occupancy": occupancy,
        "upcoming_end_dates": upcoming_end_dates,
        "recent_activity": [serialize_activity(item) for item in recent_activity],
    }


def build_report_payload(
    db: Session,
    *,
    department_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    active_only: bool = False,
    expiring_in_days: int | None = None,
    start_date_from: date | None = None,
    start_date_to: date | None = None,
    end_date_from: date | None = None,
    end_date_to: date | None = None,
) -> dict[str, Any]:
    assignments = list_all_assignments(db)
    filtered: list[ParishCouncilAssignment] = []
    query = (q or "").strip().lower()
    for item in assignments:
        department = item.department
        department_name = department.name if department else ""
        item_status = _enum_value(item.status) or ""
        haystack = " ".join(
            part
            for part in [
                department_name,
                item.trainee_first_name,
                item.trainee_last_name,
                department.lead_first_name if department else "",
                department.lead_last_name if department else "",
                department.lead_email if department else "",
            ]
            if part
        ).lower()

        if department_id and item.department_id != department_id:
            continue
        if status and item_status != status:
            continue
        if active_only and not is_open_assignment(item):
            continue
        if expiring_in_days is not None and not is_expiring_assignment(item, within_days=expiring_in_days):
            continue
        if start_date_from and item.training_from < start_date_from:
            continue
        if start_date_to and item.training_from > start_date_to:
            continue
        if end_date_from and item.training_to < end_date_from:
            continue
        if end_date_to and item.training_to > end_date_to:
            continue
        if query and query not in haystack:
            continue
        filtered.append(item)

    filtered.sort(key=lambda entry: (entry.training_to, entry.department.name if entry.department else "", entry.trainee_last_name, entry.trainee_first_name))
    status_counts = Counter((_enum_value(item.status) or "Unknown") for item in filtered)
    department_counts = Counter((item.department.name if item.department else "Unknown") for item in filtered)

    rows = []
    for item in filtered:
        department = item.department
        rows.append(
            {
                "department": department.name if department else "",
                "lead_first_name": _clean_text(department.lead_first_name if department else None),
                "lead_last_name": _clean_text(department.lead_last_name if department else None),
                "lead_email": _clean_text(department.lead_email if department else None),
                "lead_phone": _clean_text(department.lead_phone if department else None),
                "trainee_first_name": item.trainee_first_name,
                "trainee_last_name": item.trainee_last_name,
                "trainee_email": _clean_text(item.trainee_email),
                "trainee_phone": _clean_text(item.trainee_phone),
                "training_from": item.training_from,
                "training_to": item.training_to,
                "status": _enum_value(item.status),
            }
        )

    expiring_rows = [
        row
        for row, item in zip(rows, filtered)
        if is_expiring_assignment(item, within_days=30)
    ][:8]

    missing_contact_rows = sum(
        1
        for item in filtered
        if assignment_missing_contact_fields(item)
        or department_missing_contact_fields(item.department)  # type: ignore[arg-type]
    )

    return {
        "summary": {
            "total_rows": len(rows),
            "active_assignments": len([item for item in filtered if is_open_assignment(item)]),
            "expiring_30_days": len([item for item in filtered if is_expiring_assignment(item, within_days=30)]),
            "departments_covered": len({item["department"] for item in rows if item["department"]}),
            "missing_contact_rows": missing_contact_rows,
        },
        "status_breakdown": [
            {"label": label, "value": value, "share_percent": round((value / len(rows)) * 100, 1) if rows else None}
            for label, value in sorted(status_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
        "department_breakdown": [
            {"label": label, "value": value, "share_percent": round((value / len(rows)) * 100, 1) if rows else None}
            for label, value in sorted(department_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
        "expiring_assignments": expiring_rows,
        "rows": rows,
    }
