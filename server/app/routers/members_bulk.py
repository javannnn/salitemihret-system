from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Iterable

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.household import Household
from app.models.member import Member
from app.models.member_audit import MemberAudit
from app.models.ministry import Ministry
from app.models.priest import Priest
from app.models.tag import Tag
from app.models.user import User
from app.schemas.member import (
    ALLOWED_MEMBER_GENDERS,
    ALLOWED_MEMBER_STATUSES,
    ALLOWED_MEMBER_MARITAL_STATUSES,
    ALLOWED_CONTRIBUTION_METHODS,
    ALLOWED_CONTRIBUTION_EXCEPTION_REASONS,
    ChildPromotionCandidate,
    ChildPromotionPreviewResponse,
    ChildPromotionResultItem,
    ChildPromotionRunResponse,
    ImportErrorItem,
    ImportReportResponse,
    MemberAuditFeedItem,
    MemberMetaResponse,
    HouseholdOut,
    PriestOut,
    TagOut,
    MinistryOut,
)
from app.services.child_promotion import get_children_ready_for_promotion, promote_children_who_are_18
from app.services.members_import import import_members_from_csv
from app.services.members_query import apply_member_sort, build_members_query

router = APIRouter(prefix="/members", tags=["members"])

ADMIN_ROLES = ("Admin", "PublicRelations")
READ_ROLES = ("PublicRelations", "OfficeAdmin", "Registrar", "Admin", "Clerk", "FinanceAdmin")

EXPORT_HEADERS = [
    "id",
    "username",
    "first_name",
    "middle_name",
    "last_name",
    "baptismal_name",
    "gender",
    "marital_status",
    "status",
    "email",
    "phone",
    "district",
    "address",
    "address_street",
    "address_city",
    "address_region",
    "address_postal_code",
    "address_country",
    "birth_date",
    "join_date",
    "family_count",
    "household_size_override",
    "is_tither",
    "pays_contribution",
    "contribution_method",
    "contribution_amount",
    "contribution_currency",
    "contribution_exception_reason",
    "has_father_confessor",
    "father_confessor",
    "notes",
    "household",
    "tag_list",
    "ministry_list",
    "spouse_first_name",
    "spouse_last_name",
    "spouse_gender",
    "spouse_country_of_birth",
    "spouse_phone",
    "spouse_email",
    "children",
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

    def _format_children() -> str:
        segments: list[str] = []
        for child in member.children_all:
            if child.promoted_at:
                continue
            parts = [
                child.first_name or "",
                child.last_name or "",
                child.gender or "",
                _format_date(child.birth_date),
                child.country_of_birth or "",
                child.notes or "",
            ]
            segments.append("|".join(parts))
        return ";".join(segments)

    tag_names = ", ".join(sorted(tag.name for tag in member.tags))
    ministry_names = ", ".join(sorted(ministry.name for ministry in member.ministries))
    contribution_amount = _format_decimal(member.contribution_amount)
    spouse = member.spouse
    father_confessor_name = member.father_confessor.full_name if member.father_confessor else ""

    return [
        str(member.id),
        member.username or "",
        member.first_name or "",
        member.middle_name or "",
        member.last_name or "",
        member.baptismal_name or "",
        member.gender or "",
        member.marital_status or "",
        member.status or "",
        member.email or "",
        member.phone or "",
        member.district or "",
        member.address or "",
        member.address_street or "",
        member.address_city or "",
        member.address_region or "",
        member.address_postal_code or "",
        member.address_country or "",
        _format_date(member.birth_date),
        _format_date(member.join_date),
        str(member.family_count or ""),
        str(member.household_size_override or ""),
        "true" if member.is_tither else "false",
        "true" if member.pays_contribution else "false",
        member.contribution_method or "",
        contribution_amount,
        member.contribution_currency or "",
        member.contribution_exception_reason or "",
        "true" if member.has_father_confessor else "false",
        father_confessor_name,
        member.notes or "",
        member.household.name if member.household else "",
        tag_names,
        ministry_names,
        spouse.first_name if spouse else "",
        spouse.last_name if spouse else "",
        spouse.gender if spouse else "",
        spouse.country_of_birth if spouse else "",
        spouse.phone if spouse else "",
        spouse.email if spouse else "",
        _format_children(),
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
    has_children: bool | None = Query(default=None),
    missing_phone: bool | None = Query(default=None),
    new_this_month: bool | None = Query(default=None),
    ids: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN_ROLES)),
) -> StreamingResponse:
    member_ids: list[int] | None = None
    if ids:
        try:
            member_ids = [int(value) for value in ids.split(",") if value.strip()]
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid member ids") from exc

    query = build_members_query(
        db,
        status_filter=status_filter,
        q=q,
        tag=tag,
        ministry=ministry,
        gender=gender,
        district=district,
        has_children=has_children,
        missing_phone=missing_phone,
        new_this_month=new_this_month,
        member_ids=member_ids,
    )
    query = apply_member_sort(query, sort)
    members = (
        query.options(
            selectinload(Member.tags),
            selectinload(Member.ministries),
            selectinload(Member.household).selectinload(Household.members),
            selectinload(Member.spouse),
            selectinload(Member.father_confessor),
            selectinload(Member.children_all),
        ).all()
    )

    rows = (_format_member_row(member) for member in members)
    response = StreamingResponse(_stream_csv(rows), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=members_export.csv"
    return response


@router.get("/meta", response_model=MemberMetaResponse, status_code=status.HTTP_200_OK)
def get_member_meta(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> MemberMetaResponse:
    db.rollback()
    district_rows = (
        db.query(func.distinct(Member.district))
        .filter(Member.district.isnot(None))
        .all()
    )
    districts = sorted(
        (row[0] for row in district_rows if row[0]),
        key=lambda value: value.lower(),
    )

    tag_rows = db.query(Tag.id, Tag.name, Tag.slug).order_by(Tag.name.asc()).all()
    tags = [TagOut(id=row.id, name=row.name, slug=row.slug) for row in tag_rows]

    ministry_rows = db.query(Ministry.id, Ministry.name, Ministry.slug).order_by(Ministry.name.asc()).all()
    ministries = [MinistryOut(id=row.id, name=row.name, slug=row.slug) for row in ministry_rows]

    if hasattr(Household, "head_member_id"):
        household_rows = (
            db.query(Household.id, Household.name, Household.head_member_id)
            .order_by(Household.name.asc())
            .all()
        )
        households = [
            HouseholdOut(id=row.id, name=row.name, head_member_id=row.head_member_id) for row in household_rows
        ]
    else:
        household_rows = (
            db.query(Household.id, Household.name)
            .order_by(Household.name.asc())
            .all()
        )
        households = [
            HouseholdOut(id=row.id, name=row.name, head_member_id=None) for row in household_rows
        ]

    priest_query = db.query(Priest.id, Priest.full_name)
    if hasattr(Priest, "phone"):
        priest_query = priest_query.add_columns(Priest.phone)
    if hasattr(Priest, "email"):
        priest_query = priest_query.add_columns(Priest.email)
    if hasattr(Priest, "status"):
        priest_query = priest_query.add_columns(Priest.status)
    priest_rows = priest_query.order_by(Priest.full_name.asc()).all()
    priests = []
    for row in priest_rows:
        mapping = getattr(row, '_mapping', None)
        if mapping is not None:
            data = dict(mapping)
        elif hasattr(row, '_asdict'):
            data = row._asdict()
        else:
            data = row.__dict__
        priests.append(
            PriestOut(
                id=data["id"],
                full_name=data["full_name"],
                phone=data.get("phone"),
                email=data.get("email"),
                status=data.get("status", "Active"),
            )
        )
    return MemberMetaResponse(
        statuses=sorted(ALLOWED_MEMBER_STATUSES),
        genders=sorted(ALLOWED_MEMBER_GENDERS),
        marital_statuses=sorted(ALLOWED_MEMBER_MARITAL_STATUSES),
        payment_methods=sorted(ALLOWED_CONTRIBUTION_METHODS),
        contribution_exception_reasons=sorted(ALLOWED_CONTRIBUTION_EXCEPTION_REASONS),
        districts=districts,
        tags=tags,
        ministries=ministries,
        households=households,
        father_confessors=priests,
    )


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


@router.get("/promotions", response_model=ChildPromotionPreviewResponse, status_code=status.HTTP_200_OK)
def preview_child_promotions(
    within_days: int = Query(30, ge=0, le=365),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN_ROLES)),
) -> ChildPromotionPreviewResponse:
    candidates = []
    for child, turns_on in get_children_ready_for_promotion(db, within_days=within_days):
        parent = child.parent
        candidates.append(
            ChildPromotionCandidate(
                child_id=child.id,
                child_name=child.full_name,
                birth_date=child.birth_date,
                turns_on=turns_on,
                parent_member_id=parent.id if parent else None,
                parent_member_name=f"{parent.first_name} {parent.last_name}" if parent else "Unknown",
                household=parent.household if parent else None,
            )
        )
    return ChildPromotionPreviewResponse(items=candidates, total=len(candidates))


@router.post("/promotions/run", response_model=ChildPromotionRunResponse, status_code=status.HTTP_200_OK)
def promote_children(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ADMIN_ROLES)),
) -> ChildPromotionRunResponse:
    transitions = promote_children_who_are_18(db, current_user.id)
    db.commit()
    promoted = [
        ChildPromotionResultItem(
            child_id=child.id,
            new_member_id=member.id,
            new_member_name=f"{member.first_name} {member.last_name}",
            promoted_at=child.promoted_at or datetime.utcnow(),
        )
        for child, member in transitions
    ]
    return ChildPromotionRunResponse(promoted=promoted)
