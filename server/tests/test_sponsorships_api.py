from __future__ import annotations

from datetime import date
import io
import zipfile

from app.models.member import Spouse


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
        "contact_phone": "+16135550199",
        "contact_email": "hanna.bekele@example.com",
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
        "status": "Submitted",
        "frequency": "Monthly",
        "program": "Education",
        "pledge_channel": "InPerson",
        "reminder_channel": "Email",
        "motivation": "ParishInitiative",
        "volunteer_services": ["HolyDayCleanup", "MealSupport"],
        "volunteer_service_other": "Weekend outreach",
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
    assert convert_resp.json()["status"] == "Closed"

    authorize(sponsorship_user)
    detail_resp = client.get(f"/sponsorships/{sponsorship_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["beneficiary_member"] is not None
    assert detail["newcomer"] is None
    assert detail["volunteer_services"] == ["HolyDayCleanup", "MealSupport"]
    assert detail["volunteer_service_other"] == "Weekend outreach"


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


def test_newcomer_requires_email_even_when_phone_is_present(client, authorize, public_relations_user):
    authorize(public_relations_user)
    payload = {
        "first_name": "Meron",
        "last_name": "Abebe",
        "arrival_date": date.today().isoformat(),
        "contact_phone": "+16135550100",
        "service_type": "Welcome",
    }
    resp = client.post("/newcomers", json=payload)
    assert resp.status_code == 422


def test_newcomer_requires_canadian_phone_format(client, authorize, public_relations_user):
    authorize(public_relations_user)
    payload = {
        "first_name": "Selam",
        "last_name": "Abebe",
        "arrival_date": date.today().isoformat(),
        "contact_phone": "+251900777000",
        "contact_email": "selam.abebe@example.com",
        "service_type": "Welcome",
    }
    resp = client.post("/newcomers", json=payload)
    assert resp.status_code == 422


def test_sponsorship_metrics_endpoint(client, authorize, sponsorship_user, sample_member):
    authorize(sponsorship_user)
    payload = {
        "sponsor_member_id": sample_member.id,
        "beneficiary_name": "Metrics Beneficiary",
        "monthly_amount": "75.00",
        "start_date": date.today().isoformat(),
        "status": "Draft",
        "frequency": "Monthly",
    }
    create_resp = client.post("/sponsorships", json=payload)
    assert create_resp.status_code == 201, create_resp.text

    metrics_resp = client.get("/sponsorships/metrics")
    assert metrics_resp.status_code == 200, metrics_resp.text
    metrics = metrics_resp.json()
    assert "active_cases" in metrics
    assert "submitted_cases" in metrics
    assert "month_executed" in metrics
    assert "budget_utilization_percent" in metrics
    assert "alerts" in metrics


def test_sponsorship_csv_export_honors_filters_and_selected_ids(client, authorize, sponsorship_user, sample_member):
    authorize(sponsorship_user)
    payload_a = {
        "sponsor_member_id": sample_member.id,
        "beneficiary_name": "CSV Beneficiary A",
        "monthly_amount": "80.00",
        "start_date": date.today().isoformat(),
        "status": "Draft",
        "frequency": "Monthly",
    }
    payload_b = {
        "sponsor_member_id": sample_member.id,
        "beneficiary_name": "CSV Beneficiary B",
        "monthly_amount": "90.00",
        "start_date": date.today().isoformat(),
        "status": "Submitted",
        "frequency": "Monthly",
    }
    a_resp = client.post("/sponsorships", json=payload_a)
    b_resp = client.post("/sponsorships", json=payload_b)
    assert a_resp.status_code == 201, a_resp.text
    assert b_resp.status_code == 201, b_resp.text
    a_id = a_resp.json()["id"]
    b_id = b_resp.json()["id"]

    export_resp = client.get(f"/sponsorships/export.csv?status=Draft&ids={a_id},{b_id}")
    assert export_resp.status_code == 200, export_resp.text
    body = export_resp.text
    assert "case_id,status" in body
    assert f"{a_id},Draft" in body
    assert f"{b_id},Submitted" not in body


def test_sponsorship_excel_export_honors_filters_and_selected_ids(client, authorize, sponsorship_user, sample_member):
    authorize(sponsorship_user)
    payload_a = {
        "sponsor_member_id": sample_member.id,
        "beneficiary_name": "XLSX Beneficiary A",
        "monthly_amount": "100.00",
        "start_date": date.today().isoformat(),
        "status": "Draft",
        "frequency": "Monthly",
    }
    payload_b = {
        "sponsor_member_id": sample_member.id,
        "beneficiary_name": "XLSX Beneficiary B",
        "monthly_amount": "110.00",
        "start_date": date.today().isoformat(),
        "status": "Submitted",
        "frequency": "Monthly",
    }
    a_resp = client.post("/sponsorships", json=payload_a)
    b_resp = client.post("/sponsorships", json=payload_b)
    assert a_resp.status_code == 201, a_resp.text
    assert b_resp.status_code == 201, b_resp.text
    a_id = a_resp.json()["id"]
    b_id = b_resp.json()["id"]

    export_resp = client.get(f"/sponsorships/export.xlsx?status=Draft&ids={a_id},{b_id}")
    assert export_resp.status_code == 200, export_resp.text
    assert export_resp.content.startswith(b"PK")

    with zipfile.ZipFile(io.BytesIO(export_resp.content)) as archive:
        sheet_xml = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")

    assert f">{a_id}<" in sheet_xml
    assert "XLSX Beneficiary A" in sheet_xml
    assert f">{b_id}<" not in sheet_xml


def test_sponsor_context_includes_spouse_details_when_married(
    client,
    authorize,
    sponsorship_user,
    sample_member,
    db_session,
):
    authorize(sponsorship_user)

    sample_member.marital_status = "Married"
    sample_member.spouse = Spouse(
        member_id=sample_member.id,
        first_name="Saba",
        last_name="Kidane",
        full_name="Saba Kidane",
        phone="+16475550123",
        email="saba@example.com",
    )
    db_session.add(sample_member)
    db_session.commit()

    resp = client.get(f"/sponsorships/sponsors/{sample_member.id}/context")
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    assert payload["marital_status"] == "Married"
    assert payload["spouse_name"] == "Saba Kidane"
    assert payload["spouse_phone"] == "+16475550123"
    assert payload["spouse_email"] == "saba@example.com"
