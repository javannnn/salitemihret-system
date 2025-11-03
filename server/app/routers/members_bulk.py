from __future__ import annotations

import csv
import io
from typing import Iterable

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.member import Member
from app.models.member_audit import MemberAudit
from app.models.user import User
from app.schemas.member import ImportErrorItem, ImportReportResponse, MemberAuditFeedItem
from app.services.members_import import import_members_from_csv
from app.services.members_query import apply_member_sort, build_members_query

router = APIRouter(prefix="/members", tags=["members"])

ADMIN_ROLES = ("Admin",)

EXPORT_HEADERS = [
    "id",
    "username",
    "first_name",
    "middle_name",
    "last_name",
    "gender",
    "status",
    "email",
    "phone",
    "district",
    "address",
    "birth_date",
    "join_date",
    "is_tither",
    "contribution_method",
    "contribution_amount",
    "notes",
    "household",
    "tag_list",
    "ministry_list",
    "created_at",
    "updated_at",
    "deleted_at",
]

IMPORT_CONTENT_TYPES = {
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
}


def _format_member_row(member: Member) -> list[str]:
    def _format_date(value):
        return value.isoformat() if value else ""

    def _format_decimal(value):
        return f"{value:.2f}" if value is not None else ""

    tag_names = ", ".join(sorted(tag.name for tag in member.tags))
    ministry_names = ", ".join(sorted(ministry.name for ministry in member.ministries))
    contribution_amount = _format_decimal(member.contribution_amount)

    return [
        str(member.id),
        member.username or "",
        member.first_name or "",
        member.middle_name or "",
        member.last_name or "",
        member.gender or "",
        member.status or "",
        member.email or "",
        member.phone or "",
        member.district or "",
        member.address or "",
        _format_date(member.birth_date),
        _format_date(member.join_date),
        "true" if member.is_tither else "false",
        member.contribution_method or "",
        contribution_amount,
        member.notes or "",
        member.household.name if member.household else "",
        tag_names,
        ministry_names,
        _format_date(member.created_at),
        _format_date(member.updated_at),
        _format_date(member.deleted_at),
    ]


def _stream_csv(rows: Iterable[list[str]]) -> Iterable[str]:
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow(EXPORT_HEADERS)
    yield buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)

    for row in rows:
        writer.writerow(row)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


@router.get("/export.csv", status_code=status.HTTP_200_OK)
@router.get("/export", status_code=status.HTTP_200_OK, include_in_schema=False)
def export_members(
    q: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    tag: str | None = Query(default=None),
    ministry: str | None = Query(default=None),
    gender: str | None = Query(default=None),
    district: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN_ROLES)),
) -> StreamingResponse:
    query = build_members_query(
        db,
        status_filter=status_filter,
        q=q,
        tag=tag,
        ministry=ministry,
        gender=gender,
        district=district,
    )
    query = apply_member_sort(query, sort)
    members = (
        query.options(
            selectinload(Member.tags),
            selectinload(Member.ministries),
            selectinload(Member.household),
        ).all()
    )

    rows = (_format_member_row(member) for member in members)
    response = StreamingResponse(_stream_csv(rows), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=members_export.csv"
    return response


@router.post("/import", response_model=ImportReportResponse, status_code=status.HTTP_200_OK)
def import_members(
    file: UploadFile = File(..., media_type="text/csv"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ADMIN_ROLES)),
) -> ImportReportResponse:
    if file.content_type not in IMPORT_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be a CSV upload")

    try:
        file_bytes = file.file.read()
    finally:
        file.file.close()

    try:
        report = import_members_from_csv(db, file_bytes, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return ImportReportResponse(
        inserted=report.inserted,
        updated=report.updated,
        failed=report.failed,
        errors=[ImportErrorItem(row=error.row, reason=error.reason) for error in report.errors],
    )


@router.get("/{member_id}/audit", response_model=list[MemberAuditFeedItem], status_code=status.HTTP_200_OK)
def get_member_audit(
    member_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("Registrar", "Admin")),
) -> list[MemberAuditFeedItem]:
    exists = db.query(Member.id).filter(Member.id == member_id).first()
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    entries = (
        db.query(MemberAudit)
        .filter(MemberAudit.member_id == member_id)
        .order_by(MemberAudit.changed_at.desc())
        .options(selectinload(MemberAudit.actor))
        .all()
    )
    return [
        MemberAuditFeedItem(
            changed_at=entry.changed_at,
            actor=_resolve_actor(entry),
            action=_derive_action(entry),
            field=entry.field,
            old_value=entry.old_value,
            new_value=entry.new_value,
        )
        for entry in entries
    ]


def _resolve_actor(entry: MemberAudit) -> str:
    if entry.actor:
        return entry.actor.full_name or entry.actor.email or "Unknown"
    return "System"


def _derive_action(entry: MemberAudit) -> str:
    if entry.field == "deleted_at":
        if entry.new_value:
            return "archived"
        return "restored"
    if entry.old_value is None and entry.new_value is not None:
        return "created"
    if entry.new_value is None:
        return "cleared"
    return "updated"
