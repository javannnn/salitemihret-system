from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import require_roles
from app.core.db import get_db
from app.models.household import Household
from app.models.member import Member
from app.models.user import User
from app.routers.members import READ_ROLES as MEMBER_READ_ROLES
from app.routers.members import WRITE_ROLES as MEMBER_WRITE_ROLES
from app.schemas.household import (
    HouseholdCreate,
    HouseholdDetail,
    HouseholdListResponse,
    HouseholdListItem,
    HouseholdMemberAssignment,
    HouseholdMemberRef,
    HouseholdOut,
    HouseholdUpdate,
)

router = APIRouter(prefix="/households", tags=["households"])


def _get_household_or_404(db: Session, household_id: int) -> Household:
    household = (
        db.query(Household)
        .options(selectinload(Household.head), selectinload(Household.members))
        .filter(Household.id == household_id)
        .first()
    )
    if household is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    return household


def _serialize_household(household: Household, members_count: int | None = None) -> HouseholdListItem:
    head_name: str | None = None
    if household.head:
        head_name = f"{household.head.first_name} {household.head.last_name}".strip()

    count = members_count if members_count is not None else len([m for m in household.members if m.deleted_at is None])
    return HouseholdListItem(
        id=household.id,
        name=household.name,
        head_member_id=household.head_member_id,
        head_member_name=head_name or None,
        members_count=count,
    )


@router.get("", response_model=HouseholdListResponse)
def list_households(
    *,
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MEMBER_READ_ROLES)),
) -> HouseholdListResponse:
    query = db.query(Household)
    if q:
        pattern = f"%{q.lower()}%"
        query = query.filter(func.lower(Household.name).like(pattern))
    total = query.count()
    households = (
        query.order_by(Household.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(selectinload(Household.head))
        .all()
    )

    counts: dict[int, int] = {}
    if households:
        rows = (
            db.query(Member.household_id, func.count(Member.id))
            .filter(Member.household_id.in_([h.id for h in households]))
            .group_by(Member.household_id)
            .all()
        )
        counts = {row[0]: row[1] for row in rows if row[0] is not None}

    items = [_serialize_household(household, counts.get(household.id, 0)) for household in households]
    return HouseholdListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=HouseholdListItem, status_code=status.HTTP_201_CREATED)
def create_household(
    payload: HouseholdCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MEMBER_WRITE_ROLES)),
) -> HouseholdListItem:
    existing = (
        db.query(Household)
        .filter(func.lower(Household.name) == payload.name.strip().lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Household already exists")

    household = Household(name=payload.name.strip())
    db.add(household)
    db.flush()

    if payload.head_member_id:
        member = db.query(Member).filter(Member.id == payload.head_member_id).first()
        if not member:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Head member not found")
        member.household_id = household.id
        household.head_member_id = member.id

    db.commit()
    db.refresh(household)
    return _serialize_household(household)


@router.get("/{household_id}", response_model=HouseholdDetail)
def get_household(
    household_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MEMBER_READ_ROLES)),
) -> HouseholdDetail:
    household = _get_household_or_404(db, household_id)
    return _build_household_detail(household)


def _build_household_detail(household: Household) -> HouseholdDetail:
    members = [
        HouseholdMemberRef(id=member.id, first_name=member.first_name, last_name=member.last_name)
        for member in sorted(household.members, key=lambda item: (item.last_name.lower(), item.first_name.lower()))
        if member.deleted_at is None
    ]
    summary = _serialize_household(household, len(members))
    return HouseholdDetail(**summary.dict(), members=members)


@router.patch("/{household_id}", response_model=HouseholdListItem)
def update_household(
    household_id: int,
    payload: HouseholdUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MEMBER_WRITE_ROLES)),
) -> HouseholdListItem:
    household = _get_household_or_404(db, household_id)

    if payload.name:
        cleaned = payload.name.strip()
        conflict = (
            db.query(Household)
            .filter(func.lower(Household.name) == cleaned.lower(), Household.id != household.id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Another household already uses this name")
        household.name = cleaned

    if payload.head_member_id is not None:
        if payload.head_member_id == 0:
            household.head_member_id = None
        else:
            member = db.query(Member).filter(Member.id == payload.head_member_id).first()
            if not member:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Head member not found")
            member.household_id = household.id
            household.head_member_id = member.id

    db.commit()
    db.refresh(household)
    return _serialize_household(household)


@router.delete("/{household_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
def delete_household(
    household_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MEMBER_WRITE_ROLES)),
) -> None:
    household = _get_household_or_404(db, household_id)
    has_members = db.query(Member).filter(Member.household_id == household.id).count()
    if has_members:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Remove members before deleting the household")
    db.delete(household)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{household_id}/members", response_model=HouseholdDetail)
def assign_household_members(
    household_id: int,
    payload: HouseholdMemberAssignment,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MEMBER_WRITE_ROLES)),
) -> HouseholdDetail:
    household = _get_household_or_404(db, household_id)
    member_ids = payload.member_ids

    members: list[Member] = []
    if member_ids:
        members = db.query(Member).filter(Member.id.in_(member_ids)).all()
        missing = set(member_ids) - {member.id for member in members}
        if missing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Members not found: {', '.join(map(str, sorted(missing)))}")

    if payload.head_member_id:
        if payload.head_member_id not in member_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Head member must be part of the household")
        household.head_member_id = payload.head_member_id
    elif member_ids:
        # Preserve existing head if still part of payload
        if household.head_member_id and household.head_member_id in member_ids:
            pass
        else:
            household.head_member_id = member_ids[0]
    else:
        household.head_member_id = None

    # Clear members removed from household
    (
        db.query(Member)
        .filter(Member.household_id == household.id, Member.id.notin_(member_ids if member_ids else [0]))
        .update({Member.household_id: None})
    )

    for member in members:
        member.household_id = household.id

    clear_query = db.query(Member).filter(Member.household_id == household.id)
    if member_ids:
        clear_query = clear_query.filter(~Member.id.in_(member_ids))
    clear_query.update({Member.household_id: None}, synchronize_session=False)

    for member in members:
        member.household_id = household.id

    db.commit()
    db.refresh(household)
    return _build_household_detail(household)
