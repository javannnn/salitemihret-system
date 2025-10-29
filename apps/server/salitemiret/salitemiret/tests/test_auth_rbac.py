"""RBAC fixture validation for Frappe v14."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

APP_ROOT = Path(__file__).resolve().parents[1].parent
FIXTURES_ROOT = APP_ROOT / "fixtures"
ROLES_FIXTURE = FIXTURES_ROOT / "roles.json"
DOCPERM_FIXTURE = FIXTURES_ROOT / "custom_docperm.json"

EXPECTED_ROLES = {
    "Parish Registrar",
    "PR Administrator",
    "Finance Clerk",
    "Media Coordinator",
    "Sunday School Lead",
    "Volunteer Coordinator",
    "Council Secretary",
    "System Operator",
}

TARGET_DOCTYPES = {
    "Role Permission Matrix",
    "Role Permission Matrix Entry",
}


@pytest.fixture(scope="module")
def roles() -> list[dict]:
    return json.loads(ROLES_FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def docperms() -> list[dict]:
    return json.loads(DOCPERM_FIXTURE.read_text(encoding="utf-8"))


def test_roles_match_personas(roles: list[dict]) -> None:
    role_names = {entry["role_name"] for entry in roles}
    assert role_names == EXPECTED_ROLES


def test_docperms_are_scoped(docperms: list[dict]) -> None:
    assert docperms, "Custom DocPerm fixture must not be empty"
    for perm in docperms:
        parent = perm.get("parent")
        assert parent in TARGET_DOCTYPES, (
            f"DocPerm references unexpected DocType: {parent}"
        )
        role = perm.get("role")
        assert role in EXPECTED_ROLES | {"System Manager"}, (
            f"DocPerm references unknown role: {role}"
        )
        for flag in ("read", "write", "create", "delete", "submit", "cancel"):
            value = perm.get(flag, 0)
            assert value in (0, 1), "Permission flags must be 0 or 1"


def test_deny_by_default(docperms: list[dict]) -> None:
    # Ensure every DocPerm explicitly enumerates its scope so we inherit deny-by-default.
    matrix_perms = [p for p in docperms if p["parent"] == "Role Permission Matrix"]
    assert matrix_perms, "Role Permission Matrix DocPerms must be defined"
    roles_with_access = {perm["role"] for perm in matrix_perms if perm.get("read")}
    assert roles_with_access <= EXPECTED_ROLES | {"System Manager", "System Operator"}
