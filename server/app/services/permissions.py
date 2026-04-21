from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Literal

from app.models.role import Role
from app.models.user import User

PermissionAction = Literal["read", "write"]


@dataclass(frozen=True)
class PermissionFieldCatalogEntry:
    key: str
    label: str
    description: str


@dataclass(frozen=True)
class PermissionModuleCatalogEntry:
    key: str
    label: str
    description: str
    fields: tuple[PermissionFieldCatalogEntry, ...]


PERMISSION_CATALOG: tuple[PermissionModuleCatalogEntry, ...] = (
    PermissionModuleCatalogEntry(
        key="members",
        label="Members",
        description="Member profiles, household data, clergy references, and attachments.",
        fields=(
            PermissionFieldCatalogEntry("first_name", "First Name", "Given name on the member profile."),
            PermissionFieldCatalogEntry("last_name", "Last Name", "Family name on the member profile."),
            PermissionFieldCatalogEntry("email", "Email", "Primary email address."),
            PermissionFieldCatalogEntry("phone", "Phone", "Primary phone number."),
            PermissionFieldCatalogEntry(
                "father_confessor_management",
                "Father Confessor Management",
                "Create, update, archive, restore, and remove father confessor directory records.",
            ),
            PermissionFieldCatalogEntry("status", "Status", "Membership status and overrides."),
            PermissionFieldCatalogEntry("district", "District", "District assignment."),
            PermissionFieldCatalogEntry("address", "Address", "Address lines and country."),
            PermissionFieldCatalogEntry("birth_date", "Birth Date", "Date of birth."),
            PermissionFieldCatalogEntry("join_date", "Join Date", "Date joined parish."),
            PermissionFieldCatalogEntry("contribution", "Contributions", "Tithing and contribution settings."),
            PermissionFieldCatalogEntry("notes", "Notes", "Internal notes and remarks."),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="promotions",
        label="Promotions",
        description="Child promotion previews and execute promotion actions.",
        fields=(
            PermissionFieldCatalogEntry("child_id", "Child ID", "Selected child record."),
            PermissionFieldCatalogEntry("promoted_at", "Promotion Date", "Promotion execution timestamp."),
            PermissionFieldCatalogEntry("notes", "Promotion Notes", "Promotion-related comments."),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="payments",
        label="Payments",
        description="Payment ledger, summaries, and financial corrections.",
        fields=(
            PermissionFieldCatalogEntry("member_id", "Member", "Associated member or household."),
            PermissionFieldCatalogEntry("amount", "Amount", "Payment amount."),
            PermissionFieldCatalogEntry("method", "Method", "Payment method."),
            PermissionFieldCatalogEntry("service_type_code", "Service Type", "Contribution/service classification."),
            PermissionFieldCatalogEntry("status", "Status", "Payment status lifecycle."),
            PermissionFieldCatalogEntry("memo", "Memo", "Payment memo and notes."),
            PermissionFieldCatalogEntry("posted_at", "Posted At", "Posting date."),
            PermissionFieldCatalogEntry("due_date", "Due Date", "Expected due date."),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="sponsorships",
        label="Sponsorships",
        description="Sponsorship cases, approvals, and related notes.",
        fields=(
            PermissionFieldCatalogEntry(
                "budget_rounds",
                "Budget Rounds",
                "Create, update, and remove sponsorship budget rounds and slot limits.",
            ),
            PermissionFieldCatalogEntry("sponsor_id", "Sponsor", "Sponsor member reference."),
            PermissionFieldCatalogEntry("beneficiary_member_id", "Beneficiary Member", "Beneficiary member reference."),
            PermissionFieldCatalogEntry("newcomer_id", "Beneficiary Newcomer", "Beneficiary newcomer reference."),
            PermissionFieldCatalogEntry("status", "Status", "Case status and approvals."),
            PermissionFieldCatalogEntry("program", "Program", "Program allocation."),
            PermissionFieldCatalogEntry("monthly_amount", "Monthly Amount", "Pledge amount."),
            PermissionFieldCatalogEntry("frequency", "Frequency", "Pledge frequency."),
            PermissionFieldCatalogEntry("notes", "Notes", "Case notes and follow-up."),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="newcomers",
        label="Newcomers",
        description="Newcomer intake, contact tracking, and settlement lifecycle.",
        fields=(
            PermissionFieldCatalogEntry("first_name", "First Name", "Given name."),
            PermissionFieldCatalogEntry("last_name", "Last Name", "Family name."),
            PermissionFieldCatalogEntry("contact_phone", "Phone", "Primary phone number."),
            PermissionFieldCatalogEntry("contact_whatsapp", "WhatsApp", "WhatsApp number."),
            PermissionFieldCatalogEntry("contact_email", "Email", "Primary email."),
            PermissionFieldCatalogEntry("country", "Country of Origin", "Origin country."),
            PermissionFieldCatalogEntry("family_size", "Family Size", "Reported family size."),
            PermissionFieldCatalogEntry("preferred_language", "Languages", "Preferred communication language(s)."),
            PermissionFieldCatalogEntry("interpreter_required", "Interpreter", "Interpreter requirement."),
            PermissionFieldCatalogEntry("temporary_address", "Temporary Address", "Temporary settlement address fields."),
            PermissionFieldCatalogEntry("status", "Status", "Settlement status progression."),
            PermissionFieldCatalogEntry("notes", "Notes", "Intake and follow-up notes."),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="volunteers",
        label="Volunteers",
        description="Volunteer groups, workers, and schedules.",
        fields=(
            PermissionFieldCatalogEntry("name", "Name", "Volunteer/group name."),
            PermissionFieldCatalogEntry("phone", "Phone", "Volunteer contact phone."),
            PermissionFieldCatalogEntry("email", "Email", "Volunteer contact email."),
            PermissionFieldCatalogEntry("status", "Status", "Volunteer status."),
            PermissionFieldCatalogEntry("notes", "Notes", "Internal volunteer notes."),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="parish_councils",
        label="Parish Councils",
        description="Parish council departments, leads, trainees, and assignment history.",
        fields=(
            PermissionFieldCatalogEntry("name", "Department", "Parish council department name."),
            PermissionFieldCatalogEntry("description", "Description", "Department description and scope notes."),
            PermissionFieldCatalogEntry("status", "Department Status", "Department activation status."),
            PermissionFieldCatalogEntry("minimum_age", "Minimum Age", "Minimum trainee age for the department."),
            PermissionFieldCatalogEntry("lead_first_name", "Lead First Name", "Department lead first name."),
            PermissionFieldCatalogEntry("lead_last_name", "Lead Last Name", "Department lead last name."),
            PermissionFieldCatalogEntry("lead_email", "Lead Email", "Department lead email."),
            PermissionFieldCatalogEntry("lead_phone", "Lead Phone", "Department lead phone."),
            PermissionFieldCatalogEntry("lead_term_dates", "Lead Term Dates", "Lead term start and end dates."),
            PermissionFieldCatalogEntry("trainee_first_name", "Trainee First Name", "Trainee first name."),
            PermissionFieldCatalogEntry("trainee_last_name", "Trainee Last Name", "Trainee last name."),
            PermissionFieldCatalogEntry("trainee_email", "Trainee Email", "Trainee email."),
            PermissionFieldCatalogEntry("trainee_phone", "Trainee Phone", "Trainee phone."),
            PermissionFieldCatalogEntry("trainee_birth_date", "Trainee Birth Date", "Trainee birth date used for age validation."),
            PermissionFieldCatalogEntry("training_dates", "Training Dates", "Training start and end dates."),
            PermissionFieldCatalogEntry("training_status", "Training Status", "Training assignment status."),
            PermissionFieldCatalogEntry("approval", "Approval Workflow", "Approval submission, review, and decision actions."),
            PermissionFieldCatalogEntry("documents", "Documents", "Uploaded approval forms, training files, and supporting documents."),
            PermissionFieldCatalogEntry("history", "History", "Timeline, audit history, and change inspection."),
            PermissionFieldCatalogEntry("notes", "Notes", "Department and assignment notes."),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="schools",
        label="Schools",
        description="Sunday school content, enrollments, attendance, and approvals.",
        fields=(
            PermissionFieldCatalogEntry("lesson", "Lesson", "Lesson metadata/content."),
            PermissionFieldCatalogEntry("enrollment", "Enrollment", "Enrollment details."),
            PermissionFieldCatalogEntry("attendance", "Attendance", "Attendance records."),
            PermissionFieldCatalogEntry("status", "Status", "Workflow status."),
            PermissionFieldCatalogEntry("notes", "Notes", "Administrative notes."),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="reports",
        label="Reports",
        description="Operational reports and analytics exports.",
        fields=(
            PermissionFieldCatalogEntry(
                "overview",
                "Overview",
                "Cross-module overview cards, operational highlights, and recent activity.",
            ),
            PermissionFieldCatalogEntry("members", "Member Report", "Roster, growth, and member data quality analytics."),
            PermissionFieldCatalogEntry("payments", "Financial Report", "Payment summaries, revenue mix, and finance analytics."),
            PermissionFieldCatalogEntry(
                "sponsorships",
                "Sponsorship Report",
                "Sponsorship capacity, budget utilization, and case analytics.",
            ),
            PermissionFieldCatalogEntry(
                "newcomers",
                "Newcomer Report",
                "Intake pipeline, follow-up pressure, and settlement reporting.",
            ),
            PermissionFieldCatalogEntry(
                "schools",
                "School Report",
                "Sunday school participation, content queue, and revenue reporting.",
            ),
            PermissionFieldCatalogEntry(
                "councils",
                "Parish Councils Report",
                "Department lead and trainee assignment reporting.",
            ),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="users",
        label="User Management",
        description="Administrative identities, invites, links, and role assignments.",
        fields=(
            PermissionFieldCatalogEntry("full_name", "Full Name", "Display name."),
            PermissionFieldCatalogEntry("username", "Username", "Login username."),
            PermissionFieldCatalogEntry("is_active", "Active", "Account activation status."),
            PermissionFieldCatalogEntry("is_super_admin", "Super Admin", "Super admin elevation flag."),
            PermissionFieldCatalogEntry("roles", "Roles", "Assigned roles."),
            PermissionFieldCatalogEntry("member_link", "Member Link", "Linked member identity."),
        ),
    ),
    PermissionModuleCatalogEntry(
        key="system",
        label="System",
        description="System-level operations such as license activation.",
        fields=(),
    ),
)


PERMISSION_MODULE_KEYS: tuple[str, ...] = tuple(module.key for module in PERMISSION_CATALOG)
PERMISSION_FIELD_KEYS: dict[str, set[str]] = {
    module.key: {field.key for field in module.fields}
    for module in PERMISSION_CATALOG
}

DEFAULT_FIELD_PERMISSION_OVERRIDES: dict[str, dict[str, dict[str, bool]]] = {
    "members": {
        "father_confessor_management": {"read": False, "write": False},
    },
    "sponsorships": {
        "budget_rounds": {"read": False, "write": False},
    },
}

SYSTEM_ROLE_NAMES: set[str] = {
    "SuperAdmin",
    "Admin",
    "PublicRelations",
    "Registrar",
    "Clerk",
    "OfficeAdmin",
    "FinanceAdmin",
    "SponsorshipCommittee",
    "SchoolAdmin",
    "SundaySchoolViewer",
    "SundaySchoolAdmin",
    "SundaySchoolApprover",
    "ParishCouncilAdmin",
    "Priest",
}


def is_system_role_name(role_name: str) -> bool:
    return role_name in SYSTEM_ROLE_NAMES


def _all_modules_enabled() -> dict[str, dict[str, bool]]:
    return {module: {"read": True, "write": True, "visible": True} for module in PERMISSION_MODULE_KEYS}


def _empty_modules() -> dict[str, dict[str, bool]]:
    return {module: {"read": False, "write": False, "visible": False} for module in PERMISSION_MODULE_KEYS}


SYSTEM_ROLE_DEFAULTS: dict[str, dict[str, dict[str, bool]]] = {
    "SuperAdmin": _all_modules_enabled(),
    "Admin": _all_modules_enabled(),
    "PublicRelations": {
        **_empty_modules(),
        "members": {"read": True, "write": True},
        "promotions": {"read": True, "write": True},
        "sponsorships": {"read": True, "write": False},
        "newcomers": {"read": True, "write": True},
        "volunteers": {"read": True, "write": True},
        "schools": {"read": True, "write": False},
        "reports": {"read": True, "write": False},
        "users": {"read": True, "write": False},
    },
    "Registrar": {
        **_empty_modules(),
        "members": {"read": True, "write": True},
        "promotions": {"read": True, "write": False},
        "newcomers": {"read": True, "write": True},
        "volunteers": {"read": True, "write": False},
        "reports": {"read": True, "write": False},
        "users": {"read": True, "write": False},
    },
    "Clerk": {
        **_empty_modules(),
        "members": {"read": True, "write": False},
        "promotions": {"read": True, "write": False},
    },
    "OfficeAdmin": {
        **_empty_modules(),
        "members": {"read": True, "write": False},
        "promotions": {"read": True, "write": False},
        "payments": {"read": True, "write": False},
        "sponsorships": {"read": True, "write": False},
        "newcomers": {"read": True, "write": False},
        "volunteers": {"read": True, "write": True},
        "parish_councils": {"read": True, "write": False},
        "schools": {"read": True, "write": False},
        "reports": {"read": True, "write": False},
        "users": {"read": True, "write": False},
    },
    "FinanceAdmin": {
        **_empty_modules(),
        "members": {"read": True, "write": True},
        "promotions": {"read": True, "write": False},
        "payments": {"read": True, "write": True},
        "sponsorships": {"read": True, "write": False},
        "reports": {"read": True, "write": False},
        "volunteers": {"read": True, "write": False},
    },
    "SponsorshipCommittee": {
        **_empty_modules(),
        "members": {"read": True, "write": False},
        "sponsorships": {"read": True, "write": True},
        "newcomers": {"read": True, "write": True},
        "reports": {"read": True, "write": False},
        "volunteers": {"read": True, "write": False},
        "users": {"read": True, "write": False},
    },
    "SchoolAdmin": {
        **_empty_modules(),
        "schools": {"read": True, "write": True},
        "reports": {"read": True, "write": False},
    },
    "SundaySchoolViewer": {
        **_empty_modules(),
        "schools": {"read": True, "write": False},
        "reports": {"read": True, "write": False},
    },
    "SundaySchoolAdmin": {
        **_empty_modules(),
        "schools": {"read": True, "write": True},
        "reports": {"read": True, "write": False},
    },
    "SundaySchoolApprover": {
        **_empty_modules(),
        "schools": {"read": True, "write": True},
    },
    "ParishCouncilAdmin": {
        **_empty_modules(),
        "parish_councils": {"read": True, "write": True},
        "reports": {"read": True, "write": False},
    },
    "Priest": {
        **_empty_modules(),
        "schools": {"read": True, "write": True},
    },
}

SYSTEM_ROLE_FIELD_DEFAULTS: dict[str, dict[str, dict[str, dict[str, bool]]]] = {
    "Admin": {
        "members": {
            "father_confessor_management": {"read": True, "write": True},
        },
        "sponsorships": {
            "budget_rounds": {"read": True, "write": True},
        },
    },
    "PublicRelations": {
        "members": {
            "father_confessor_management": {"read": True, "write": True},
        },
    },
}


def _field_permission_flags(
    field_permissions: dict[str, dict[str, dict[str, bool]]] | None,
    module: str,
    field: str,
) -> dict[str, bool] | None:
    if not field_permissions:
        return None
    module_fields = field_permissions.get(module, {})
    if field not in module_fields:
        return None
    flags = module_fields[field]
    return {
        "read": bool(flags.get("read")),
        "write": bool(flags.get("write")),
    }


def _copy_modules(source: dict[str, dict[str, bool]] | None = None) -> dict[str, dict[str, bool]]:
    baseline = _empty_modules()
    if not source:
        return baseline
    for module, flags in source.items():
        if module not in baseline or not isinstance(flags, dict):
            continue
        normalized = _module_permission_flags(flags)
        if normalized is None:
            continue
        baseline[module] = normalized
    return baseline


def _copy_field_permissions_with_defaults(
    source: dict[str, dict[str, dict[str, bool]]] | None = None,
) -> dict[str, dict[str, dict[str, bool]]]:
    baseline = {
        module: {
            field: {
                "read": bool(flags.get("read")),
                "write": bool(flags.get("write")),
            }
            for field, flags in field_map.items()
            if module in PERMISSION_FIELD_KEYS and field in PERMISSION_FIELD_KEYS[module]
        }
        for module, field_map in DEFAULT_FIELD_PERMISSION_OVERRIDES.items()
        if module in PERMISSION_FIELD_KEYS
    }
    if not source:
        return baseline

    for module, field_map in source.items():
        if module not in PERMISSION_FIELD_KEYS:
            continue
        module_target = baseline.setdefault(module, {})
        for field, flags in field_map.items():
            if field not in PERMISSION_FIELD_KEYS[module]:
                continue
            module_target[field] = {
                "read": bool(flags.get("read")),
                "write": bool(flags.get("write")),
            }
    return baseline


def normalize_module_permissions(
    payload: Any,
    *,
    include_all_modules: bool = False,
) -> dict[str, dict[str, bool]]:
    if not isinstance(payload, dict):
        return _empty_modules() if include_all_modules else {}

    result = _empty_modules() if include_all_modules else {}
    for module, flags in payload.items():
        if module not in PERMISSION_MODULE_KEYS:
            continue
        normalized_flags = _module_permission_flags(flags)
        if normalized_flags is None:
            continue
        if include_all_modules:
            result[module] = normalized_flags
        else:
            result[module] = normalized_flags
    return result


def normalize_field_permissions(payload: Any) -> dict[str, dict[str, dict[str, bool]]]:
    if not isinstance(payload, dict):
        return {}

    result: dict[str, dict[str, dict[str, bool]]] = {}
    for module, field_payload in payload.items():
        if module not in PERMISSION_MODULE_KEYS or not isinstance(field_payload, dict):
            continue
        allowed_fields = PERMISSION_FIELD_KEYS.get(module, set())
        normalized_fields: dict[str, dict[str, bool]] = {}
        for field, actions in field_payload.items():
            if field not in allowed_fields:
                continue
            normalized_actions = _permission_flags_dict(actions)
            if normalized_actions is None:
                continue
            normalized_fields[field] = {
                "read": bool(normalized_actions.get("read")),
                "write": bool(normalized_actions.get("write")),
            }
        if normalized_fields:
            result[module] = normalized_fields
    return result


def _permission_flags_dict(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        if isinstance(dumped, dict):
            return dumped
    if hasattr(value, "dict"):
        dumped = value.dict()
        if isinstance(dumped, dict):
            return dumped
    read = getattr(value, "read", None)
    write = getattr(value, "write", None)
    if read is None and write is None:
        return None
    return {"read": bool(read), "write": bool(write)}


def _module_permission_flags(value: Any) -> dict[str, bool] | None:
    normalized_flags = _permission_flags_dict(value)
    if normalized_flags is None:
        return None
    read = bool(normalized_flags.get("read"))
    write = bool(normalized_flags.get("write"))
    raw_visible = normalized_flags.get("visible")
    visible = bool(raw_visible) if raw_visible is not None else (read or write)
    if not (read or write):
        visible = False
    return {"read": read, "write": write, "visible": visible}


def get_default_module_permissions_for_role(role_name: str) -> dict[str, dict[str, bool]]:
    return _copy_modules(SYSTEM_ROLE_DEFAULTS.get(role_name))


def get_default_field_permissions_for_role(role_name: str) -> dict[str, dict[str, dict[str, bool]]]:
    return _copy_field_permissions_with_defaults(SYSTEM_ROLE_FIELD_DEFAULTS.get(role_name))


def resolve_role_module_permissions(role: Role) -> dict[str, dict[str, bool]]:
    defaults = get_default_module_permissions_for_role(role.name)
    if role.module_permissions is None:
        return defaults
    overrides = normalize_module_permissions(role.module_permissions, include_all_modules=False)
    for module, flags in overrides.items():
        defaults[module] = {
            "read": bool(flags.get("read")),
            "write": bool(flags.get("write")),
            "visible": bool(flags.get("visible")),
        }
    return defaults


def resolve_role_field_permissions(role: Role) -> dict[str, dict[str, dict[str, bool]]]:
    defaults = get_default_field_permissions_for_role(role.name)
    if role.field_permissions is None:
        return defaults
    overrides = normalize_field_permissions(role.field_permissions)
    for module, field_map in overrides.items():
        module_target = defaults.setdefault(module, {})
        for field, flags in field_map.items():
            module_target[field] = {
                "read": bool(flags.get("read")),
                "write": bool(flags.get("write")),
            }
    return defaults


def _merge_field_permissions(
    base: dict[str, dict[str, dict[str, bool]]],
    role_fields: dict[str, dict[str, dict[str, bool]]],
) -> None:
    for module, field_map in role_fields.items():
        module_target = base.setdefault(module, {})
        for field, flags in field_map.items():
            current = module_target.setdefault(field, {"read": False, "write": False})
            current["read"] = current["read"] or bool(flags.get("read"))
            current["write"] = current["write"] or bool(flags.get("write"))


def compute_effective_permissions(
    roles: Iterable[Role],
    *,
    is_super_admin: bool = False,
) -> dict[str, Any]:
    if is_super_admin:
        modules = _all_modules_enabled()
    else:
        modules = _empty_modules()
        for role in roles:
            resolved = resolve_role_module_permissions(role)
            for module, flags in resolved.items():
                modules[module]["read"] = modules[module]["read"] or bool(flags.get("read"))
                modules[module]["write"] = modules[module]["write"] or bool(flags.get("write"))
                modules[module]["visible"] = modules[module]["visible"] or bool(flags.get("visible"))

    field_permissions: dict[str, dict[str, dict[str, bool]]] = {}
    if not is_super_admin:
        for role in roles:
            _merge_field_permissions(field_permissions, resolve_role_field_permissions(role))

    legacy = to_legacy_permission_map(
        modules,
        field_permissions=field_permissions,
        is_super_admin=is_super_admin,
    )
    return {
        "modules": modules,
        "fields": field_permissions,
        "legacy": legacy,
    }


def to_legacy_permission_map(
    modules: dict[str, dict[str, bool]],
    *,
    field_permissions: dict[str, dict[str, dict[str, bool]]] | None = None,
    is_super_admin: bool = False,
) -> dict[str, bool]:
    if is_super_admin:
        return {
            "viewMembers": True,
            "createMembers": True,
            "editCore": True,
            "editStatus": True,
            "editFinance": True,
            "editSpiritual": True,
            "manageFatherConfessors": True,
            "bulkActions": True,
            "importMembers": True,
            "exportMembers": True,
            "viewAudit": True,
            "viewPromotions": True,
            "runPromotions": True,
            "viewPayments": True,
            "managePayments": True,
            "viewSponsorships": True,
            "manageSponsorships": True,
            "viewNewcomers": True,
            "manageNewcomers": True,
            "viewVolunteers": True,
            "manageVolunteers": True,
            "viewParishCouncils": True,
            "manageParishCouncils": True,
            "viewSchools": True,
            "manageSchools": True,
        }

    def _module_read(module: str) -> bool:
        return bool(modules.get(module, {}).get("read"))

    def _module_write(module: str) -> bool:
        return bool(modules.get(module, {}).get("write"))

    def _field_write(module: str, field: str) -> bool:
        flags = _field_permission_flags(field_permissions, module, field)
        if flags is None:
            return False
        return bool(flags.get("write"))

    return {
        "viewMembers": _module_read("members"),
        "createMembers": _module_write("members"),
        "editCore": _module_write("members"),
        "editStatus": _module_write("members"),
        "editFinance": _module_write("members"),
        "editSpiritual": _module_write("members"),
        "manageFatherConfessors": _field_write("members", "father_confessor_management"),
        "bulkActions": _module_write("members"),
        "importMembers": _module_write("members"),
        "exportMembers": _module_read("members"),
        "viewAudit": _module_read("reports"),
        "viewPromotions": _module_read("promotions"),
        "runPromotions": _module_write("promotions"),
        "viewPayments": _module_read("payments"),
        "managePayments": _module_write("payments"),
        "viewSponsorships": _module_read("sponsorships"),
        "manageSponsorships": _module_write("sponsorships"),
        "viewNewcomers": _module_read("newcomers"),
        "manageNewcomers": _module_write("newcomers"),
        "viewVolunteers": _module_read("volunteers"),
        "manageVolunteers": _module_write("volunteers"),
        "viewParishCouncils": _module_read("parish_councils"),
        "manageParishCouncils": _module_write("parish_councils"),
        "viewSchools": _module_read("schools"),
        "manageSchools": _module_write("schools"),
    }


def infer_permission_target(method: str, path: str) -> tuple[str | None, PermissionAction]:
    upper_method = method.upper()
    action: PermissionAction = "read" if upper_method in {"GET", "HEAD", "OPTIONS"} else "write"

    if path.startswith("/members") or path.startswith("/households") or path.startswith("/priests"):
        return "members", action
    if path.startswith("/children"):
        return "promotions", action
    if path.startswith("/payments"):
        return "payments", action
    if path.startswith("/sponsorships"):
        return "sponsorships", action
    if path.startswith("/newcomers"):
        return "newcomers", action
    if path.startswith("/volunteers"):
        return "volunteers", action
    if path.startswith("/parish-councils"):
        return "parish_councils", action
    if path.startswith("/schools") or path.startswith("/sunday-school"):
        return "schools", action
    if path.startswith("/reports"):
        return "reports", action
    if path.startswith("/users") or path.startswith("/staff"):
        return "users", action
    if path.startswith("/license"):
        return "system", action
    return None, action


def has_module_permission(user: User, module: str, action: PermissionAction) -> bool:
    if user.is_super_admin:
        return True
    effective = compute_effective_permissions(user.roles, is_super_admin=user.is_super_admin)
    return bool(effective["modules"].get(module, {}).get(action))


def has_any_custom_role(user: User) -> bool:
    return any(
        not bool(getattr(role, "is_system", False)) and not is_system_role_name(role.name)
        for role in user.roles
    )


def _field_permission_entry_for_user(
    user: User,
    module: str,
    field: str,
) -> dict[str, bool] | None:
    if user.is_super_admin:
        return {"read": True, "write": True}
    read_allowed = False
    write_allowed = False
    has_entry = False
    for role in user.roles:
        role_fields = resolve_role_field_permissions(role)
        module_fields = role_fields.get(module, {})
        if field not in module_fields:
            continue
        has_entry = True
        flags = module_fields[field]
        read_allowed = read_allowed or bool(flags.get("read"))
        write_allowed = write_allowed or bool(flags.get("write"))
    if not has_entry:
        return None
    return {"read": read_allowed, "write": write_allowed}


def has_field_permission(user: User, module: str, field: str, action: PermissionAction) -> bool:
    if user.is_super_admin:
        return True
    if not has_module_permission(user, module, action):
        return False
    entry = _field_permission_entry_for_user(user, module, field)
    if entry is None:
        return True
    return bool(entry.get(action))


def forbidden_write_fields(user: User, module: str, fields: Iterable[str]) -> list[str]:
    if user.is_super_admin:
        return []
    if not has_module_permission(user, module, "write"):
        return sorted(set(fields))
    blocked = [field for field in set(fields) if not has_field_permission(user, module, field, "write")]
    return sorted(blocked)


def permission_catalog_payload() -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for module in PERMISSION_CATALOG:
        payload.append(
            {
                "key": module.key,
                "label": module.label,
                "description": module.description,
                "fields": [
                    {"key": field.key, "label": field.label, "description": field.description}
                    for field in module.fields
                ],
            }
        )
    return payload
