from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal

from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import get_current_user
from app.core.db import get_db
from app.models.household import Household
from app.models.member import Member
from app.models.payment import Payment, PaymentServiceType
from app.models.schools import SundaySchoolEnrollment
from app.models.sponsorship import Sponsorship
from app.models.user import User
from app.routers.members import _attach_membership_metadata, _decimal_or_none, _sunday_participant_status
from app.schemas.member import MemberDetailOut, MemberSundaySchoolParticipantOut, MemberSundaySchoolPaymentOut
from app.schemas.reports import (
    IndividualMemberReportResponse,
    IndividualSponsorshipReportItem,
    NewcomerReportResponse,
    ParishCouncilReportResponse,
    ReportActivityItem,
    ClientMembershipChildField,
    ClientMembershipReportFields,
    ClientPaymentReportRow,
    ClientPaymentYearSummary,
    ClientReportFields,
    ClientSponsorshipReportFields,
    ClientSponsorshipVolunteerRow,
)
from app.schemas.sunday_school import SundaySchoolReportRow
from app.services import parish_councils as parish_council_service
from app.services import reporting as reporting_service
from app.services.sunday_school import SUNDAY_SCHOOL_SERVICE_CODE
from app.services import sunday_school as sunday_school_service
from app.services.permissions import has_field_permission, has_module_permission

router = APIRouter(prefix="/reports", tags=["Reports"])


def _parse_sponsorship_volunteer_services(raw: str | list[str] | None, fallback: str | None = None) -> list[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return [str(item).strip() for item in data if str(item).strip()]
        except json.JSONDecodeError:
            pass
        return [item.strip() for item in raw.split(",") if item.strip()]
    if fallback:
        return [fallback]
    return []


def _payment_year_summaries(payments: list[Payment], *, minimum_years: int = 3) -> list[ClientPaymentYearSummary]:
    current_year = datetime.now(timezone.utc).year
    years = {current_year - offset for offset in range(minimum_years)}
    for payment in payments:
        years.add(payment.posted_at.year)

    summaries: list[ClientPaymentYearSummary] = []
    for year in sorted(years, reverse=True):
        year_payments = [payment for payment in payments if payment.posted_at.year == year]
        currency = year_payments[0].currency if year_payments else "CAD"
        total = sum((Decimal(str(payment.amount or 0)) for payment in year_payments), Decimal("0"))
        summaries.append(
            ClientPaymentYearSummary(
                year=year,
                total_amount=total,
                currency=currency,
                payment_count=len(year_payments),
            )
        )
    return summaries


def _date_in_range(value: date | datetime | None, start_date: date | None, end_date: date | None) -> bool:
    if value is None:
        return False
    value_date = value.date() if isinstance(value, datetime) else value
    return (start_date is None or value_date >= start_date) and (end_date is None or value_date <= end_date)


def require_report_access(report_field: str, *, source_module: str | None = None) -> Callable[..., User]:
    def checker(user: User = Depends(get_current_user)) -> User:
        if not has_field_permission(user, "reports", report_field, "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Report access denied")
        if source_module and not has_module_permission(user, source_module, "read"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Report source access denied")
        return user

    return checker


@router.get("/sunday-school", response_model=list[SundaySchoolReportRow])
def sunday_school_report(
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    _: User = Depends(require_report_access("schools", source_module="schools")),
) -> list[SundaySchoolReportRow]:
    return sunday_school_service.sunday_school_report(db, start=start, end=end)


@router.get("/activity", response_model=list[ReportActivityItem])
def report_activity(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_report_access("overview")),
) -> list[ReportActivityItem]:
    return reporting_service.get_report_activity(db, limit=limit, start_date=start_date, end_date=end_date)


@router.get("/newcomers", response_model=NewcomerReportResponse)
def newcomer_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_report_access("newcomers", source_module="newcomers")),
) -> NewcomerReportResponse:
    return reporting_service.get_newcomer_report(db, start_date=start_date, end_date=end_date)


def _build_individual_member_report(
    member_id: int,
    current_user: User,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    include_sponsorship_details: bool = True,
) -> IndividualMemberReportResponse:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date must be on or before end date")

    financial_access = has_module_permission(current_user, "payments", "read") or has_field_permission(
        current_user, "members", "contribution", "read"
    )
    if not financial_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Individual member report requires finance access because it includes payment history.",
        )

    member = (
        db.query(Member)
        .options(
            selectinload(Member.children_all),
            selectinload(Member.household).selectinload(Household.members),
            selectinload(Member.spouse),
            selectinload(Member.tags),
            selectinload(Member.ministries),
            selectinload(Member.father_confessor),
            selectinload(Member.contribution_payments),
        )
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    _attach_membership_metadata(member)

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

    sunday_service = db.query(PaymentServiceType).filter(PaymentServiceType.code == SUNDAY_SCHOOL_SERVICE_CODE).first()
    sunday_payment_payload: list[MemberSundaySchoolPaymentOut] = []
    if sunday_service:
        sunday_payment_query = (
            db.query(Payment)
            .options(selectinload(Payment.service_type))
            .filter(Payment.member_id == member.id, Payment.service_type_id == sunday_service.id)
        )
        if start_date:
            sunday_payment_query = sunday_payment_query.filter(
                Payment.posted_at >= datetime.combine(start_date, datetime.min.time())
            )
        if end_date:
            sunday_payment_query = sunday_payment_query.filter(
                Payment.posted_at <= datetime.combine(end_date, datetime.max.time())
            )
        sunday_payment_payload = [
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
            for payment in (
                sunday_payment_query
                .order_by(Payment.posted_at.desc())
                .limit(25)
                .all()
            )
        ]

    contribution_history = [
        payment
        for payment in member.contribution_history
        if _date_in_range(payment.paid_at, start_date, end_date)
    ]
    detail = MemberDetailOut.from_orm(member)
    detail = detail.copy(
        update={
            "sunday_school_participants": participant_payload,
            "sunday_school_payments": sunday_payment_payload,
            "contribution_history": contribution_history,
            "membership_events": [
                event
                for event in detail.membership_events
                if _date_in_range(event.timestamp, start_date, end_date)
            ],
        }
    )

    payment_query = (
        db.query(Payment)
        .options(
            selectinload(Payment.service_type),
            selectinload(Payment.receipts),
            selectinload(Payment.member),
            selectinload(Payment.household),
        )
        .filter(Payment.member_id == member.id)
    )
    if start_date:
        payment_query = payment_query.filter(Payment.posted_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        payment_query = payment_query.filter(Payment.posted_at <= datetime.combine(end_date, datetime.max.time()))
    payments = payment_query.order_by(Payment.posted_at.desc(), Payment.id.desc()).limit(100).all()

    sponsorships: list[Sponsorship] = []
    if include_sponsorship_details:
        sponsorship_query = (
            db.query(Sponsorship)
            .filter(or_(Sponsorship.sponsor_member_id == member.id, Sponsorship.beneficiary_member_id == member.id))
        )
        if start_date:
            sponsorship_query = sponsorship_query.filter(Sponsorship.start_date >= start_date)
        if end_date:
            sponsorship_query = sponsorship_query.filter(Sponsorship.start_date <= end_date)
        sponsorships = sponsorship_query.order_by(Sponsorship.created_at.desc(), Sponsorship.id.desc()).limit(100).all()
    sponsorship_payload = [
        IndividualSponsorshipReportItem(
            id=item.id,
            role="Sponsor" if item.sponsor_member_id == member.id else "Beneficiary",
            beneficiary_name=item.beneficiary_name,
            status=item.status,
            program=item.program,
            frequency=item.frequency,
            monthly_amount=item.monthly_amount,
            received_amount=item.received_amount,
            start_date=item.start_date,
            end_date=item.end_date,
            notes=item.notes,
        )
        for item in sponsorships
    ]
    sponsored_cases = [item for item in sponsorships if item.sponsor_member_id == member.id]
    last_sponsored_case = next(
        (
            item
            for item in sorted(
                sponsored_cases,
                key=lambda sponsorship: (
                    sponsorship.last_sponsored_date or sponsorship.start_date,
                    sponsorship.created_at,
                    sponsorship.id,
                ),
                reverse=True,
            )
        ),
        None,
    )
    volunteer_rows: list[ClientSponsorshipVolunteerRow] = []
    for item in sponsored_cases:
        services = _parse_sponsorship_volunteer_services(item.volunteer_services, item.volunteer_service)
        if item.volunteer_service_other:
            services.append(item.volunteer_service_other)
        for service in services:
            volunteer_rows.append(
                ClientSponsorshipVolunteerRow(
                    volunteer_date=item.start_date,
                    service_type=service,
                )
            )

    payment_years = _payment_year_summaries(payments)
    client_report_fields = ClientReportFields(
        membership=ClientMembershipReportFields(
            first_name=member.first_name,
            last_name=member.last_name,
            membership_date=member.join_date,
            spouse_name=detail.spouse.full_name if detail.spouse else None,
            children=[
                ClientMembershipChildField(
                    child_name=child.full_name,
                    birth_year=child.birth_date.year if child.birth_date else None,
                )
                for child in detail.children
            ],
        ),
        payments=[
            ClientPaymentReportRow(
                first_name=member.first_name,
                last_name=member.last_name,
                amount=payment.amount,
                currency=payment.currency,
                payment_date=payment.posted_at,
                email=member.email,
            )
            for payment in payments
        ],
        payment_years=payment_years,
        sponsorship=ClientSponsorshipReportFields(
            first_name=member.first_name,
            last_name=member.last_name,
            membership_date=member.join_date,
            payment_information_by_year=payment_years,
            volunteer_rows=volunteer_rows,
            last_sponsored_date=last_sponsored_case.last_sponsored_date if last_sponsored_case else None,
            number_sponsored=len(sponsored_cases),
            last_sponsor_status=(
                str(last_sponsored_case.last_status or last_sponsored_case.status)
                if last_sponsored_case
                else None
            ),
        ),
    )

    return IndividualMemberReportResponse(
        generated_at=datetime.now(timezone.utc),
        financial_access=financial_access,
        member=detail,
        household=member.household,
        children=detail.children,
        spouse=detail.spouse,
        tags=detail.tags,
        ministries=detail.ministries,
        sunday_school_participants=participant_payload,
        sunday_school_payments=sunday_payment_payload,
        contribution_history=detail.contribution_history,
        payments=payments,
        sponsorships=sponsorship_payload,
        membership_health=detail.membership_health,
        membership_events=detail.membership_events,
        client_report_fields=client_report_fields,
    )


@router.get("/members/{member_id}/individual", response_model=IndividualMemberReportResponse)
def individual_member_report(
    member_id: int,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_report_access("members", source_module="members")),
) -> IndividualMemberReportResponse:
    return _build_individual_member_report(member_id, current_user, start_date, end_date, db)


@router.get("/payments/members/{member_id}/individual", response_model=IndividualMemberReportResponse)
def individual_payment_member_report(
    member_id: int,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_report_access("payments", source_module="payments")),
) -> IndividualMemberReportResponse:
    return _build_individual_member_report(
        member_id,
        current_user,
        start_date,
        end_date,
        db,
        include_sponsorship_details=False,
    )


@router.get("/parish-councils", response_model=ParishCouncilReportResponse)
def parish_council_report(
    department_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
    active_only: bool = Query(default=False),
    expiring_in_days: int | None = Query(default=None, ge=1, le=365),
    start_date_from: date | None = Query(default=None),
    start_date_to: date | None = Query(default=None),
    end_date_from: date | None = Query(default=None),
    end_date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_report_access("councils")),
) -> ParishCouncilReportResponse:
    return ParishCouncilReportResponse(
        **parish_council_service.build_report_payload(
            db,
            department_id=department_id,
            status=status_filter,
            q=q,
            active_only=active_only,
            expiring_in_days=expiring_in_days,
            start_date_from=start_date_from,
            start_date_to=start_date_to,
            end_date_from=end_date_from,
            end_date_to=end_date_to,
        )
    )
