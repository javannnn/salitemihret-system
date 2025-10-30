"""Household DocType server logic."""

from __future__ import annotations

import frappe
from frappe.model.document import Document


class Household(Document):
    """Represents a parish household."""

    def validate(self) -> None:
        if not (self.household_name or "").strip():
            frappe.throw("Household Name is required.")
        self.household_name = self.household_name.strip()
