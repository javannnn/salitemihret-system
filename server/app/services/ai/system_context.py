from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.schemas.ai import AIReportQAModule
from app.services.ai.catalog import list_capabilities
from app.services.permissions import PERMISSION_CATALOG

REPORT_MODULE_DESCRIPTIONS: dict[AIReportQAModule, str] = {
    "members": "Roster health, statuses, contribution flags, and profile completeness.",
    "payments": "Posted revenue, service-type mix, and contribution trends.",
    "sponsorships": "Case pipeline, submitted approvals, and capacity-based budget usage.",
    "newcomers": "Intake and settlement workflow counts across newcomer statuses.",
    "schools": "Sunday school participation, contribution rate, and pending content.",
    "activity": "Recent audit activity across operational modules.",
}

STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "can",
    "do",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "of",
    "or",
    "show",
    "tell",
    "the",
    "this",
    "to",
    "we",
    "what",
    "where",
    "which",
    "who",
    "why",
}


@dataclass(frozen=True, slots=True)
class BroaderSystemDirectAnswer:
    answer: str


SYSTEM_MODULE_GUIDES: tuple[dict[str, Any], ...] = (
    {
        "key": "user_management",
        "label": "User Management",
        "aliases": ("user management", "users", "admin users", "user admin", "roles and permissions"),
        "summary": "Handles staff accounts, sign-in access, and role-based access control.",
        "audience_note": "Explain this for office staff, not engineers.",
        "access": "Super Admin access is required.",
        "screens": ("Users", "Roles & Permissions"),
        "features": (
            "Create new user accounts",
            "Send invitations or provision access directly",
            "Activate or deactivate accounts",
            "Link a user account to a member record",
            "Reset a user's password and issue a temporary password",
            "Assign or change which roles a user has",
            "Review the user's audit trail",
            "Create custom roles and adjust what each role can read or write",
        ),
        "role_editing": "Yes. You can change which roles a user has from the Users side.",
        "permission_editing": "Yes. To change what a role is allowed to do, open Roles & Permissions inside User Management.",
        "clarification": "Role assignment and permission editing are related but happen in two different places inside the same module.",
    },
    {
        "key": "member_promotions",
        "label": "Members and Promotions",
        "aliases": (
            "turning 18",
            "turn 18",
            "turns 18",
            "child turning 18",
            "children turning 18",
            "child promotion",
            "promotions",
            "promote child",
            "promote children",
            "convert it to a member",
            "convert to a member",
            "child to member",
            "children approaching 18",
        ),
        "summary": "Tracks children approaching 18 and supports promoting them into member records.",
        "audience_note": "Explain this as an office workflow, not a technical job.",
        "access": "Viewing and running promotions depends on promotion permissions.",
        "screens": ("Dashboard promotions", "Members promotion tools"),
        "features": (
            "See children who are approaching 18 in an upcoming promotions list",
            "Review which children are ready now versus still upcoming",
            "Run a single promotion or a bulk promotion when children are due",
            "Create a new member record as part of the promotion",
            "Track recent promotion activity after the action runs",
        ),
        "notification_behavior": (
            "The system can show an upcoming promotions list and can send a promotion digest to configured staff roles "
            "for children approaching 18."
        ),
        "conversion_behavior": (
            "It does not silently convert a child into a member just because the birthday is getting close. "
            "A staff user runs the promotion when the child is ready, and that action creates the new member record."
        ),
        "follow_through": "When the promotion is applied, the child is marked as promoted and a promotion notification is sent.",
    },
)


def build_broader_system_context(*, question: str, report_modules: list[AIReportQAModule]) -> dict[str, Any]:
    snapshot = _system_metadata_snapshot()
    return {
        "mode": "broader_system_context",
        "question_focus": _infer_question_focus(question),
        "report_scope_modules": [
            {
                "key": module,
                "label": module.replace("_", " ").title(),
                "description": REPORT_MODULE_DESCRIPTIONS.get(module, ""),
            }
            for module in report_modules
        ],
        "capabilities": snapshot["capabilities"],
        "permission_modules": _select_permission_modules(question, snapshot["permission_modules"]),
        "relevant_system_modules": _select_system_modules(question),
        "relevant_endpoints": _select_relevant_operations(question, snapshot["operations"]),
        "available_api_tags": snapshot["api_tags"],
    }


def build_broader_system_direct_answer(question: str) -> BroaderSystemDirectAnswer | None:
    question_text = _normalize_text(question)
    if not question_text:
        return None

    user_management_guide = _get_system_module_guide("user_management")
    if user_management_guide and _question_matches_system_module(question_text, user_management_guide):
        return BroaderSystemDirectAnswer(answer=_build_user_management_answer(question_text, user_management_guide))

    member_promotions_guide = _get_system_module_guide("member_promotions")
    if member_promotions_guide and _question_matches_system_module(question_text, member_promotions_guide):
        return BroaderSystemDirectAnswer(answer=_build_member_promotions_answer(question_text, member_promotions_guide))

    return None


@lru_cache(maxsize=1)
def _system_metadata_snapshot() -> dict[str, Any]:
    from app.main import app

    schema = app.openapi()
    operations: list[dict[str, Any]] = []
    tag_counts: dict[str, int] = {}

    for path, methods in (schema.get("paths") or {}).items():
        if not isinstance(methods, dict):
            continue
        for method, operation in methods.items():
            if method.lower() not in {"get", "post", "put", "patch", "delete"}:
                continue
            if not isinstance(operation, dict):
                continue
            tags = [str(tag) for tag in operation.get("tags") or [] if str(tag).strip()]
            for tag in tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
            operations.append(
                {
                    "method": method.upper(),
                    "path": path,
                    "tags": tags,
                    "summary": str(operation.get("summary") or operation.get("operationId") or "").strip(),
                    "description": _compact_description(operation.get("description")),
                }
            )

    capabilities = [
        {
            "slug": capability.slug,
            "label": capability.label,
            "module": capability.module,
            "description": capability.description,
            "enabled": capability.enabled,
        }
        for capability in list_capabilities()
    ]
    permission_modules = [
        {
            "key": module.key,
            "label": module.label,
            "description": module.description,
        }
        for module in PERMISSION_CATALOG
    ]
    api_tags = [
        {"tag": tag, "operations": count}
        for tag, count in sorted(tag_counts.items(), key=lambda item: (-item[1], item[0].lower()))[:10]
    ]

    return {
        "capabilities": capabilities,
        "permission_modules": permission_modules,
        "operations": operations,
        "api_tags": api_tags,
    }


def _infer_question_focus(question: str) -> str:
    normalized = " ".join(question.split())
    if not normalized:
        return "General system question."
    return normalized[:180]


def _select_permission_modules(question: str, modules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keywords = _question_keywords(question)
    scored: list[tuple[int, dict[str, Any]]] = []
    for module in modules:
        haystack = " ".join(
            [
                str(module.get("key") or ""),
                str(module.get("label") or ""),
                str(module.get("description") or ""),
            ]
        ).lower()
        score = sum(1 for keyword in keywords if keyword in haystack)
        if score:
            scored.append((score, module))

    if not scored:
        return modules[:6]

    ranked = sorted(scored, key=lambda item: (-item[0], str(item[1].get("label") or "")))
    return [module for _, module in ranked[:6]]


def _select_relevant_operations(question: str, operations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keywords = _question_keywords(question)
    scored: list[tuple[int, dict[str, Any]]] = []

    for operation in operations:
        summary = str(operation.get("summary") or "")
        description = str(operation.get("description") or "")
        tags = " ".join(str(tag) for tag in operation.get("tags") or [])
        path = str(operation.get("path") or "")
        haystack = f"{summary} {description} {tags} {path}".lower()
        score = 0
        for keyword in keywords:
            if keyword in haystack:
                score += 3
            if keyword in path.lower():
                score += 2
            if keyword in tags.lower():
                score += 1
        if score:
            scored.append((score, operation))

    if not scored:
        return operations[:10]

    ranked = sorted(
        scored,
        key=lambda item: (
            -item[0],
            str(item[1].get("path") or ""),
            str(item[1].get("method") or ""),
        ),
    )
    selected: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for _, operation in ranked:
        key = (str(operation.get("method") or ""), str(operation.get("path") or ""))
        if key in seen:
            continue
        seen.add(key)
        selected.append(operation)
        if len(selected) >= 10:
            break
    return selected


def _question_keywords(question: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", question.lower())
    return [token for token in tokens if len(token) > 2 and token not in STOP_WORDS]


def _normalize_text(value: str) -> str:
    return " ".join(value.lower().split())


def _select_system_modules(question: str) -> list[dict[str, Any]]:
    question_text = _normalize_text(question)
    if not question_text:
        return [
            {
                "key": guide["key"],
                "label": guide["label"],
                "summary": guide["summary"],
                "screens": list(guide.get("screens") or []),
            }
            for guide in SYSTEM_MODULE_GUIDES[:4]
        ]

    matched = [guide for guide in SYSTEM_MODULE_GUIDES if _question_matches_system_module(question_text, guide)]
    chosen = matched or list(SYSTEM_MODULE_GUIDES[:4])
    return [
        {
            "key": guide["key"],
            "label": guide["label"],
            "summary": guide["summary"],
            "access": guide.get("access"),
            "screens": list(guide.get("screens") or []),
            "features": list(guide.get("features") or []),
            "clarification": guide.get("clarification"),
        }
        for guide in chosen
    ]


def _question_matches_system_module(question_text: str, guide: dict[str, Any]) -> bool:
    aliases = [str(alias).lower() for alias in guide.get("aliases") or []]
    return any(alias in question_text for alias in aliases)


def _get_system_module_guide(key: str) -> dict[str, Any] | None:
    for guide in SYSTEM_MODULE_GUIDES:
        if guide.get("key") == key:
            return guide
    return None


def _build_user_management_answer(question_text: str, guide: dict[str, Any]) -> str:
    features = list(guide.get("features") or [])
    role_editing = str(guide.get("role_editing") or "").strip()
    permission_editing = str(guide.get("permission_editing") or "").strip()
    clarification = str(guide.get("clarification") or "").strip()
    access = str(guide.get("access") or "").strip()

    asks_for_features = any(
        hint in question_text
        for hint in ("feature", "features", "what can", "what does", "used for", "module", "do there")
    )
    asks_about_roles = any(hint in question_text for hint in ("role", "roles"))
    asks_about_permissions = any(hint in question_text for hint in ("permission", "permissions", "access"))

    lines: list[str] = []
    if asks_for_features or not (asks_about_roles or asks_about_permissions):
        lines.append(
            "User Management is where you handle staff accounts and access. "
            "You can create users, send invitations, turn accounts on or off, link users to member records, reset passwords, assign roles, and review account history."
        )

    if asks_about_roles or asks_about_permissions:
        lines.append(f"{role_editing} {permission_editing}")
        if clarification:
            lines.append(clarification)

    if access:
        lines.append(access)

    return " ".join(line.strip() for line in lines if line.strip())


def _build_member_promotions_answer(question_text: str, guide: dict[str, Any]) -> str:
    notification_behavior = str(guide.get("notification_behavior") or "").strip()
    conversion_behavior = str(guide.get("conversion_behavior") or "").strip()
    follow_through = str(guide.get("follow_through") or "").strip()
    access = str(guide.get("access") or "").strip()

    asks_about_notifications = any(
        hint in question_text for hint in ("inform", "notify", "notification", "alert", "remind", "soon", "turning 18")
    )
    asks_about_conversion = any(
        hint in question_text for hint in ("convert", "member", "promotion", "promote", "turn 18", "turning 18")
    )

    lines: list[str] = [
        "In Members, there is a promotion workflow for children who are approaching 18.",
    ]

    if asks_about_notifications or not asks_about_conversion:
        lines.append(notification_behavior)

    if asks_about_conversion or asks_about_notifications:
        lines.append(conversion_behavior)
        lines.append(follow_through)

    if access:
        lines.append(access)

    return " ".join(line.strip() for line in lines if line.strip())


def _compact_description(value: Any) -> str:
    if not value:
        return ""
    text = " ".join(str(value).split())
    if len(text) <= 180:
        return text
    return f"{text[:177].rstrip()}..."
