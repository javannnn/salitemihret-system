"""Tests for Member and Household DocTypes."""

from __future__ import annotations

import random
import string

import frappe
from frappe.tests.utils import FrappeTestCase


def _rand(prefix: str) -> str:
    return prefix + "-" + "".join(random.choices(string.ascii_lowercase, k=8))


class TestMemberHousehold(FrappeTestCase):
    def setUp(self) -> None:
        frappe.set_user("Administrator")

    def tearDown(self) -> None:
        frappe.set_user("Administrator")

    def test_household_unique_name(self) -> None:
        name = _rand("Household")
        household = frappe.get_doc({"doctype": "Household", "household_name": name}).insert()
        self.addCleanup(frappe.delete_doc, "Household", household.name, 1)

        with self.assertRaises(frappe.UniqueValidationError):
            frappe.get_doc({"doctype": "Household", "household_name": name}).insert()

    def test_member_requires_names(self) -> None:
        household = frappe.get_doc({"doctype": "Household", "household_name": _rand("Family")}).insert()
        self.addCleanup(frappe.delete_doc, "Household", household.name, 1)

        member = frappe.get_doc(
            {
                "doctype": "Member",
                "first_name": "Abebe",
                "last_name": "Bikila",
                "household": household.name,
            }
        ).insert()
        self.addCleanup(frappe.delete_doc, "Member", member.name, 1)
        self.assertEqual(member.member_name, "Abebe Bikila")

        with self.assertRaises(frappe.ValidationError):
            frappe.get_doc({"doctype": "Member", "last_name": "Only"}).insert()

    def test_pr_admin_is_read_only(self) -> None:
        household = frappe.get_doc({"doctype": "Household", "household_name": _rand("Governance")}).insert()
        self.addCleanup(frappe.delete_doc, "Household", household.name, 1)

        user = frappe.get_doc(
            {
                "doctype": "User",
                "email": _rand("pr-admin") + "@example.com",
                "first_name": "PR",
                "last_name": "Admin",
                "send_welcome_email": 0,
                "enabled": 1,
            }
        ).insert(ignore_permissions=True)
        self.addCleanup(frappe.delete_doc, "User", user.name, 1)
        user.add_roles("PR Administrator")

        doc = frappe.get_doc("Household", household.name)
        self.assertTrue(frappe.has_permission("Household", doc=doc, ptype="read", user=user.name))
        self.assertFalse(frappe.has_permission("Household", doc=doc, ptype="write", user=user.name))
        self.assertFalse(frappe.has_permission("Household", doc=doc, ptype="create", user=user.name))
