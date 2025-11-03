from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models.member import Child, Member, Spouse
from app.models.ministry import Ministry
from app.models.tag import Tag
from app.models.user import User
from app.schemas.member import MemberCreate, MemberDetailOut, MemberListResponse, MemberUpdate
from app.services.audit import record_member_changes, snapshot_member
from app.services.members_query import apply_member_sort, build_members_query
from app.services.members_utils import generate_username

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/members", tags=["members"])

READ_ROLES = ("PublicRelations", "OfficeAdmin", "Registrar", "Admin")
WRITE_ROLES = ("Registrar", "Admin")
DELETE_ROLES = ("Admin",)

def _apply_children(member: Member, children_payload: list[dict] | None) -> None:
    if children_payload is None:
        return
    member.children.clear()
    for child in children_payload:
        member.children.append(
            Child(
                full_name=child["full_name"],
                birth_date=child.get("birth_date"),
                notes=child.get("notes"),
            )
        )


def _apply_spouse(member: Member, spouse_payload: dict | None) -> None:
    if spouse_payload is None:
        member.spouse = None
        return
    if member.spouse is None:
        member.spouse = Spouse(
            full_name=spouse_payload["full_name"],
            phone=spouse_payload.get("phone"),
            email=spouse_payload.get("email"),
        )
    else:
        member.spouse.full_name = spouse_payload["full_name"]
        member.spouse.phone = spouse_payload.get("phone")
        member.spouse.email = spouse_payload.get("email")


def _set_tags(db: Session, member: Member, tag_ids: list[int]) -> None:
    if tag_ids:
        tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()
        member.tags = tags
    else:
        member.tags = []


def _set_ministries(db: Session, member: Member, ministry_ids: list[int]) -> None:
    if ministry_ids:
        ministries = db.query(Ministry).filter(Ministry.id.in_(ministry_ids)).all()
        member.ministries = ministries
    else:
        member.ministries = []


@router.get("", response_model=MemberListResponse)
@router.get("/", response_model=MemberListResponse, include_in_schema=False)
def list_members(
    *,
    q: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    tag: str | None = Query(default=None),
    ministry: str | None = Query(default=None),
    gender: str | None = Query(default=None),
    district: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> MemberListResponse:
    query = build_members_query(
        db,
        status_filter=status_filter,
        q=q,
        tag=tag,
        ministry=ministry,
        gender=gender,
        district=district,
    )
    total = query.order_by(None).count()
    query = apply_member_sort(query, sort)
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return MemberListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=MemberDetailOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=MemberDetailOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_member(
    *,
    payload: MemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> MemberDetailOut:
    username = generate_username(db, payload.first_name, payload.last_name)
    member = Member(
        first_name=payload.first_name,
        middle_name=payload.middle_name,
        last_name=payload.last_name,
        username=username,
        email=payload.email,
        phone=payload.phone,
        birth_date=payload.birth_date,
        join_date=payload.join_date,
        gender=payload.gender,
        address=payload.address,
        district=payload.district,
        status=payload.status,
        is_tither=payload.is_tither,
        contribution_method=payload.contribution_method,
        contribution_amount=payload.contribution_amount,
        notes=payload.notes,
        household_id=payload.household_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    _apply_spouse(member, payload.spouse.dict() if payload.spouse else None)
    _apply_children(member, [child.dict() for child in payload.children])
    db.add(member)
    db.flush()

    if payload.tag_ids:
        _set_tags(db, member, payload.tag_ids)
    if payload.ministry_ids:
        _set_ministries(db, member, payload.ministry_ids)

    db.commit()
    db.refresh(member)
    return MemberDetailOut.from_orm(member)


@router.get("/{member_id}", response_model=MemberDetailOut)
def get_member(
    member_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> MemberDetailOut:
    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return MemberDetailOut.from_orm(member)


@router.put("/{member_id}", response_model=MemberDetailOut)
@router.patch("/{member_id}", response_model=MemberDetailOut)
def update_member(
    *,
    member_id: int,
    payload: MemberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> MemberDetailOut:
    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    old_snapshot = snapshot_member(member)

    if payload.first_name is not None:
        member.first_name = payload.first_name
    if payload.middle_name is not None:
        member.middle_name = payload.middle_name
    if payload.last_name is not None:
        member.last_name = payload.last_name
    if payload.email is not None:
        member.email = payload.email
    if payload.phone is not None:
        member.phone = payload.phone
    if payload.birth_date is not None:
        member.birth_date = payload.birth_date
    if payload.join_date is not None:
        member.join_date = payload.join_date
    if payload.gender is not None:
        member.gender = payload.gender
    if payload.address is not None:
        member.address = payload.address
    if payload.district is not None:
        member.district = payload.district
    if payload.status is not None:
        member.status = payload.status
    if payload.is_tither is not None:
        member.is_tither = payload.is_tither
    if payload.contribution_method is not None:
        member.contribution_method = payload.contribution_method
    if payload.contribution_amount is not None:
        member.contribution_amount = payload.contribution_amount
    if payload.notes is not None:
        member.notes = payload.notes
    if payload.household_id is not None:
        member.household_id = payload.household_id

    if payload.spouse is not None:
        _apply_spouse(member, payload.spouse.dict())
    if payload.children is not None:
        _apply_children(member, [child.dict() for child in payload.children])

    if payload.tag_ids is not None:
        _set_tags(db, member, payload.tag_ids)
    if payload.ministry_ids is not None:
        _set_ministries(db, member, payload.ministry_ids)

    if member.username is None or payload.first_name or payload.last_name:
        member.username = generate_username(db, member.first_name, member.last_name)

    member.updated_by_id = current_user.id

    db.flush()
    record_member_changes(db, member, old_snapshot, current_user.id)
    db.commit()
    db.refresh(member)
    return MemberDetailOut.from_orm(member)


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(
    member_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*DELETE_ROLES)),
    current_user=Depends(get_current_user),
) -> Response:
    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    old_snapshot = snapshot_member(member)
    member.deleted_at = datetime.utcnow()
    member.status = "Archived"
    member.updated_by_id = current_user.id

    db.flush()
    record_member_changes(db, member, old_snapshot, current_user.id)
    db.commit()

    logger.info("member archived", extra={"actor": current_user.email, "member": member.username})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{member_id}/restore", response_model=MemberDetailOut)
def restore_member(
    member_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*DELETE_ROLES)),
    current_user=Depends(get_current_user),
) -> MemberDetailOut:
    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.isnot(None))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found or not archived")

    old_snapshot = snapshot_member(member)
    member.deleted_at = None
    member.status = "Inactive"
    member.updated_by_id = current_user.id

    db.flush()
    record_member_changes(db, member, old_snapshot, current_user.id)
    db.commit()
    db.refresh(member)
    return MemberDetailOut.from_orm(member)
