from app.models.role import Role
from app.models.user import User
from app.services.permissions import (
    compute_effective_permissions,
    has_field_permission,
    permission_catalog_payload,
    resolve_role_field_permissions,
    resolve_role_module_permissions,
)


def test_module_visibility_defaults_to_access_when_missing() -> None:
    role = Role(
        name="Caseworker",
        module_permissions={
            "sponsorships": {"read": True, "write": True},
            "payments": {"read": True, "write": False, "visible": False},
        },
    )

    resolved = resolve_role_module_permissions(role)
    assert resolved["sponsorships"] == {"read": True, "write": True, "visible": True}
    assert resolved["payments"] == {"read": True, "write": False, "visible": False}

    effective = compute_effective_permissions([role], is_super_admin=False)
    assert effective["modules"]["sponsorships"]["visible"] is True
    assert effective["modules"]["payments"]["visible"] is False


def test_module_visibility_cannot_stay_enabled_without_access() -> None:
    role = Role(
        name="Readiness",
        module_permissions={
            "members": {"read": False, "write": False, "visible": True},
        },
    )

    resolved = resolve_role_module_permissions(role)
    assert resolved["members"] == {"read": False, "write": False, "visible": False}


def test_budget_round_permission_defaults_to_admin_only() -> None:
    admin_role = Role(name="Admin")
    sponsor_role = Role(name="SponsorshipCommittee")

    admin_fields = resolve_role_field_permissions(admin_role)
    sponsor_fields = resolve_role_field_permissions(sponsor_role)

    assert admin_fields["sponsorships"]["budget_rounds"] == {"read": True, "write": True}
    assert sponsor_fields["sponsorships"]["budget_rounds"] == {"read": False, "write": False}


def test_father_confessor_management_defaults_to_admin_and_pr_only() -> None:
    admin_role = Role(name="Admin")
    pr_role = Role(name="PublicRelations")
    registrar_role = Role(name="Registrar")

    admin_fields = resolve_role_field_permissions(admin_role)
    pr_fields = resolve_role_field_permissions(pr_role)
    registrar_fields = resolve_role_field_permissions(registrar_role)

    assert admin_fields["members"]["father_confessor_management"] == {"read": True, "write": True}
    assert pr_fields["members"]["father_confessor_management"] == {"read": True, "write": True}
    assert registrar_fields["members"]["father_confessor_management"] == {"read": False, "write": False}


def test_custom_role_can_enable_budget_round_permission() -> None:
    role = Role(
        name="BudgetCoordinator",
        field_permissions={
            "sponsorships": {
                "budget_rounds": {"read": True, "write": True},
            }
        },
    )

    resolved = resolve_role_field_permissions(role)
    assert resolved["sponsorships"]["budget_rounds"] == {"read": True, "write": True}

    effective = compute_effective_permissions([role], is_super_admin=False)
    assert effective["fields"]["sponsorships"]["budget_rounds"] == {"read": True, "write": True}


def test_custom_role_can_enable_father_confessor_management() -> None:
    role = Role(
        name="FatherConfessorCoordinator",
        module_permissions={
            "members": {"read": True, "write": True},
        },
        field_permissions={
            "members": {
                "father_confessor_management": {"read": True, "write": True},
            }
        },
    )

    resolved = resolve_role_field_permissions(role)
    assert resolved["members"]["father_confessor_management"] == {"read": True, "write": True}

    effective = compute_effective_permissions([role], is_super_admin=False)
    assert effective["fields"]["members"]["father_confessor_management"] == {"read": True, "write": True}
    assert effective["legacy"]["manageFatherConfessors"] is True


def test_report_catalog_exposes_granular_report_fields() -> None:
    reports_module = next(module for module in permission_catalog_payload() if module["key"] == "reports")

    assert [field["key"] for field in reports_module["fields"]] == [
        "overview",
        "members",
        "payments",
        "sponsorships",
        "newcomers",
        "schools",
        "councils",
    ]


def test_custom_role_can_hide_specific_report_type() -> None:
    role = Role(
        name="FocusedReporter",
        module_permissions={
            "reports": {"read": True, "write": False},
            "members": {"read": True, "write": False},
            "payments": {"read": True, "write": False},
        },
        field_permissions={
            "reports": {
                "members": {"read": True, "write": False},
                "payments": {"read": False, "write": False},
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

    assert has_field_permission(user, "reports", "members", "read") is True
    assert has_field_permission(user, "reports", "payments", "read") is False


def test_permission_catalog_exposes_father_confessor_management_field() -> None:
    members_module = next(module for module in permission_catalog_payload() if module["key"] == "members")

    assert any(field["key"] == "father_confessor_management" for field in members_module["fields"])


def test_parish_council_defaults_grant_read_only_to_office_admin() -> None:
    office_role = Role(name="OfficeAdmin")
    resolved = resolve_role_module_permissions(office_role)

    assert resolved["parish_councils"] == {"read": True, "write": False, "visible": True}

    effective = compute_effective_permissions([office_role], is_super_admin=False)
    assert effective["legacy"]["viewParishCouncils"] is True
    assert effective["legacy"]["manageParishCouncils"] is False


def test_parish_council_admin_defaults_grant_full_access() -> None:
    role = Role(name="ParishCouncilAdmin")
    resolved = resolve_role_module_permissions(role)

    assert resolved["parish_councils"] == {"read": True, "write": True, "visible": True}

    effective = compute_effective_permissions([role], is_super_admin=False)
    assert effective["legacy"]["viewParishCouncils"] is True
    assert effective["legacy"]["manageParishCouncils"] is True
