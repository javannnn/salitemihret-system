"""Child table rows for the Role Permission Matrix."""

from __future__ import annotations

from frappe.model.document import Document


class RolePermissionMatrixEntry(Document):
    """Each record captures a role's CRUD privileges for a specific DocType."""

    pass
