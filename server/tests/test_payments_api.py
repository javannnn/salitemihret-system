from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from app.models.payment import Payment, PaymentServiceType


def _ensure_service_type(session, code: str = "DONATION", label: str = "General Donation") -> PaymentServiceType:
    existing = session.query(PaymentServiceType).filter_by(code=code).first()
    if existing:
        return existing
    record = PaymentServiceType(code=code, label=label, active=True)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def test_correct_payment_posts_reversal_and_replacement(client, authorize, admin_user, db_session, sample_member):
    authorize(admin_user)
    _ensure_service_type(db_session)

    create_response = client.post(
        "/payments",
        json={
            "amount": 75,
            "currency": "CAD",
            "method": "Cash",
            "memo": "Original ledger entry",
            "service_type_code": "DONATION",
            "member_id": sample_member.id,
            "status": "Completed",
        },
    )
    assert create_response.status_code == 201, create_response.text
    original_id = create_response.json()["id"]

    correction_response = client.post(
        f"/payments/{original_id}/correct",
        json={
            "correction_reason": "Amount was keyed incorrectly",
            "replacement": {
                "amount": 150,
                "currency": "CAD",
                "method": "Check",
                "memo": "Corrected ledger entry",
                "service_type_code": "DONATION",
                "member_id": sample_member.id,
                "status": "Completed",
            },
        },
    )
    assert correction_response.status_code == 201, correction_response.text
    payload = correction_response.json()
    assert payload["original_payment_id"] == original_id
    assert payload["reversal"]["entry_kind"] == "Reversal"
    assert payload["replacement"]["entry_kind"] == "Replacement"

    db_session.expire_all()
    adjustments = (
        db_session.query(Payment)
        .filter(Payment.correction_of_id == original_id)
        .order_by(Payment.id.asc())
        .all()
    )
    assert len(adjustments) == 2
    assert [Decimal(str(item.amount)) for item in adjustments] == [Decimal("-75.00"), Decimal("150.00")]


def test_void_payment_posts_reversal_only(client, authorize, admin_user, db_session, sample_member):
    authorize(admin_user)
    _ensure_service_type(db_session)

    create_response = client.post(
        "/payments",
        json={
            "amount": 120,
            "currency": "CAD",
            "method": "Debit Card",
            "memo": "Mistaken entry",
            "service_type_code": "DONATION",
            "member_id": sample_member.id,
            "status": "Completed",
        },
    )
    assert create_response.status_code == 201, create_response.text
    original_id = create_response.json()["id"]

    void_response = client.post(
        f"/payments/{original_id}/void",
        json={"reason": "Duplicate payment was entered"},
    )
    assert void_response.status_code == 201, void_response.text
    payload = void_response.json()
    assert payload["original_payment_id"] == original_id
    assert payload["replacement"] is None
    assert payload["reversal"]["entry_kind"] == "Reversal"

    db_session.expire_all()
    adjustments = (
        db_session.query(Payment)
        .filter(Payment.correction_of_id == original_id)
        .order_by(Payment.id.asc())
        .all()
    )
    assert len(adjustments) == 1
    assert Decimal(str(adjustments[0].amount)) == Decimal("-120.00")


def test_contribution_requires_active_member(client, authorize, admin_user, db_session):
    authorize(admin_user)
    _ensure_service_type(db_session, "CONTRIBUTION", "Monthly Contribution")

    response = client.post(
        "/payments",
        json={
            "amount": 75,
            "currency": "CAD",
            "method": "Cash",
            "service_type_code": "CONTRIBUTION",
            "status": "Completed",
        },
    )

    assert response.status_code == 400
    assert "linked to an active member" in response.text


def test_non_member_donation_records_and_searches_donor(client, authorize, admin_user, db_session):
    authorize(admin_user)
    _ensure_service_type(db_session, "DONATION", "General Donation")

    create_response = client.post(
        "/payments",
        json={
            "amount": 45,
            "currency": "CAD",
            "method": "Cash",
            "service_type_code": "DONATION",
            "donor_first_name": "Marta",
            "donor_last_name": "Tesfaye",
            "donor_email": "marta@example.com",
            "status": "Completed",
        },
    )

    assert create_response.status_code == 201, create_response.text
    payload = create_response.json()
    assert payload["member_id"] is None
    assert payload["donor_first_name"] == "Marta"

    search_response = client.get("/payments", params={"member_name": "Marta"})
    assert search_response.status_code == 200, search_response.text
    assert search_response.json()["total"] == 1
    assert search_response.json()["items"][0]["donor_last_name"] == "Tesfaye"


def test_non_member_non_donation_is_rejected(client, authorize, admin_user, db_session):
    authorize(admin_user)
    _ensure_service_type(db_session, "TITHE", "Tithe")

    response = client.post(
        "/payments",
        json={
            "amount": 25,
            "currency": "CAD",
            "method": "Cash",
            "service_type_code": "TITHE",
            "status": "Completed",
        },
    )

    assert response.status_code == 400
    assert "only allowed for General Donation" in response.text


def test_archived_member_payment_is_hidden_from_active_ledger(client, authorize, admin_user, db_session, sample_member):
    authorize(admin_user)
    service_type = _ensure_service_type(db_session, "DONATION", "General Donation")
    db_session.add(
        Payment(
            amount=Decimal("25.00"),
            currency="CAD",
            method="Cash",
            service_type_id=service_type.id,
            member_id=sample_member.id,
            status="Completed",
        )
    )
    sample_member.deleted_at = datetime.now(UTC)
    db_session.commit()

    response = client.get("/payments")

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 0


def test_corrected_six_month_contribution_activates_member(client, authorize, admin_user, db_session, sample_member):
    authorize(admin_user)
    _ensure_service_type(db_session, "CONTRIBUTION", "Monthly Contribution")
    sample_member.contribution_amount = Decimal("75.00")
    sample_member.status = "Pending"
    sample_member.status_auto = "Pending"
    db_session.commit()

    create_response = client.post(
        "/payments",
        json={
            "amount": 75,
            "currency": "CAD",
            "method": "Cash",
            "service_type_code": "CONTRIBUTION",
            "member_id": sample_member.id,
            "status": "Completed",
        },
    )
    assert create_response.status_code == 201, create_response.text
    original_id = create_response.json()["id"]

    correction_response = client.post(
        f"/payments/{original_id}/correct",
        json={
            "correction_reason": "Member paid six months at once",
            "replacement": {
                "amount": 450,
                "currency": "CAD",
                "method": "Cash",
                "service_type_code": "CONTRIBUTION",
                "member_id": sample_member.id,
                "status": "Completed",
            },
        },
    )

    assert correction_response.status_code == 201, correction_response.text
    db_session.refresh(sample_member)
    assert sample_member.status_auto == "Active"
    assert sample_member.status == "Active"
