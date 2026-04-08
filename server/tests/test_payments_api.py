from __future__ import annotations

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
