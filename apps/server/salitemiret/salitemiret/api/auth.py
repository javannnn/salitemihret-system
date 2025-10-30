"""Authentication helpers with RBAC personas (filtered)."""

from __future__ import annotations

from typing import Any, Dict, List, Set

try:  # imported at runtime inside Frappe
    import frappe  # type: ignore
except Exception:  # test shim outside bench
    frappe = None  # type: ignore


# Safe whitelist decorator for both bench and plain-Python contexts
if frappe:
    whitelist = frappe.whitelist  # type: ignore[attr-defined]
else:
    def whitelist(*_args, **_kwargs):  # no-op decorator for tests
        def _wrap(fn):
            return fn
        return _wrap


# Project personas we care about
PERSONA_ROLES: Set[str] = {
    "Parish Registrar",
    "PR Administrator",
    "Finance Clerk",
    "Media Coordinator",
    "Sunday School Lead",
    "Volunteer Coordinator",
    "Council Secretary",
    "System Operator",
}


def _get_roles(user: str) -> List[str]:
    if frappe is None:
        return []
    return list(frappe.get_roles(user))  # type: ignore[no-any-return]


def _get_fullname(user: str) -> str:
    if frappe is None:
        return ""
    # Prefer utils.get_fullname; fall back to stored field
    try:
        return frappe.utils.get_fullname(user) or ""  # type: ignore[attr-defined]
    except Exception:
        return frappe.get_value("User", user, "full_name") or ""  # type: ignore[no-any-return]


@whitelist(methods=["GET"])
def whoami() -> Dict[str, Any]:
    """Return lightweight session metadata for the current user."""
    if frappe is None:
        return {"user": "", "full_name": "", "roles": [], "personas": []}

    user = frappe.session.user  # type: ignore[attr-defined]
    roles = set(_get_roles(user))
    personas = sorted(roles & PERSONA_ROLES)

    return {
        "user": user,
        "full_name": _get_fullname(user),
        "roles": sorted(roles),
        "personas": personas,
    }
