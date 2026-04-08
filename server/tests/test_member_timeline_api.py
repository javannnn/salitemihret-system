from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.models.member_audit import MemberAudit
from app.models.member_contribution_payment import MemberContributionPayment
from app.models.payment import Payment, PaymentServiceType


def test_member_timeline_merges_profile_finance_and_contribution_events(
    client,
    authorize,
    admin_user,
    db_session,
    sample_member,
):
    authorize(admin_user)
    donation_service = PaymentServiceType(code="DONATION", label="General Donation", active=True)
    db_session.add(donation_service)
    db_session.flush()

    db_session.add(
        Payment(
            amount=Decimal("80.00"),
            currency="CAD",
            method="Cash",
            memo="Sunday collection",
            service_type_id=donation_service.id,
            member_id=sample_member.id,
            recorded_by_id=admin_user.id,
            status="Completed",
        )
    )
    db_session.add(
        MemberContributionPayment(
            member_id=sample_member.id,
            amount=Decimal("75.00"),
            currency="CAD",
            paid_at=date(2026, 3, 1),
            method="Cash",
            note="Monthly contribution",
            recorded_by_id=admin_user.id,
        )
    )
    db_session.add(
        MemberAudit(
            member_id=sample_member.id,
            field="notes",
            old_value=None,
            new_value="Updated pastoral note",
            changed_by_id=admin_user.id,
        )
    )
    db_session.commit()

    response = client.get(f"/members/{sample_member.id}/timeline")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total"] >= 3

    categories = {item["category"] for item in payload["items"]}
    assert "Profile" in categories
    assert "Payment" in categories
    assert "Contribution" in categories
