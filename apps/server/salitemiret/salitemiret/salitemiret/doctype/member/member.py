"""Member DocType server logic."""

from __future__ import annotations

import frappe
from frappe.model.document import Document


def _compose_member_name(first_name: str, last_name: str) -> str:
    parts = [part.strip() for part in [first_name or "", last_name or ""] if part and part.strip()]
    return " ".join(parts)


class Member(Document):
    """Represents an individual parish member."""

    def validate(self) -> None:
        first = (self.first_name or "").strip()
        last = (self.last_name or "").strip()

        if not first or not last:
            frappe.throw("Both First Name and Last Name are required.")

        self.first_name = first
        self.last_name = last
        self.member_name = _compose_member_name(first, last)
