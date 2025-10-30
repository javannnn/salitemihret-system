"""RBAC fixture and permission unit tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Iterable, Set

import pytest

from salitemiret import permissions as perms
from salitemiret.api import auth

APP_ROOT = Path(__file__).resolve().parents[1].parent
FIXTURES_ROOT = APP_ROOT / "fixtures"
ROLES_FIXTURE = FIXTURES_ROOT / "role.json"
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

ROLE_MATRIX_ROLES = {"System Manager", "PR Administrator"}
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


@pytest.fixture
def role_patch(monkeypatch: pytest.MonkeyPatch) -> Callable[[Set[str]], None]:
    def _setter(values: Set[str]) -> None:
        monkeypatch.setattr(perms, "get_user_roles", lambda user=None: set(values))

    return _setter


def test_roles_match_expected_personas(roles: list[dict]) -> None:
    role_names = {entry["role_name"] for entry in roles}
    assert role_names == EXPECTED_ROLES


def test_docperms_whitelist_roles_and_doctypes(docperms: list[dict]) -> None:
    assert docperms, "Custom DocPerm fixture must not be empty"
    for perm in docperms:
        parent = perm.get("parent")
        assert parent in TARGET_DOCTYPES, (
            f"DocPerm references unexpected DocType: {parent}"
        )
        role = perm.get("role")
        assert role in ROLE_MATRIX_ROLES | {"System Manager"}, (
            f"DocPerm references unexpected role: {role}"
        )


def test_docperms_enforce_permission_matrix_semantics(docperms: list[dict]) -> None:
    matrix_perms = [p for p in docperms if p["parent"] == "Role Permission Matrix"]
    assert matrix_perms, "Role Permission Matrix must have DocPerm entries"

    # System Manager should have full access, PR Administrator read-only.
    sm_perm = next(p for p in matrix_perms if p["role"] == "System Manager")
    pr_perm = next(p for p in matrix_perms if p["role"] == "PR Administrator")

    assert all(sm_perm.get(flag) == 1 for flag in ("read", "write", "create", "delete")), (
        "System Manager should retain full privileges"
    )
    assert pr_perm.get("read") == 1 and all(
        pr_perm.get(flag, 0) == 0 for flag in ("write", "create", "delete", "submit", "cancel")
    ), "PR Administrator must be read-only"


def test_role_permission_matrix_has_permission(role_patch: Callable[[Set[str]], None]) -> None:
    role_patch({"System Manager"})
    assert perms.role_permission_matrix_has_permission(permtype="read")
    assert perms.role_permission_matrix_has_permission(permtype="write")

    role_patch({"PR Administrator"})
    assert perms.role_permission_matrix_has_permission(permtype="read")
    assert not perms.role_permission_matrix_has_permission(permtype="write")

    role_patch({"Parish Registrar"})
    assert not perms.role_permission_matrix_has_permission(permtype="read")


def test_role_permission_matrix_entry_has_permission(role_patch: Callable[[Set[str]], None]) -> None:
    role_patch({"System Manager"})
    assert perms.role_permission_matrix_entry_has_permission(permtype="read")
    assert perms.role_permission_matrix_entry_has_permission(permtype="write")

    role_patch({"PR Administrator"})
    assert perms.role_permission_matrix_entry_has_permission(permtype="read")
    assert not perms.role_permission_matrix_entry_has_permission(permtype="write")

    role_patch(set())
    assert not perms.role_permission_matrix_entry_has_permission(permtype="read")

class _StubFrappe:
    """Minimal frappe shim for tests."""

    class _Session:
        user = "pr.admin@example.com"

    session = _Session()

    @staticmethod
    def get_roles(user):
        assert user == "pr.admin@example.com"
        return ["PR Administrator", "Parish Registrar"]

    @staticmethod
    def get_value(doctype, name, field):
        assert doctype == "User"
        assert field == "full_name"
        return "PR Admin"


def test_whoami_returns_expected_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "frappe", _StubFrappe)
    payload = auth.whoami()
    assert payload["user"] == "pr.admin@example.com"
    assert payload["full_name"] == "PR Admin"
    assert payload["roles"] == ["PR Administrator", "Parish Registrar"]
    assert payload["personas"] == payload["roles"]
