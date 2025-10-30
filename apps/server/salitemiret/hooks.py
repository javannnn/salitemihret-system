"""Frappe hooks for the Salitemiret app (RBAC baseline)."""

from __future__ import annotations

from typing import Final

app_name = "salitemiret"
app_title = "SaliteMiret"
app_publisher = "salitemihret-system"
app_description = "RBAC baseline for the SaliteMihret system."
app_email = "ops@salitemihret.org"
app_license = "MIT"

ROLE_FIXTURES: Final = [
    "Parish Registrar",
    "PR Administrator",
    "Finance Clerk",
    "Media Coordinator",
    "Sunday School Lead",
    "Volunteer Coordinator",
    "Council Secretary",
    "System Operator",
]

fixtures = [
    {
        "doctype": "Role",
        "filters": {"role_name": ["in", ROLE_FIXTURES]},
    },
    "Custom DocPerm",
]

override_whitelisted_methods = {
    "salitemiret.api.auth.whoami": "salitemiret.api.auth.whoami",
}
scheduler_events = {
    "daily": [
        "salitemiret.jobs.sync_role_permission_fixtures",
    ],
    "weekly": [
        "salitemiret.jobs.verify_role_matrix_integrity",
    ],
}

has_permission = {
    "Role Permission Matrix": "salitemiret.permissions.role_permission_matrix_has_permission",
    "Role Permission Matrix Entry": "salitemiret.permissions.role_permission_matrix_entry_has_permission",
}
before_request = [
    "salitemiret.jobs.ensure_session_policies",
]
