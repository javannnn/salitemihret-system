from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.household import Household
from app.models.member import Member
from app.models.member_contribution_payment import MemberContributionPayment
from app.models.newcomer import Newcomer
from app.models.payment import Payment
from app.models.schools import AbenetEnrollment, SundaySchoolEnrollment
from app.models.sponsorship import Sponsorship
from app.models.user import UserInvitation, UserMemberLink
from app.schemas.member import MemberDeletionDependency, MemberPermanentDeleteImpact


@dataclass(frozen=True)
class _DependencySpec:
    key: str
    label: str
    severity: str
    message_template: str


_BLOCKER_DEPENDENCIES: tuple[_DependencySpec, ...] = (
    _DependencySpec(
        key="sponsorships_as_sponsor",
        label="Sponsorships",
        severity="blocker",
        message_template="Deleting this member would permanently remove {count} sponsorship record{s}.",
    ),
    _DependencySpec(
        key="contribution_payments",
        label="Contribution payment history",
        severity="blocker",
        message_template="Deleting this member would permanently remove {count} contribution payment record{s}.",
    ),
    _DependencySpec(
        key="sunday_school_enrollments",
        label="Sunday school enrollments",
        severity="blocker",
        message_template="Deleting this member would permanently remove {count} Sunday school enrollment record{s}.",
    ),
    _DependencySpec(
        key="abenet_enrollments",
        label="Abenet enrollments",
        severity="blocker",
        message_template="Deleting this member would permanently remove {count} Abenet enrollment record{s}.",
    ),
)

_WARNING_DEPENDENCIES: tuple[_DependencySpec, ...] = (
    _DependencySpec(
        key="payments",
        label="Payments ledger links",
        severity="warning",
        message_template="The member link would be removed from {count} payment record{s}.",
    ),
    _DependencySpec(
        key="sponsorships_as_beneficiary",
        label="Sponsorship beneficiaries",
        severity="warning",
        message_template="The member link would be removed from {count} sponsorship beneficiary record{s}.",
    ),
    _DependencySpec(
        key="newcomers_sponsored",
        label="Newcomer sponsor references",
        severity="warning",
        message_template="The sponsor link would be removed from {count} newcomer record{s}.",
    ),
    _DependencySpec(
        key="newcomers_converted",
        label="Newcomer conversions",
        severity="warning",
        message_template="The converted-member link would be removed from {count} newcomer record{s}.",
    ),
    _DependencySpec(
        key="household_headships",
        label="Household head assignments",
        severity="warning",
        message_template="This member would be cleared as head of {count} household{s}.",
    ),
    _DependencySpec(
        key="user_member_links",
        label="User-member links",
        severity="warning",
        message_template="The member link would be removed from {count} linked user account{s}.",
    ),
    _DependencySpec(
        key="user_invitations",
        label="Pending user invitations",
        severity="warning",
        message_template="The member link would be removed from {count} user invitation{s}.",
    ),
)


def _plural_suffix(count: int) -> str:
    return "" if count == 1 else "s"


def _member_display_name(member: Member) -> str:
    return " ".join(part for part in [member.first_name, member.middle_name, member.last_name] if part).strip()


def _count_dependencies(db: Session, member_id: int) -> dict[str, int]:
    return {
        "sponsorships_as_sponsor": db.query(Sponsorship).filter(Sponsorship.sponsor_member_id == member_id).count(),
        "contribution_payments": db.query(MemberContributionPayment).filter(MemberContributionPayment.member_id == member_id).count(),
        "sunday_school_enrollments": db.query(SundaySchoolEnrollment).filter(SundaySchoolEnrollment.member_id == member_id).count(),
        "abenet_enrollments": db.query(AbenetEnrollment).filter(AbenetEnrollment.parent_member_id == member_id).count(),
        "payments": db.query(Payment).filter(Payment.member_id == member_id).count(),
        "sponsorships_as_beneficiary": db.query(Sponsorship).filter(Sponsorship.beneficiary_member_id == member_id).count(),
        "newcomers_sponsored": db.query(Newcomer).filter(Newcomer.sponsored_by_member_id == member_id).count(),
        "newcomers_converted": db.query(Newcomer).filter(Newcomer.converted_member_id == member_id).count(),
        "household_headships": db.query(Household).filter(Household.head_member_id == member_id).count(),
        "user_member_links": db.query(UserMemberLink).filter(UserMemberLink.member_id == member_id).count(),
        "user_invitations": db.query(UserInvitation).filter(UserInvitation.member_id == member_id).count(),
    }


def _build_dependency_item(spec: _DependencySpec, count: int) -> MemberDeletionDependency:
    return MemberDeletionDependency(
        key=spec.key,
        label=spec.label,
        count=count,
        severity=spec.severity,  # type: ignore[arg-type]
        message=spec.message_template.format(count=count, s=_plural_suffix(count)),
    )


def build_member_permanent_delete_impact(db: Session, member: Member) -> MemberPermanentDeleteImpact:
    counts = _count_dependencies(db, member.id)
    blockers = [_build_dependency_item(spec, counts[spec.key]) for spec in _BLOCKER_DEPENDENCIES if counts[spec.key] > 0]
    warnings = [_build_dependency_item(spec, counts[spec.key]) for spec in _WARNING_DEPENDENCIES if counts[spec.key] > 0]
    return MemberPermanentDeleteImpact(
        member_id=member.id,
        member_name=_member_display_name(member) or member.username,
        can_delete=not blockers,
        blockers=blockers,
        warnings=warnings,
    )


def permanently_delete_member_record(db: Session, member: Member) -> None:
    db.query(Payment).filter(Payment.member_id == member.id).update({Payment.member_id: None}, synchronize_session=False)
    db.query(Sponsorship).filter(Sponsorship.beneficiary_member_id == member.id).update(
        {Sponsorship.beneficiary_member_id: None},
        synchronize_session=False,
    )
    db.query(Newcomer).filter(Newcomer.sponsored_by_member_id == member.id).update(
        {Newcomer.sponsored_by_member_id: None},
        synchronize_session=False,
    )
    db.query(Newcomer).filter(Newcomer.converted_member_id == member.id).update(
        {Newcomer.converted_member_id: None},
        synchronize_session=False,
    )
    db.query(Household).filter(Household.head_member_id == member.id).update(
        {Household.head_member_id: None},
        synchronize_session=False,
    )
    db.query(UserMemberLink).filter(UserMemberLink.member_id == member.id).update(
        {UserMemberLink.member_id: None},
        synchronize_session=False,
    )
    db.query(UserInvitation).filter(UserInvitation.member_id == member.id).update(
        {UserInvitation.member_id: None},
        synchronize_session=False,
    )
    db.flush()
    db.delete(member)
