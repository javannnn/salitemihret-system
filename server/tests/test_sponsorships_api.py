from __future__ import annotations

from datetime import date
import io
import zipfile

from app.models.member import Spouse
from app.models.sponsorship import Sponsorship


def _create_budget_round(client, authorize, user, *, slot_budget: int = 5, round_number: int = 1, year: int | None = None) -> int:
    authorize(user)
    budget_year = year or date.today().year
    response = client.post(
        "/sponsorships/budget-rounds",
        json={
            "year": budget_year,
            "round_number": round_number,
            "start_date": date(budget_year, 1, 1).isoformat(),
            "end_date": date(budget_year, 1, 28).isoformat(),
            "slot_budget": slot_budget,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_sponsorship_flow_with_newcomer_conversion(
    client,
    authorize,
    public_relations_user,
    sponsorship_user,
    admin_user,
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
    round_id = _create_budget_round(client, authorize, admin_user, slot_budget=10)
    authorize(sponsorship_user)
    sponsorship_payload = {
        "sponsor_member_id": sample_member.id,
        "newcomer_id": newcomer_id,
        "monthly_amount": "150.00",
        "start_date": date.today().isoformat(),
        "status": "Submitted",
        "frequency": "Monthly",
        "budget_round_id": round_id,
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
    assert detail["last_sponsored_date"] is None


def test_linked_sponsorship_sets_newcomer_sponsor_assignment(
    client,
    authorize,
    public_relations_user,
    sponsorship_user,
    sample_member,
):
    authorize(public_relations_user)
    newcomer_resp = client.post(
        "/newcomers",
        json={
            "first_name": "Saron",
            "last_name": "Bekele",
            "contact_phone": "+16135550198",
            "contact_email": "saron.bekele@example.com",
            "arrival_date": date.today().isoformat(),
        },
    )
    assert newcomer_resp.status_code == 201, newcomer_resp.text
    newcomer_id = newcomer_resp.json()["id"]

    authorize(sponsorship_user)
    create_resp = client.post(
        "/sponsorships",
        json={
            "sponsor_member_id": sample_member.id,
            "newcomer_id": newcomer_id,
            "monthly_amount": "100.00",
            "start_date": date.today().isoformat(),
            "status": "Draft",
            "frequency": "Monthly",
        },
    )
    assert create_resp.status_code == 201, create_resp.text

    authorize(public_relations_user)
    detail_resp = client.get(f"/newcomers/{newcomer_id}")
    assert detail_resp.status_code == 200, detail_resp.text
    detail = detail_resp.json()
    expected_name = f"{sample_member.first_name} {sample_member.last_name}"
    assert detail["sponsored_by_member_id"] == sample_member.id
    assert detail["sponsored_by_member_name"] == expected_name
    assert detail["assigned_owner_name"] == expected_name


def test_newcomer_sponsor_assignment_can_be_updated_and_cleared(
    client,
    authorize,
    public_relations_user,
    sample_member,
):
    authorize(public_relations_user)
    newcomer_resp = client.post(
        "/newcomers",
        json={
            "first_name": "Mimi",
            "last_name": "Tesfaye",
            "contact_phone": "+16135550197",
            "contact_email": "mimi.tesfaye@example.com",
            "arrival_date": date.today().isoformat(),
        },
    )
    assert newcomer_resp.status_code == 201, newcomer_resp.text
    newcomer_id = newcomer_resp.json()["id"]

    assign_resp = client.put(
        f"/newcomers/{newcomer_id}",
        json={"sponsored_by_member_id": sample_member.id},
    )
    assert assign_resp.status_code == 200, assign_resp.text
    assigned = assign_resp.json()
    expected_name = f"{sample_member.first_name} {sample_member.last_name}"
    assert assigned["sponsored_by_member_id"] == sample_member.id
    assert assigned["sponsored_by_member_name"] == expected_name
    assert assigned["assigned_owner_name"] == expected_name

    clear_resp = client.put(
        f"/newcomers/{newcomer_id}",
        json={"sponsored_by_member_id": None},
    )
    assert clear_resp.status_code == 200, clear_resp.text
    cleared = clear_resp.json()
    assert cleared["sponsored_by_member_id"] is None
    assert cleared["sponsored_by_member_name"] is None
    assert cleared["assigned_owner_name"] is None


def test_sponsorship_auto_captures_last_sponsored_date_from_previous_case(
    client,
    authorize,
    sponsorship_user,
    sample_member,
    db_session,
):
    authorize(sponsorship_user)
    prior_case = Sponsorship(
        sponsor_member_id=sample_member.id,
        beneficiary_name="Auto Date Immigrant",
        monthly_amount="95.00",
        frequency="Monthly",
        status="Completed",
        start_date=date(2024, 1, 15),
        end_date=date(2024, 6, 1),
    )
    db_session.add(prior_case)
    db_session.commit()

    payload = {
        "sponsor_member_id": sample_member.id,
        "beneficiary_name": "Auto Date Immigrant",
        "monthly_amount": "95.00",
        "start_date": date(2025, 1, 15).isoformat(),
        "status": "Draft",
        "frequency": "Monthly",
    }

    create_resp = client.post("/sponsorships", json=payload)
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["last_sponsored_date"] == "2024-06-01"

    sponsorship_id = created["id"]
    moved_start = date(2025, 2, 1)
    update_resp = client.put(
        f"/sponsorships/{sponsorship_id}",
        json={"start_date": moved_start.isoformat()},
    )
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["start_date"] == moved_start.isoformat()
    assert updated["last_sponsored_date"] == "2024-06-01"

    manual_last_date = date(2025, 1, 20)
    manual_resp = client.put(
        f"/sponsorships/{sponsorship_id}",
        json={"last_sponsored_date": manual_last_date.isoformat()},
    )
    assert manual_resp.status_code == 200, manual_resp.text
    assert manual_resp.json()["last_sponsored_date"] == manual_last_date.isoformat()

    later_start = date(2025, 3, 1)
    preserve_resp = client.put(
        f"/sponsorships/{sponsorship_id}",
        json={"start_date": later_start.isoformat()},
    )
    assert preserve_resp.status_code == 200, preserve_resp.text
    preserved = preserve_resp.json()
    assert preserved["start_date"] == later_start.isoformat()
    assert preserved["last_sponsored_date"] == manual_last_date.isoformat()


def test_sponsor_context_uses_current_case_date_not_prior_history(
    client,
    authorize,
    sponsorship_user,
    sample_member,
):
    authorize(sponsorship_user)
    payload = {
        "sponsor_member_id": sample_member.id,
        "beneficiary_name": "Context Immigrant",
        "monthly_amount": "95.00",
        "start_date": date(2025, 1, 15).isoformat(),
        "last_sponsored_date": date(2024, 6, 1).isoformat(),
        "status": "Draft",
        "frequency": "Monthly",
    }

    create_resp = client.post("/sponsorships", json=payload)
    assert create_resp.status_code == 201, create_resp.text

    context_resp = client.get(f"/sponsorships/sponsors/{sample_member.id}/context")
    assert context_resp.status_code == 200, context_resp.text
    assert context_resp.json()["last_sponsorship_date"] == "2025-01-15"


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


def test_sponsorship_committee_can_create_newcomer(client, authorize, sponsorship_user):
    authorize(sponsorship_user)
    payload = {
        "first_name": "Samrawit",
        "last_name": "Abebe",
        "arrival_date": date.today().isoformat(),
        "contact_phone": "+16135550177",
        "contact_email": "samrawit.abebe@example.com",
        "service_type": "Welcome",
    }
    resp = client.post("/newcomers", json=payload)
    assert resp.status_code == 201, resp.text


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


def test_budget_round_creation_requires_explicit_permission(client, authorize, sponsorship_user):
    authorize(sponsorship_user)
    today = date.today()
    round_resp = client.post(
        "/sponsorships/budget-rounds",
        json={
            "year": today.year,
            "round_number": 1,
            "start_date": today.replace(day=1).isoformat(),
            "end_date": today.isoformat(),
            "slot_budget": 2,
        },
    )
    assert round_resp.status_code == 403, round_resp.text


def test_submitted_sponsorship_consumes_budget_round_slots(client, authorize, sponsorship_user, admin_user, sample_member):
    authorize(sponsorship_user)
    today = date.today()
    round_id = _create_budget_round(client, authorize, admin_user, slot_budget=2)
    authorize(sponsorship_user)

    create_resp = client.post(
        "/sponsorships",
        json={
            "sponsor_member_id": sample_member.id,
            "beneficiary_name": "Budgeted Beneficiary",
            "monthly_amount": "75.00",
            "start_date": today.isoformat(),
            "status": "Submitted",
            "frequency": "Monthly",
            "budget_round_id": round_id,
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["budget_round_id"] == round_id
    assert created["budget_slots"] == 1
    assert created["used_slots"] == 1

    rounds_resp = client.get(f"/sponsorships/budget-rounds?year={today.year}")
    assert rounds_resp.status_code == 200, rounds_resp.text
    round_payload = rounds_resp.json()[0]
    assert round_payload["slot_budget"] == 2
    assert round_payload["used_slots"] == 1


def test_submitted_sponsorship_requires_budget_round(client, authorize, sponsorship_user, sample_member):
    authorize(sponsorship_user)
    today = date.today()

    create_resp = client.post(
        "/sponsorships",
        json={
            "sponsor_member_id": sample_member.id,
            "beneficiary_name": "Missing Budget Round",
            "monthly_amount": "75.00",
            "start_date": today.isoformat(),
            "status": "Submitted",
            "frequency": "Monthly",
        },
    )
    assert create_resp.status_code == 409, create_resp.text
    assert "budget round" in create_resp.text


def test_submitted_sponsorship_is_blocked_when_budget_round_is_full(client, authorize, sponsorship_user, admin_user, sample_member):
    authorize(sponsorship_user)
    today = date.today()
    round_id = _create_budget_round(client, authorize, admin_user, slot_budget=1)
    authorize(sponsorship_user)

    first_resp = client.post(
        "/sponsorships",
        json={
            "sponsor_member_id": sample_member.id,
            "beneficiary_name": "Round Capacity A",
            "monthly_amount": "80.00",
            "start_date": today.isoformat(),
            "status": "Submitted",
            "frequency": "Monthly",
            "budget_round_id": round_id,
        },
    )
    assert first_resp.status_code == 201, first_resp.text

    second_resp = client.post(
        "/sponsorships",
        json={
            "sponsor_member_id": sample_member.id,
            "beneficiary_name": "Round Capacity B",
            "monthly_amount": "80.00",
            "start_date": today.isoformat(),
            "status": "Submitted",
            "frequency": "Monthly",
            "budget_round_id": round_id,
        },
    )
    assert second_resp.status_code == 409, second_resp.text
    assert "remaining slots" in second_resp.text


def test_draft_submission_requires_capacity_and_consumes_slots(client, authorize, sponsorship_user, admin_user, sample_member):
    authorize(sponsorship_user)
    today = date.today()
    round_id = _create_budget_round(client, authorize, admin_user, slot_budget=1)
    authorize(sponsorship_user)

    draft_resp = client.post(
        "/sponsorships",
        json={
            "sponsor_member_id": sample_member.id,
            "beneficiary_name": "Draft Capacity Beneficiary",
            "monthly_amount": "60.00",
            "start_date": today.isoformat(),
            "status": "Draft",
            "frequency": "Monthly",
            "budget_round_id": round_id,
        },
    )
    assert draft_resp.status_code == 201, draft_resp.text
    sponsorship_id = draft_resp.json()["id"]
    assert draft_resp.json()["used_slots"] == 0

    submit_resp = client.post(
        f"/sponsorships/{sponsorship_id}/status",
        json={"status": "Submitted"},
    )
    assert submit_resp.status_code == 200, submit_resp.text
    submitted = submit_resp.json()
    assert submitted["budget_slots"] == 1
    assert submitted["used_slots"] == 1


def test_draft_submission_requires_budget_round(client, authorize, sponsorship_user, sample_member):
    authorize(sponsorship_user)
    today = date.today()

    draft_resp = client.post(
        "/sponsorships",
        json={
            "sponsor_member_id": sample_member.id,
            "beneficiary_name": "Draft Missing Round",
            "monthly_amount": "60.00",
            "start_date": today.isoformat(),
            "status": "Draft",
            "frequency": "Monthly",
        },
    )
    assert draft_resp.status_code == 201, draft_resp.text
    sponsorship_id = draft_resp.json()["id"]

    submit_resp = client.post(
        f"/sponsorships/{sponsorship_id}/status",
        json={"status": "Submitted"},
    )
    assert submit_resp.status_code == 409, submit_resp.text
    assert "budget round" in submit_resp.text


def test_rejecting_sponsorship_releases_budget_round_slots(
    client,
    authorize,
    sponsorship_user,
    admin_user,
    sample_member,
):
    authorize(sponsorship_user)
    today = date.today()
    round_id = _create_budget_round(client, authorize, admin_user, slot_budget=1)
    authorize(sponsorship_user)

    first_resp = client.post(
        "/sponsorships",
        json={
            "sponsor_member_id": sample_member.id,
            "beneficiary_name": "Reject Round A",
            "monthly_amount": "90.00",
            "start_date": today.isoformat(),
            "status": "Submitted",
            "frequency": "Monthly",
            "budget_round_id": round_id,
        },
    )
    assert first_resp.status_code == 201, first_resp.text
    sponsorship_id = first_resp.json()["id"]

    authorize(admin_user)
    reject_resp = client.post(
        f"/sponsorships/{sponsorship_id}/status",
        json={"status": "Rejected", "reason": "Outside scope"},
    )
    assert reject_resp.status_code == 200, reject_resp.text
    assert reject_resp.json()["used_slots"] == 0

    authorize(sponsorship_user)
    second_resp = client.post(
        "/sponsorships",
        json={
            "sponsor_member_id": sample_member.id,
            "beneficiary_name": "Reject Round B",
            "monthly_amount": "90.00",
            "start_date": today.isoformat(),
            "status": "Submitted",
            "frequency": "Monthly",
            "budget_round_id": round_id,
        },
    )
    assert second_resp.status_code == 201, second_resp.text


def test_sponsorship_csv_export_honors_filters_and_selected_ids(client, authorize, sponsorship_user, admin_user, sample_member):
    authorize(sponsorship_user)
    round_id = _create_budget_round(client, authorize, admin_user, slot_budget=10)
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
        "budget_round_id": round_id,
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


def test_sponsorship_excel_export_honors_filters_and_selected_ids(client, authorize, sponsorship_user, admin_user, sample_member):
    authorize(sponsorship_user)
    round_id = _create_budget_round(client, authorize, admin_user, slot_budget=10)
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
        "budget_round_id": round_id,
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
