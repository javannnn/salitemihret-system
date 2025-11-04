from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models.household import Household
from app.models.member import Member
from app.models.member_contribution_payment import MemberContributionPayment
from app.models.ministry import Ministry
from app.models.priest import Priest
from app.models.tag import Tag
from app.models.user import User
from app.schemas.member import (
    ALLOWED_CONTRIBUTION_EXCEPTION_REASONS,
    MemberCreate,
    MemberDetailOut,
    MemberListResponse,
    MemberUpdate,
    ContributionPaymentCreate,
    ContributionPaymentOut,
)
from app.services.audit import record_member_changes, snapshot_member
from app.services.members_query import apply_member_sort, build_members_query
from app.services.members_utils import apply_children, apply_spouse, ensure_household, generate_username
from app.services.notifications import notify_contribution_change

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/members", tags=["members"])

READ_ROLES = ("PublicRelations", "OfficeAdmin", "Registrar", "Admin", "Clerk", "FinanceAdmin")
WRITE_ROLES = ("PublicRelations", "Registrar", "Admin")
DELETE_ROLES = ("PublicRelations", "Admin")
FINANCE_ROLES = ("Admin", "FinanceAdmin")

DEFAULT_CONTRIBUTION_AMOUNT = Decimal("75.00")
DEFAULT_CONTRIBUTION_CURRENCY = "CAD"

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


def _normalize_contribution(amount: Decimal, exception_reason: str | None) -> tuple[Decimal, str | None]:
    amount = amount.quantize(Decimal("0.01"))
    if amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contribution amount must be greater than zero")

    if exception_reason:
        if exception_reason not in ALLOWED_CONTRIBUTION_EXCEPTION_REASONS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid contribution exception reason")
    else:
        if amount != DEFAULT_CONTRIBUTION_AMOUNT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Contribution amount must be {DEFAULT_CONTRIBUTION_AMOUNT} CAD unless an exception reason is selected",
            )
    return amount, exception_reason


def _resolve_contribution_inputs(
    amount_input: float | Decimal | None,
    exception_reason: str | None,
    current_amount: Decimal | None = None,
    current_exception: str | None = None,
) -> tuple[Decimal, str | None]:
    if amount_input is not None:
        amount = Decimal(str(amount_input))
    elif current_amount is not None:
        amount = current_amount
    else:
        amount = DEFAULT_CONTRIBUTION_AMOUNT

    reason = exception_reason if exception_reason is not None else current_exception
    return _normalize_contribution(amount, reason)


def _enforce_contribution_flag(flag: bool | None) -> bool:
    if flag is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Membership contribution is mandatory")
    return True


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
    has_children: bool | None = Query(default=None),
    missing_phone: bool | None = Query(default=None),
    new_this_month: bool | None = Query(default=None),
    ids: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> MemberListResponse:
    member_ids: list[int] | None = None
    if ids:
        try:
            member_ids = [int(value) for value in ids.split(",") if value.strip()]
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid member ids") from exc

    count_query = build_members_query(
        db,
        base_query=db.query(Member.id),
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
    total = count_query.order_by(None).count()

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
    query = query.options(
        selectinload(Member.children_all),
        selectinload(Member.household).selectinload(Household.members),
        selectinload(Member.tags),
        selectinload(Member.ministries),
    )
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
    if payload.marital_status == "Married" and not payload.spouse:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Spouse details are required for married members")

    if payload.has_father_confessor and not payload.father_confessor_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Father confessor selection is required")

    pays_contribution = _enforce_contribution_flag(payload.pays_contribution)
    contribution_amount, contribution_exception = _resolve_contribution_inputs(
        payload.contribution_amount,
        payload.contribution_exception_reason,
    )

    username = generate_username(db, payload.first_name, payload.last_name)
    member = Member(
        first_name=payload.first_name,
        middle_name=payload.middle_name,
        last_name=payload.last_name,
        username=username,
        email=payload.email,
        phone=payload.phone.strip(),
        birth_date=payload.birth_date,
        join_date=payload.join_date,
        gender=payload.gender,
        baptismal_name=payload.baptismal_name,
        marital_status=payload.marital_status,
        address=payload.address,
        address_street=payload.address_street,
        address_city=payload.address_city,
        address_region=payload.address_region,
        address_postal_code=payload.address_postal_code,
        address_country=payload.address_country,
        district=payload.district,
        status=payload.status,
        is_tither=payload.is_tither,
        pays_contribution=pays_contribution,
        contribution_method=payload.contribution_method,
        contribution_amount=contribution_amount,
        contribution_currency=DEFAULT_CONTRIBUTION_CURRENCY,
        contribution_exception_reason=contribution_exception,
        notes=payload.notes,
        household_size_override=payload.household_size_override,
        has_father_confessor=payload.has_father_confessor or bool(payload.father_confessor_id),
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    if payload.household_name:
        member.household = ensure_household(db, payload.household_name)
    elif payload.household_id is not None:
        if payload.household_id == 0:
            member.household = None
        else:
            household = db.query(Household).filter(Household.id == payload.household_id).first()
            if household is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Household not found")
            member.household = household

    apply_spouse(member, payload.spouse.dict() if payload.spouse else None)
    apply_children(member, [child.dict() for child in payload.children])

    if member.has_father_confessor:
        if payload.father_confessor_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Father confessor selection is required")
        priest = db.query(Priest).filter(Priest.id == payload.father_confessor_id).first()
        if not priest:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Father confessor not found")
        member.father_confessor = priest
    else:
        member.father_confessor = None

    db.add(member)
    db.flush()

    if payload.tag_ids:
        _set_tags(db, member, payload.tag_ids)
    if payload.ministry_ids:
        _set_ministries(db, member, payload.ministry_ids)

    db.commit()
    detail_member = (
        db.query(Member)
        .options(
            selectinload(Member.children_all),
            selectinload(Member.household).selectinload(Household.members),
            selectinload(Member.tags),
            selectinload(Member.ministries),
            selectinload(Member.father_confessor),
            selectinload(Member.contribution_payments),
        )
        .filter(Member.id == member.id)
        .first()
    )
    if detail_member is None:
        detail_member = member

    if detail_member.is_tither:
        notify_contribution_change(detail_member, "is_tither", False, True)
    if detail_member.pays_contribution:
        notify_contribution_change(detail_member, "pays_contribution", False, True)

    return MemberDetailOut.from_orm(detail_member)


@router.get("/{member_id}", response_model=MemberDetailOut)
def get_member(
    member_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> MemberDetailOut:
    member = (
        db.query(Member)
        .options(
            selectinload(Member.children_all),
            selectinload(Member.household).selectinload(Household.members),
            selectinload(Member.tags),
            selectinload(Member.ministries),
            selectinload(Member.father_confessor),
            selectinload(Member.contribution_payments),
        )
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
    previous_is_tither = member.is_tither
    previous_pays_contribution = member.pays_contribution

    if payload.first_name is not None:
        member.first_name = payload.first_name
    if payload.middle_name is not None:
        member.middle_name = payload.middle_name
    if payload.last_name is not None:
        member.last_name = payload.last_name
    if payload.baptismal_name is not None:
        member.baptismal_name = payload.baptismal_name
    if payload.email is not None:
        member.email = payload.email
    if payload.phone is not None:
        cleaned_phone = payload.phone.strip() if payload.phone else ""
        if not cleaned_phone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number cannot be empty")
        member.phone = cleaned_phone
    if payload.birth_date is not None:
        member.birth_date = payload.birth_date
    if payload.join_date is not None:
        member.join_date = payload.join_date
    if payload.gender is not None:
        member.gender = payload.gender
    if payload.marital_status is not None:
        member.marital_status = payload.marital_status
    if payload.address is not None:
        member.address = payload.address
    if payload.address_street is not None:
        member.address_street = payload.address_street
    if payload.address_city is not None:
        member.address_city = payload.address_city
    if payload.address_region is not None:
        member.address_region = payload.address_region
    if payload.address_postal_code is not None:
        member.address_postal_code = payload.address_postal_code
    if payload.address_country is not None:
        member.address_country = payload.address_country
    if payload.district is not None:
        member.district = payload.district
    if payload.status is not None:
        member.status = payload.status
    if payload.is_tither is not None:
        member.is_tither = payload.is_tither
    if payload.contribution_method is not None:
        member.contribution_method = payload.contribution_method
    if payload.notes is not None:
        member.notes = payload.notes
    if payload.household_size_override is not None:
        member.household_size_override = payload.household_size_override
    if payload.has_father_confessor is not None:
        member.has_father_confessor = payload.has_father_confessor
    if payload.household_name is not None:
        if payload.household_name.strip():
            member.household = ensure_household(db, payload.household_name)
        else:
            member.household = None
    elif payload.household_id is not None:
        if payload.household_id == 0:
            member.household = None
        else:
            household = db.query(Household).filter(Household.id == payload.household_id).first()
            if household is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Household not found")
            member.household = household

    fields_set = getattr(payload, "__fields_set__", set())

    if "spouse" in fields_set:
        apply_spouse(member, payload.spouse.dict() if payload.spouse else None)

    if "children" in fields_set and payload.children is not None:
        apply_children(member, [child.dict() for child in payload.children])

    if payload.father_confessor_id is not None:
        if payload.father_confessor_id == 0:
            member.father_confessor = None
            member.has_father_confessor = False
        else:
            priest = db.query(Priest).filter(Priest.id == payload.father_confessor_id).first()
            if not priest:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Father confessor not found")
            member.father_confessor = priest
            member.has_father_confessor = True

    if not member.has_father_confessor:
        member.father_confessor = None
    elif member.father_confessor is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Father confessor selection is required")

    if payload.tag_ids is not None:
        _set_tags(db, member, payload.tag_ids)
    if payload.ministry_ids is not None:
        _set_ministries(db, member, payload.ministry_ids)

    if member.username is None or payload.first_name or payload.last_name:
        member.username = generate_username(db, member.first_name, member.last_name)

    if member.marital_status == "Married" and member.spouse is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Spouse details are required for married members")

    current_amount_decimal = Decimal(str(member.contribution_amount or DEFAULT_CONTRIBUTION_AMOUNT))
    new_amount, new_exception = _resolve_contribution_inputs(
        payload.contribution_amount,
        payload.contribution_exception_reason,
        current_amount=current_amount_decimal,
        current_exception=member.contribution_exception_reason,
    )
    member.contribution_amount = new_amount
    member.contribution_exception_reason = new_exception
    member.contribution_currency = DEFAULT_CONTRIBUTION_CURRENCY

    updated_pays_flag = payload.pays_contribution if payload.pays_contribution is not None else member.pays_contribution
    member.pays_contribution = _enforce_contribution_flag(updated_pays_flag)

    member.updated_by_id = current_user.id

    db.flush()
    record_member_changes(db, member, old_snapshot, current_user.id)
    db.commit()
    detail_member = (
        db.query(Member)
        .options(
            selectinload(Member.children_all),
            selectinload(Member.household).selectinload(Household.members),
            selectinload(Member.tags),
            selectinload(Member.ministries),
            selectinload(Member.father_confessor),
            selectinload(Member.contribution_payments),
        )
        .filter(Member.id == member.id)
        .first()
    )
    if detail_member is None:
        detail_member = member

    if detail_member.is_tither != previous_is_tither:
        notify_contribution_change(detail_member, "is_tither", previous_is_tither, detail_member.is_tither)
    if detail_member.pays_contribution != previous_pays_contribution:
        notify_contribution_change(detail_member, "pays_contribution", previous_pays_contribution, detail_member.pays_contribution)

    return MemberDetailOut.from_orm(detail_member)


@router.get(
    "/{member_id}/contributions",
    response_model=list[ContributionPaymentOut],
    status_code=status.HTTP_200_OK,
)
def list_member_contributions(
    member_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*FINANCE_ROLES)),
) -> list[ContributionPaymentOut]:
    member = (
        db.query(Member)
        .options(selectinload(Member.contribution_payments))
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return [ContributionPaymentOut.from_orm(payment) for payment in member.contribution_payments]


@router.post(
    "/{member_id}/contributions",
    response_model=ContributionPaymentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_member_contribution(
    *,
    member_id: int,
    payload: ContributionPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FINANCE_ROLES)),
) -> ContributionPaymentOut:
    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    amount = Decimal(str(payload.amount)).quantize(Decimal("0.01"))
    if amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contribution amount must be greater than zero")

    payment = MemberContributionPayment(
        member_id=member.id,
        amount=amount,
        currency=member.contribution_currency or DEFAULT_CONTRIBUTION_CURRENCY,
        paid_at=payload.paid_at,
        method=payload.method,
        note=payload.note,
        recorded_by_id=current_user.id,
    )
    db.add(payment)
    member.updated_by_id = current_user.id
    db.commit()
    db.refresh(payment)
    return ContributionPaymentOut.from_orm(payment)


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
