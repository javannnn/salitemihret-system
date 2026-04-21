from datetime import date

from app.models.parish_council import ParishCouncilAssignment, ParishCouncilDepartment
from app.models.role import Role
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
