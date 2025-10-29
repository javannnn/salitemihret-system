"""Role Permission Matrix DocType logic."""

from __future__ import annotations

from typing import Set

import frappe
from frappe.model.document import Document

ALLOWED_MODULES: Set[str] = {
    "Membership",
    "Finance",
    "Sponsorships",
    "Education",
    "Volunteers",
    "Media",
    "Governance",
    "Operations",
}


class RolePermissionMatrix(Document):
    """Custom DocType capturing curated permission scopes per role."""

    def validate(self) -> None:
        self._ensure_permissions_present()
        self._ensure_unique_targets()
        self._ensure_allowed_modules()

    def _ensure_permissions_present(self) -> None:
        if not self.permissions:
            frappe.throw("At least one permission entry is required.")

    def _ensure_unique_targets(self) -> None:
        targets: Set[str] = set()
        for row in self.permissions:
            target = (row.target_doctype or "").strip()
            if not target:
                frappe.throw("Every permission entry must specify a target DocType.")
            if target in targets:
                frappe.throw(f"Duplicate permission entry detected for DocType '{target}'.")
            targets.add(target)

    def _ensure_allowed_modules(self) -> None:
        for row in self.permissions:
            module = (row.module or "").strip()
            if module and module not in ALLOWED_MODULES:
                frappe.throw(f"Module '{module}' is outside the approved RBAC scope.")
