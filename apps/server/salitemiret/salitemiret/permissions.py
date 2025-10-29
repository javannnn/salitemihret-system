"""Permission helpers for Role Permission Matrix DocTypes."""

from __future__ import annotations

from typing import Optional, Set

try:  # pragma: no cover - real frappe only present in runtime
    import frappe  # type: ignore
except ImportError:  # pragma: no cover - test environment
    frappe = None  # type: ignore


def get_user_roles(user: Optional[str] = None) -> Set[str]:
    if frappe is None:
        return set()
    return set(frappe.get_roles(user))


def _is_system_manager(roles: Set[str]) -> bool:
    return "System Manager" in roles


def _is_pr_admin(roles: Set[str]) -> bool:
    return "PR Administrator" in roles


def _allow_read_only(roles: Set[str]) -> bool:
    return _is_system_manager(roles) or _is_pr_admin(roles)


def role_permission_matrix_has_permission(doc=None, user: Optional[str] = None, permtype: Optional[str] = None) -> bool:
    roles = get_user_roles(user)
    if _is_system_manager(roles):
        return True
    perm = (permtype or "read").lower()
    if perm == "read" and _is_pr_admin(roles):
        return True
    return False


def role_permission_matrix_entry_has_permission(doc=None, user: Optional[str] = None, permtype: Optional[str] = None) -> bool:
    roles = get_user_roles(user)
    if _is_system_manager(roles):
        return True
    perm = (permtype or "read").lower()
    if perm == "read" and _is_pr_admin(roles):
        return True
    return False
