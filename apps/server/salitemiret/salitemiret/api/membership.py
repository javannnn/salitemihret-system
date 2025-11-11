"""Membership APIs for demo pack."""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

import frappe
from frappe import _
from frappe.utils import cint

ALLOWED_READ_ROLES = {"System Manager", "PR Administrator", "Parish Registrar", "Council Secretary"}
ALLOWED_WRITE_ROLES = {"System Manager", "PR Administrator", "Parish Registrar"}

HOUSEHOLD_STATUSES = ["Active", "Inactive"]
MEMBER_STATUSES = ["Active", "Inactive"]

FIRST_NAMES = [
    "Abeba",
    "Bekele",
    "Chaltu",
    "Dawit",
    "Eleni",
    "Fiker",
    "Girma",
    "Habtam",
    "Irene",
    "Kebede",
    "Meskerem",
    "Nigatu",
    "Rahel",
    "Selam",
    "Tigist",
    "Wondimu",
]

LAST_NAMES = [
    "Alemu",
    "Bekele",
    "Chanyalew",
    "Desta",
    "Eshetu",
    "Gebremariam",
    "Hailemariam",
    "Kebede",
    "Lulseged",
    "Meles",
    "Negash",
    "Tadesse",
    "Yared",
    "Zewde",
]


def _ensure_role(required: set[str]) -> None:
    if not required & set(frappe.get_roles()):
        frappe.throw(_("Not permitted"), frappe.PermissionError)


def _build_member_response(doc: Dict[str, Any]) -> Dict[str, Any]:
    household_name = None
    if doc.get("household"):
        household_name = frappe.db.get_value("Household", doc["household"], "household_name")
    return {
        "name": doc.get("name"),
        "first_name": doc.get("first_name"),
        "last_name": doc.get("last_name"),
        "phone": doc.get("phone"),
        "sex": doc.get("sex"),
        "status": doc.get("status"),
        "household": doc.get("household"),
        "household_name": household_name,
    }


@frappe.whitelist()
def list_members(q: Optional[str] = None, household: Optional[str] = None, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
    _ensure_role(ALLOWED_READ_ROLES)
    limit = cint(limit) or 20
    offset = cint(offset) or 0
    filters: Dict[str, Any] = {}
    if household:
        filters["household"] = household
    if q:
        filters["member_name"] = ["like", f"%{q.strip()}%"]

    docs = frappe.get_all(
        "Member",
        filters=filters,
        fields=["name", "first_name", "last_name", "phone", "sex", "status", "household"],
        limit_page_length=limit,
        start=offset,
        order_by="modified desc",
    )
    return [_build_member_response(doc) for doc in docs]


@frappe.whitelist()
def list_households(q: Optional[str] = None, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
    _ensure_role(ALLOWED_READ_ROLES)
    limit = cint(limit) or 20
    offset = cint(offset) or 0
    filters: Dict[str, Any] = {}
    if q:
        filters["household_name"] = ["like", f"%{q.strip()}%"]

    docs = frappe.get_all(
        "Household",
        filters=filters,
        fields=["name", "household_name", "phone", "kebele", "status"],
        limit_page_length=limit,
        start=offset,
        order_by="modified desc",
    )
    return docs


def _validate_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    first = (payload.get("first_name") or "").strip()
    last = (payload.get("last_name") or "").strip()
    phone = (payload.get("phone") or "").strip()
    sex = (payload.get("sex") or "").strip() or None
    status = (payload.get("status") or "Active").strip()

    if not first or not last:
        frappe.throw(_("First Name and Last Name are required."))
    if not phone:
        frappe.throw(_("Phone is required."))
    if sex and sex not in {"Male", "Female"}:
        frappe.throw(_("Invalid sex value."))
    if status not in MEMBER_STATUSES:
        frappe.throw(_("Invalid status value."))

    cleaned = {
        "first_name": first,
        "last_name": last,
        "phone": phone,
        "sex": sex,
        "birth_date": payload.get("birth_date"),
        "household": payload.get("household"),
        "email": payload.get("email"),
        "status": status,
    }
    if payload.get("name"):
        cleaned["name"] = payload["name"]
    return cleaned


@frappe.whitelist()
def upsert_member(payload: Any) -> Dict[str, Any]:
    _ensure_role(ALLOWED_WRITE_ROLES)
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    data = _validate_payload(payload)

    existing_name = data.get("name") or frappe.db.get_value("Member", {"phone": data["phone"]}, "name")
    if existing_name:
        doc = frappe.get_doc("Member", existing_name)
        doc.update(data)
        doc.save()
    else:
        doc = frappe.get_doc({"doctype": "Member", **data}).insert()
    return _build_member_response(doc.as_dict())


@frappe.whitelist()
def seed_membership_demo(n_households: int = 8, n_members: int = 30) -> Dict[str, int]:
    _ensure_role({"System Manager", "PR Administrator"})
    n_households = max(0, cint(n_households))
    n_members = max(0, cint(n_members))

    created_households = 0
    created_members = 0

    existing_households = frappe.get_all("Household", filters={"household_name": ["like", "Demo Household %"]}, pluck="name")
    if len(existing_households) < n_households:
        for idx in range(n_households):
            name = f"Demo Household {idx + 1}"
            if not frappe.db.exists("Household", {"household_name": name}):
                household = frappe.get_doc(
                    {
                        "doctype": "Household",
                        "household_name": name,
                        "phone": f"+2519{random.randint(10000000, 99999999)}",
                        "status": random.choice(HOUSEHOLD_STATUSES),
                        "kebele": f"KB-{random.randint(1, 20):02d}",
                    }
                ).insert()
                existing_households.append(household.name)
                created_households += 1

    for _idx in range(n_members):
        household = random.choice(existing_households) if existing_households else None
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        member_name = f"{first} {last}"
        if frappe.db.exists("Member", {"member_name": member_name}):
            continue
        member_doc = frappe.get_doc(
            {
                "doctype": "Member",
                "first_name": first,
                "last_name": last,
                "member_name": member_name,
                "sex": random.choice(["Male", "Female"]),
                "phone": f"+2519{random.randint(10000000, 99999999)}",
                "household": household,
                "status": random.choice(MEMBER_STATUSES),
            }
        ).insert()
        created_members += 1

    return {"households_created": created_households, "members_created": created_members}


@frappe.whitelist()
def seed_demo_users() -> Dict[str, int]:
    """Ensure demo users for membership UI exist with expected roles."""
    _ensure_role({"System Manager"})

    from frappe.utils.password import update_password

    demo_accounts = [
        ("pradmin@example.com", "PR Admin", ["PR Administrator"], "Demo123!"),
        ("registrar@example.com", "Registrar", ["Parish Registrar"], "Demo123!"),
        ("clerk@example.com", "Clerk", ["Finance Clerk"], "Demo123!"),
        ("council@example.com", "Council", ["Council Secretary"], "Demo123!"),
        ("desk@example.com", "Desk", ["Desk User"], "Demo123!"),
    ]

    created = 0
    updated = 0

    for email, first_name, roles, password in demo_accounts:
        if frappe.db.exists("User", email):
            user = frappe.get_doc("User", email)
            updated += 1
        else:
            user = frappe.get_doc(
                {
                    "doctype": "User",
                    "email": email,
                    "first_name": first_name,
                    "send_welcome_email": 0,
                    "enabled": 1,
                }
            )
            user.insert(ignore_permissions=True)
            created += 1
        user.set("roles", [])
        for role in roles:
            if not frappe.db.exists("Role", role):
                frappe.throw(_("Role {0} does not exist").format(role))
            user.append("roles", {"role": role})
        user.save(ignore_permissions=True)
        update_password(email, password)

    frappe.db.commit()
    return {"created": created, "updated": updated}
