import json
from datetime import date, datetime, timezone
from decimal import Decimal

from app.models.member import Child, Spouse
from app.models.parish_council import ParishCouncilAssignment, ParishCouncilDepartment
from app.models.payment import Payment, PaymentServiceType
from app.models.role import Role
from app.models.sponsorship import Sponsorship
from app.models.user import User


def _report_user(*, can_view_newcomers: bool, can_view_councils: bool = True) -> User:
    role = Role(
        name="FocusedReporter",
        module_permissions={
            "reports": {"read": True, "write": False},
            "newcomers": {"read": True, "write": False},
        },
        field_permissions={
            "reports": {
                "newcomers": {"read": can_view_newcomers, "write": False},
                "councils": {"read": can_view_councils, "write": False},
            }
        },
    )
    user = User(
        email="focused.reporter@example.com",
        username="focused.reporter",
        hashed_password="hash",
        is_active=True,
    )
    user.roles.append(role)
    return user


def _individual_report_user() -> User:
    role = Role(
        name="IndividualReporter",
        module_permissions={
            "reports": {"read": True, "write": False},
            "members": {"read": True, "write": False},
            "payments": {"read": True, "write": False},
        },
        field_permissions={
            "reports": {
                "members": {"read": True, "write": False},
                "payments": {"read": True, "write": False},
            },
            "members": {
                "contribution": {"read": True, "write": False},
            },
        },
    )
    user = User(
        email="individual.reporter@example.com",
        username="individual.reporter",
        hashed_password="hash",
        is_active=True,
    )
    user.roles.append(role)
    return user


def _individual_non_financial_report_user() -> User:
    role = Role(
        name="IndividualNonFinancialReporter",
        module_permissions={
            "reports": {"read": True, "write": False},
            "members": {"read": True, "write": False},
        },
        field_permissions={
            "reports": {
                "members": {"read": True, "write": False},
            },
            "members": {
                "contribution": {"read": False, "write": False},
            },
        },
    )
    user = User(
        email="individual.nonfinancial@example.com",
        username="individual.nonfinancial",
        hashed_password="hash",
        is_active=True,
    )
    user.roles.append(role)
    return user


def test_newcomer_report_denies_hidden_report_type(client, authorize):
    authorize(_report_user(can_view_newcomers=False))

    response = client.get("/reports/newcomers")

    assert response.status_code == 403
    assert response.json()["detail"] == "Report access denied"


def test_newcomer_report_allows_visible_report_type(client, authorize):
    authorize(_report_user(can_view_newcomers=True))

    response = client.get("/reports/newcomers")

    assert response.status_code == 200
    assert "summary" in response.json()


def test_parish_council_report_denies_hidden_report_type(client, authorize):
    authorize(_report_user(can_view_newcomers=True, can_view_councils=False))

    response = client.get("/reports/parish-councils")

    assert response.status_code == 403
    assert response.json()["detail"] == "Report access denied"


def test_parish_council_report_allows_visible_report_type(client, authorize, db_session):
    authorize(_report_user(can_view_newcomers=True, can_view_councils=True))
    department = ParishCouncilDepartment(name="Office of Chairman", minimum_age=13, status="Active")
    db_session.add(department)
    db_session.commit()
    db_session.refresh(department)
    assignment = ParishCouncilAssignment(
        department_id=department.id,
        trainee_first_name="Mimi",
        trainee_last_name="Teka",
        training_from=date(2026, 4, 21),
        training_to=date(2026, 5, 21),
        status="Active",
    )
    db_session.add(assignment)
    db_session.commit()

    response = client.get("/reports/parish-councils")

    assert response.status_code == 200
    assert response.json()["summary"]["total_rows"] >= 1


def test_individual_member_report_includes_requested_client_report_fields(
    client,
    authorize,
    db_session,
    sample_member,
):
    authorize(_individual_report_user())
    sample_member.join_date = date(2023, 1, 1)
    sample_member.spouse = Spouse(
        first_name="Tesfanesh",
        last_name="Bekele",
        full_name="Tesfanesh Bekele",
    )
    sample_member.children_all.append(
        Child(
            first_name="Kidus",
            last_name="Tesfaye",
            full_name="Kidus Tesfaye",
            birth_date=date(2015, 6, 1),
        )
    )
    service_type = PaymentServiceType(code="membership", label="Membership")
    sponsorship_service_type = PaymentServiceType(code="SPONSORSHIP", label="Sponsorship Donation")
    db_session.add_all([service_type, sponsorship_service_type])
    db_session.flush()
    current_year = datetime.now(timezone.utc).year
    payment = Payment(
        amount=Decimal("125.00"),
        currency="CAD",
        service_type_id=service_type.id,
        member_id=sample_member.id,
        posted_at=datetime(current_year - 1, 5, 10, tzinfo=timezone.utc),
        status="Completed",
    )
    sponsorship_payment = Payment(
        amount=Decimal("150.00"),
        currency="CAD",
        service_type_id=sponsorship_service_type.id,
        member_id=sample_member.id,
        posted_at=datetime(current_year - 1, 5, 9, tzinfo=timezone.utc),
        status="Completed",
    )
    pending_sponsorship_payment = Payment(
        amount=Decimal("50.00"),
        currency="CAD",
        service_type_id=sponsorship_service_type.id,
        member_id=sample_member.id,
        posted_at=datetime(current_year - 1, 5, 8, tzinfo=timezone.utc),
        status="Pending",
    )
    sponsorship = Sponsorship(
        sponsor_member_id=sample_member.id,
        beneficiary_name="New Immigrant",
        volunteer_services=json.dumps(["Settlement support"]),
        volunteer_service_other="Translation",
        payment_information="Bond",
        last_sponsored_date=date(current_year - 1, 5, 1),
        frequency="Monthly",
        last_status="Approved",
        start_date=date(current_year - 1, 4, 1),
        status="Active",
        monthly_amount=Decimal("150.00"),
        received_amount=Decimal("150.00"),
    )
    db_session.add_all([sample_member, payment, sponsorship_payment, pending_sponsorship_payment, sponsorship])
    db_session.commit()

    response = client.get(f"/reports/members/{sample_member.id}/individual")

    assert response.status_code == 200, response.text
    client_fields = response.json()["client_report_fields"]
    assert client_fields["membership"]["first_name"] == sample_member.first_name
    assert client_fields["membership"]["last_name"] == sample_member.last_name
    assert client_fields["membership"]["membership_date"] == "2023-01-01"
    assert client_fields["membership"]["spouse_name"] == "Tesfanesh Bekele"
    assert client_fields["membership"]["children"] == [
        {"child_name": "Kidus Tesfaye", "birth_year": 2015}
    ]
    assert client_fields["payments"][0]["amount"] == 125.0
    assert client_fields["payments"][0]["payment_date"].startswith(f"{current_year - 1}-05-10")
    assert len(client_fields["payment_years"]) >= 3
    assert any(item["year"] == current_year - 1 and item["total_amount"] == 325.0 for item in client_fields["payment_years"])
    assert client_fields["sponsorship"]["payment_information_by_year"] == client_fields["payment_years"]
    assert client_fields["sponsorship"]["last_sponsored_date"] == f"{current_year - 1}-05-01"
    assert client_fields["sponsorship"]["number_sponsored"] == 1
    assert client_fields["sponsorship"]["last_sponsor_status"] == "Approved"
    assert client_fields["sponsorship"]["volunteer_rows"] == [
        {"volunteer_date": f"{current_year - 1}-04-01", "service_type": "Settlement support"},
        {"volunteer_date": f"{current_year - 1}-04-01", "service_type": "Translation"},
    ]

    filtered_response = client.get(
        f"/reports/members/{sample_member.id}/individual",
        params={
            "start_date": f"{current_year - 1}-05-01",
            "end_date": f"{current_year - 1}-05-31",
        },
    )

    assert filtered_response.status_code == 200, filtered_response.text
    filtered = filtered_response.json()
    assert payment.id in {item["id"] for item in filtered["payments"]}
    assert sponsorship_payment.id in {item["id"] for item in filtered["payments"]}
    assert filtered["client_report_fields"]["payments"][0]["amount"] == 125.0
    assert [item["id"] for item in filtered["sponsorships"]] == [sponsorship.id]
    assert filtered["sponsorships"][0]["monthly_amount"] is None
    assert filtered["sponsorships"][0]["received_amount"] is None
    assert filtered["sponsorships"][0]["paid_amount"] == "150.00"
    assert filtered["sponsorships"][0]["currency"] == "CAD"
    assert filtered["client_report_fields"]["sponsorship"]["number_sponsored"] == 1
    assert filtered["client_report_fields"]["sponsorship"]["volunteer_rows"] == [
        {"volunteer_date": f"{current_year - 1}-04-01", "service_type": "Settlement support"},
        {"volunteer_date": f"{current_year - 1}-04-01", "service_type": "Translation"},
    ]

    payment_report_response = client.get(
        f"/reports/payments/members/{sample_member.id}/individual",
        params={
            "start_date": f"{current_year - 1}-05-01",
            "end_date": f"{current_year - 1}-05-31",
        },
    )
    assert payment_report_response.status_code == 200, payment_report_response.text
    payment_report = payment_report_response.json()
    assert payment.id in {item["id"] for item in payment_report["payments"]}
    assert sponsorship_payment.id in {item["id"] for item in payment_report["payments"]}
    assert payment_report["sponsorships"] == []
    assert payment_report["client_report_fields"]["sponsorship"]["number_sponsored"] == 0
    assert payment_report["client_report_fields"]["sponsorship"]["last_sponsored_date"] is None
    assert payment_report["client_report_fields"]["sponsorship"]["last_sponsor_status"] is None
    assert payment_report["client_report_fields"]["sponsorship"]["volunteer_rows"] == []


def test_individual_member_report_without_finance_access_hides_financial_sections(
    client,
    authorize,
    db_session,
    sample_member,
):
    authorize(_individual_non_financial_report_user())
    service_type = PaymentServiceType(code="donation-hidden", label="Donation")
    db_session.add(service_type)
    db_session.commit()
    db_session.refresh(service_type)
    payment = Payment(
        amount=Decimal("125.00"),
        currency="CAD",
        service_type_id=service_type.id,
        member_id=sample_member.id,
        posted_at=datetime(2026, 5, 10, tzinfo=timezone.utc),
        status="Completed",
    )
    sponsorship = Sponsorship(
        sponsor_member_id=sample_member.id,
        beneficiary_name="New Immigrant",
        frequency="Monthly",
        start_date=date(2026, 4, 1),
        status="Active",
        monthly_amount=Decimal("150.00"),
        received_amount=Decimal("150.00"),
    )
    db_session.add_all([payment, sponsorship])
    db_session.commit()

    response = client.get(f"/reports/members/{sample_member.id}/individual")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["financial_access"] is False
    assert payload["member"]["id"] == sample_member.id
    assert payload["payments"] == []
    assert payload["contribution_history"] == []
    assert payload["client_report_fields"]["payments"] == []
    assert payload["client_report_fields"]["payment_years"] == []
    assert payload["client_report_fields"]["sponsorship"]["payment_information_by_year"] == []
    assert payload["sponsorships"][0]["monthly_amount"] is None
    assert payload["sponsorships"][0]["received_amount"] is None
    assert payload["sponsorships"][0]["paid_amount"] is None
