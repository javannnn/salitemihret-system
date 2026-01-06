from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models.household import Household
from app.models.member import Member
from app.models.member_contribution_payment import MemberContributionPayment
from app.models.ministry import Ministry
from app.models.payment import Payment, PaymentServiceType
from app.models.schools import SundaySchoolEnrollment
from app.models.priest import Priest
from app.models.tag import Tag
from app.models.user import User
from app.schemas.member import (
    ALLOWED_CONTRIBUTION_EXCEPTION_REASONS,
    MemberCreate,
    MemberDetailOut,
    MemberDuplicateMatch,
    MemberDuplicateResponse,
    MemberListResponse,
    MemberSpouseUpdate,
    MemberUpdate,
    ContributionPaymentCreate,
    ContributionPaymentOut,
    SpouseOut,
    MemberSundaySchoolParticipantOut,
    MemberSundaySchoolPaymentOut,
)
from app.services.audit import record_member_changes, snapshot_member
from app.services.members_query import apply_member_sort, build_members_query
from app.services.members_utils import (
    apply_children,
    apply_spouse,
    ensure_household,
    find_member_duplicates,
    generate_username,
)
from app.services.membership import (
    apply_contribution_payment,
    build_membership_events,
    refresh_membership_state,
    set_status_override,
)
from app.services.notifications import notify_contribution_change
from app.services.sunday_school import SUNDAY_SCHOOL_SERVICE_CODE
from pydantic import ValidationError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/members", tags=["members"])

READ_ROLES = (
    "PublicRelations",
    "OfficeAdmin",
    "Registrar",
    "Admin",
    "Clerk",
    "FinanceAdmin",
    "SponsorshipCommittee",
)
WRITE_ROLES = ("PublicRelations", "Registrar", "Admin")
DELETE_ROLES = ("PublicRelations", "Admin")
FINANCE_ROLES = ("Admin", "FinanceAdmin")
OVERRIDE_ROLES = {"Admin", "PublicRelations", "FinanceAdmin"}

DEFAULT_CONTRIBUTION_AMOUNT = Decimal("75.00")
DEFAULT_CONTRIBUTION_CURRENCY = "CAD"


def _ensure_unique_contacts(
    db: Session,
    *,
    email: str | None,
    phone: str | None,
    exclude_member_id: int | None = None,
) -> None:
    if email:
        existing = (
            db.query(Member)
            .filter(Member.deleted_at.is_(None))
            .filter(func.lower(Member.email) == email.lower().strip())
        )
        if exclude_member_id:
            existing = existing.filter(Member.id != exclude_member_id)
        conflict = existing.first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A member with this email already exists (ID {conflict.id}).",
            )

    if phone:
        existing = (
            db.query(Member)
            .filter(Member.deleted_at.is_(None), Member.phone == phone.strip())
        )
        if exclude_member_id:
            existing = existing.filter(Member.id != exclude_member_id)
        conflict = existing.first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A member with this phone already exists (ID {conflict.id}).",
            )

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


def _can_override_status(user: User) -> bool:
    return any(role.name in OVERRIDE_ROLES for role in getattr(user, "roles", []))


def _attach_membership_metadata(member: Member) -> None:
    health = refresh_membership_state(member, persist=False)
    events = build_membership_events(member, health)
    setattr(member, "membership_health", health.__dict__)
    setattr(member, "membership_events", [event.__dict__ for event in events])


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


def _sunday_participant_status(record: SundaySchoolEnrollment, now_aware: datetime, now_naive: datetime) -> str:
    if not record.pays_contribution:
        return "Not contributing"
    if not record.last_payment_at:
        return "No payments yet"
    last_payment = record.last_payment_at
    if last_payment.tzinfo is None:
        delta_days = (now_naive - last_payment).days
    else:
        delta_days = (now_aware - last_payment).days
    return "Up to date" if delta_days <= 45 else "Overdue"


def _decimal_or_none(value) -> float | None:
    if value is None:
        return None
    return float(value)


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


@router.get("/duplicates", response_model=MemberDuplicateResponse)
def check_member_duplicates(
    *,
    email: str | None = Query(default=None),
    phone: str | None = Query(default=None),
    first_name: str | None = Query(default=None),
    last_name: str | None = Query(default=None),
    exclude_member_id: int | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*READ_ROLES)),
) -> MemberDuplicateResponse:
    if not any([email, phone, first_name and last_name]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide email, phone, or full name to check duplicates")

    matches = find_member_duplicates(
        db,
        email=email,
        phone=phone,
        first_name=first_name,
        last_name=last_name,
        exclude_member_id=exclude_member_id,
        limit=limit,
    )
    items = [
        MemberDuplicateMatch(
            id=member.id,
            first_name=member.first_name,
            last_name=member.last_name,
            email=member.email,
            phone=member.phone,
            reason=", ".join(reasons),
        )
        for member, reasons in matches
    ]
    return MemberDuplicateResponse(items=items)


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

    _ensure_unique_contacts(
        db,
        email=payload.email,
        phone=payload.phone,
    )

    if payload.birth_date:
        today = datetime.now(timezone.utc).date()
        age = today.year - payload.birth_date.year - ((today.month, today.day) < (payload.birth_date.month, payload.birth_date.day))
        if age < 18:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Members must be 18 years or older. Please add them as a child of an existing member.",
            )

    if payload.children:
        today = datetime.now(timezone.utc).date()
        for child in payload.children:
            if child.birth_date:
                child_age = today.year - child.birth_date.year - ((today.month, today.day) < (child.birth_date.month, child.birth_date.day))
                if child_age >= 18:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Child {child.first_name} is over 18. Please register them as an independent member.",
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
    override_requested = any(
        value is not None
        for value in (
            payload.status_override,
            payload.status_override_value,
            payload.status_override_reason,
        )
    )
    if override_requested:
        if not _can_override_status(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Status overrides require Admin, Finance Admin, or Public Relations roles.",
            )
        enabled = payload.status_override if payload.status_override is not None else True
        desired_value = payload.status_override_value or payload.status
        try:
            set_status_override(member, enabled=enabled, value=desired_value, reason=payload.status_override_reason)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    else:
        member.status_override = False
        member.status_override_value = None
        member.status_override_reason = None
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

    refresh_membership_state(member)

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

    _attach_membership_metadata(detail_member)
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
    _attach_membership_metadata(member)
    try:
        response = MemberDetailOut.from_orm(member)
    except ValidationError as exc:
        errors = exc.errors()
        logger.exception(
            "member serialization failed",
            extra={"member_id": member_id, "errors": errors},
        )
        first = errors[0] if errors else {"loc": [], "msg": "Unknown validation error"}
        loc = ".".join(str(part) for part in first.get("loc", []))
        msg = first.get("msg", "Invalid data")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Member {member_id} has invalid data at {loc or 'unknown field'}: {msg}",
        )
    except Exception as exc:  # pragma: no cover
        logger.exception("member detail unexpected error", extra={"member_id": member_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Member {member_id} could not be loaded (unexpected error).",
        ) from exc

    sunday_participants = (
        db.query(SundaySchoolEnrollment)
        .filter(
            SundaySchoolEnrollment.member_id == member.id,
            SundaySchoolEnrollment.is_active.is_(True),
        )
        .order_by(SundaySchoolEnrollment.last_name.asc(), SundaySchoolEnrollment.first_name.asc())
        .all()
    )
    now_aware = datetime.now(timezone.utc)
    now_naive = now_aware.replace(tzinfo=None)
    participant_payload = [
        MemberSundaySchoolParticipantOut(
            id=record.id,
            first_name=record.first_name,
            last_name=record.last_name,
            member_username=record.member_username,
            category=getattr(record.category, "value", record.category),
            pays_contribution=record.pays_contribution,
            monthly_amount=_decimal_or_none(record.monthly_amount),
            payment_method=record.payment_method,
            last_payment_at=record.last_payment_at,
            status=_sunday_participant_status(record, now_aware, now_naive),
        )
        for record in sunday_participants
    ]

    sunday_service = (
        db.query(PaymentServiceType)
        .filter(PaymentServiceType.code == SUNDAY_SCHOOL_SERVICE_CODE)
        .first()
    )
    payment_payload: list[MemberSundaySchoolPaymentOut] = []
    if sunday_service:
        sunday_payments = (
            db.query(Payment)
            .options(selectinload(Payment.service_type))
            .filter(
                Payment.member_id == member.id,
                Payment.service_type_id == sunday_service.id,
            )
            .order_by(Payment.posted_at.desc())
            .limit(10)
            .all()
        )
        payment_payload = [
            MemberSundaySchoolPaymentOut(
                id=payment.id,
                amount=float(payment.amount),
                currency=payment.currency,
                method=payment.method,
                memo=payment.memo,
                posted_at=payment.posted_at,
                status=payment.status,
                service_type_label=payment.service_type.label if payment.service_type else sunday_service.label,
            )
            for payment in sunday_payments
        ]

    return response.copy(
        update={
            "sunday_school_participants": participant_payload,
            "sunday_school_payments": payment_payload,
        }
    )


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
        today = datetime.now(timezone.utc).date()
        if payload.birth_date:
            age = today.year - payload.birth_date.year - ((today.month, today.day) < (payload.birth_date.month, payload.birth_date.day))
            if age < 18:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Members must be 18 years or older. Please add them as a child of an existing member.",
                )
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
    override_requested = any(
        value is not None
        for value in (
            payload.status,
            payload.status_override,
            payload.status_override_value,
            payload.status_override_reason,
        )
    )
    if override_requested:
        if not _can_override_status(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Status overrides require Admin, Finance Admin, or Public Relations roles.",
            )
        enabled = payload.status_override if payload.status_override is not None else True
        desired_value = payload.status_override_value or payload.status or member.status_override_value or member.status
        try:
            set_status_override(member, enabled=enabled, value=desired_value, reason=payload.status_override_reason)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    elif payload.status_override is not None and payload.status_override is False:
        set_status_override(member, enabled=False, value=None, reason=None)
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
        today = datetime.now(timezone.utc).date()
        for child in payload.children:
            if child.birth_date:
                child_age = today.year - child.birth_date.year - ((today.month, today.day) < (child.birth_date.month, child.birth_date.day))
                if child_age >= 18:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Child {child.first_name} is over 18. Please register them as an independent member.",
                    )
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

    refresh_membership_state(member)

    member.updated_by_id = current_user.id

    _ensure_unique_contacts(
        db,
        email=member.email,
        phone=member.phone,
        exclude_member_id=member.id,
    )

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
    _attach_membership_metadata(detail_member)

    if detail_member.is_tither != previous_is_tither:
        notify_contribution_change(detail_member, "is_tither", previous_is_tither, detail_member.is_tither)
    if detail_member.pays_contribution != previous_pays_contribution:
        notify_contribution_change(detail_member, "pays_contribution", previous_pays_contribution, detail_member.pays_contribution)

    return MemberDetailOut.from_orm(detail_member)


@router.patch("/{member_id}/spouse", response_model=SpouseOut | None)
def update_member_spouse(
    *,
    member_id: int,
    payload: MemberSpouseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*WRITE_ROLES)),
) -> SpouseOut | None:
    member = (
        db.query(Member)
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    previous_snapshot = snapshot_member(member)
    desired_status = payload.marital_status if payload.marital_status is not None else member.marital_status
    spouse_payload = payload.spouse.dict() if payload.spouse else None

    if spouse_payload and not desired_status:
        desired_status = "Married"

    if desired_status == "Married" and spouse_payload is None and member.spouse is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Spouse details are required for married members")

    apply_spouse(member, spouse_payload)

    if desired_status is not None:
        member.marital_status = desired_status

    if member.marital_status == "Married" and member.spouse is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Spouse details are required for married members")

    member.updated_by_id = current_user.id

    db.flush()
    record_member_changes(db, member, previous_snapshot, current_user.id)
    db.commit()
    db.refresh(member)

    if member.spouse:
        return SpouseOut.from_orm(member.spouse)
    return None


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
    posted_at = datetime.combine(payload.paid_at, datetime.min.time(), tzinfo=timezone.utc)
    apply_contribution_payment(member, amount=amount, posted_at=posted_at)
    refresh_membership_state(member)
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
    member.status_override = False
    member.status_override_value = None
    member.status_override_reason = None
    refresh_membership_state(member)
    member.updated_by_id = current_user.id

    db.flush()
    record_member_changes(db, member, old_snapshot, current_user.id)
    db.commit()
    db.refresh(member)
    _attach_membership_metadata(member)
    return MemberDetailOut.from_orm(member)
