from app.models.role import Role
from app.models.user import User


def _report_user(*, can_view_newcomers: bool) -> User:
    role = Role(
        name="FocusedReporter",
        module_permissions={
            "reports": {"read": True, "write": False},
            "newcomers": {"read": True, "write": False},
        },
        field_permissions={
            "reports": {
                "newcomers": {"read": can_view_newcomers, "write": False},
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
