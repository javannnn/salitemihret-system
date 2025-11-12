from __future__ import annotations

from datetime import date


def test_sponsorship_flow_with_newcomer_conversion(
    client,
    authorize,
    public_relations_user,
    sponsorship_user,
    sample_member,
):
    authorize(public_relations_user)
    newcomer_payload = {
        "first_name": "Hanna",
        "last_name": "Bekele",
        "contact_phone": "+251900777000",
        "arrival_date": date.today().isoformat(),
        "service_type": "Family Settlement",
        "notes": "Arrived last Sunday",
    }
    newcomer_resp = client.post("/newcomers", json=newcomer_payload)
    assert newcomer_resp.status_code == 201, newcomer_resp.text
    newcomer_id = newcomer_resp.json()["id"]

    authorize(sponsorship_user)
    sponsorship_payload = {
        "sponsor_member_id": sample_member.id,
        "newcomer_id": newcomer_id,
        "monthly_amount": "150.00",
        "start_date": date.today().isoformat(),
        "status": "Active",
        "frequency": "Monthly",
        "program": "Family Support",
    }
    create_resp = client.post("/sponsorships", json=sponsorship_payload)
    assert create_resp.status_code == 201, create_resp.text
    sponsorship_id = create_resp.json()["id"]
    assert create_resp.json()["newcomer"]["id"] == newcomer_id

    authorize(public_relations_user)
    convert_resp = client.post(
        f"/newcomers/{newcomer_id}/convert",
        json={"phone": "+251911223344", "status": "Active"},
    )
    assert convert_resp.status_code == 200, convert_resp.text
    assert convert_resp.json()["status"] == "Converted"

    authorize(sponsorship_user)
    detail_resp = client.get(f"/sponsorships/{sponsorship_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["beneficiary_member"] is not None
    assert detail["newcomer"] is None


def test_office_admin_cannot_create_sponsorship(
    client,
    authorize,
    office_admin_user,
    sample_member,
):
    authorize(office_admin_user)
    payload = {
        "sponsor_member_id": sample_member.id,
        "beneficiary_name": "Test Beneficiary",
        "monthly_amount": "50.00",
        "start_date": date.today().isoformat(),
        "status": "Draft",
        "frequency": "OneTime",
    }
    resp = client.post("/sponsorships", json=payload)
    assert resp.status_code == 403


def test_newcomer_requires_contact_info(client, authorize, public_relations_user):
    authorize(public_relations_user)
    payload = {
        "first_name": "Lensa",
        "last_name": "Abebe",
        "arrival_date": date.today().isoformat(),
        "service_type": "Welcome",
    }
    resp = client.post("/newcomers", json=payload)
    assert resp.status_code == 422
