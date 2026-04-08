from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.member import Member
from app.models.payment import Payment
from app.schemas.ai import (
    AIReportAnswerResponse,
    AIReportChartDatum,
    AIReportChartRead,
    AIReportConfirmationRead,
    AIReportQAModule,
    AIReportQARequest,
    AIReportSourceMetric,
    AIReportSourceRead,
)
from app.models.user import User
from app.services import payments as payment_service
from app.services import reporting as reporting_service
from app.services import sponsorships as sponsorship_service
from app.services import sunday_school as sunday_school_service
from app.services.members_query import build_members_query
from app.services.permissions import has_field_permission, has_module_permission

REPORT_QA_MODULES: tuple[AIReportQAModule, ...] = (
    "members",
    "payments",
    "sponsorships",
    "newcomers",
    "schools",
    "activity",
)

MODULE_KEYWORDS: dict[AIReportQAModule, tuple[str, ...]] = {
    "members": ("member", "members", "roster", "status", "archive", "archived", "phone"),
    "payments": ("payment", "payments", "revenue", "donation", "donations", "finance", "financial", "contribution", "tithe"),
    "sponsorships": ("sponsorship", "sponsorships", "budget", "capacity", "submitted", "suspended"),
    "newcomers": (
        "newcomer",
        "newcomers",
        "intake",
        "settled",
        "contacted",
        "assigned",
        "follow-up",
        "followup",
        "interpreter",
        "language",
        "referral",
        "owner",
    ),
    "schools": ("school", "schools", "student", "students", "sunday school", "abenet", "participant", "participants"),
    "activity": ("activity", "audit", "recent", "changed", "changes", "timeline"),
}

ATTENTION_HINTS = ("attention", "risk", "urgent", "concern", "focus", "problem", "issue")
RECENT_HINTS = ("recent", "changed", "changes", "latest", "lately", "new", "activity", "update")
TOP_HINTS = ("top", "leading", "highest", "largest")
CATEGORY_HINTS = ("category", "categories", "breakdown", "mix", "split")
PAYER_HINTS = ("payer", "payers", "paying", "contribution", "contributors")
CORRECTION_HINTS = ("didn't ask", "did not ask", "not what i asked", "that's not what i asked")
VISUAL_EXPLICIT_HINTS = ("chart", "graph", "visual", "visualize", "plot", "show me")
VISUAL_COMPARISON_HINTS = ("breakdown", "distribution", "split", "mix", "trend", "trends", "compare", "comparison", "versus", "vs", "pipeline")
NO_CHART_HINTS = ("don't show chart", "do not show chart", "no chart", "without chart", "text only", "don't include a chart", "do not include a chart")
NON_PAYER_HINTS = ("non paying", "non-paying", "not paying", "without contribution", "not marked as paying")
MONEY_HINTS = ("how much money", "how much revenue", "how much did we make", "how much did we bring in", "total revenue", "revenue total")
TOP_PAYER_HINTS = ("top paying member", "highest paying member", "top payer", "leading payer", "who paid the most")
NAME_FOLLOW_UP_HINTS = ("name him", "name her", "name them", "who is it", "who is he", "who is she", "what is his name", "what is her name")
FOLLOW_UP_PREFIX_HINTS = ("and ", "what about", "how about", "name ", "who is it", "who is he", "who is she", "him", "her", "them", "same for")
SPONSORSHIP_BUDGET_HINTS = ("budget", "capacity", "utilization", "slot", "slots")
SYSTEM_SCOPE_HINTS = (
    "api",
    "apis",
    "openapi",
    "schema",
    "swagger",
    "endpoint",
    "endpoints",
    "route",
    "routes",
    "auth",
    "authentication",
    "login",
    "logout",
    "password",
    "credential",
    "credentials",
    "role",
    "roles",
    "permission",
    "permissions",
    "user management",
    "invite",
    "invites",
    "account",
    "accounts",
    "capability",
    "capabilities",
    "feature",
    "features",
    "system",
    "workflow",
)
SYSTEM_ACTION_PREFIX_HINTS = ("how do i", "how can i", "where do i", "which endpoint", "which route", "can the system", "does the system")
SYSTEM_EXPLANATION_HINTS = (
    "list the features",
    "list features",
    "what are the features",
    "features in",
    "what can",
    "what does",
    "used for",
    "module",
    "modules",
    "screen",
    "screens",
    "page",
    "pages",
    "workflow",
    "workflows",
    "explain",
    "check the system",
)
SYSTEM_AUTOMATION_HINTS = (
    "automatic",
    "automatically",
    "notify",
    "notification",
    "notifications",
    "inform",
    "alert",
    "alerts",
    "remind",
    "reminder",
    "digest",
    "email",
    "emails",
    "turning 18",
    "turn 18",
    "turns 18",
    "convert",
    "conversion",
    "promote",
    "promotion",
    "promotions",
)
SYSTEM_ENTITY_HINTS = (
    "child",
    "children",
    "member",
    "members",
    "user",
    "users",
    "role",
    "roles",
    "permission",
    "permissions",
    "account",
    "accounts",
    "sponsorship",
    "sponsorships",
    "newcomer",
    "newcomers",
    "school",
    "schools",
    "gateway",
)
REPORT_SCOPE_HINTS = (
    "report",
    "reports",
    "summary",
    "snapshot",
    "status",
    "statuses",
    "trend",
    "trends",
    "category",
    "categories",
    "revenue",
    "budget",
    "capacity",
    "utilization",
    "payment",
    "payments",
    "member",
    "members",
    "sponsorship",
    "sponsorships",
    "newcomer",
    "newcomers",
    "school",
    "schools",
    "activity",
    "payer",
    "payers",
)


@dataclass(frozen=True, slots=True)
class ReportQADirectAnswer:
    answer: str
    focus_module: AIReportQAModule | None
    source_modules: tuple[AIReportQAModule, ...] = ()
    chart: AIReportChartRead | None = None


@dataclass(frozen=True, slots=True)
class ReportQAModuleContext:
    module: AIReportQAModule
    source: AIReportSourceRead
    prompt_data: dict[str, Any]
    chart: AIReportChartRead | None = None


@dataclass(frozen=True, slots=True)
class ReportQAContextSnapshot:
    applied_modules: list[AIReportQAModule]
    warnings: list[str]
    sources: list[AIReportSourceRead]
    prompt_context: dict[str, Any]
    chart: AIReportChartRead | None
    charts_by_module: dict[AIReportQAModule, AIReportChartRead]


def build_report_qa_context(
    db: Session,
    *,
    user: User,
    payload: AIReportQARequest,
) -> ReportQAContextSnapshot:
    start_date, end_date = normalize_report_qa_dates(payload.start_date, payload.end_date)
    if not has_module_permission(user, "reports", "read"):
        raise PermissionError("Reports access is required to use the report assistant.")

    accessible_modules = [module for module in REPORT_QA_MODULES if _can_read_module(user, module)]
    if not accessible_modules:
        raise PermissionError("No reporting modules are available for this user.")

    requested_modules = list(payload.modules) or accessible_modules
    blocked_modules = [module for module in requested_modules if module not in accessible_modules]
    selected_modules = [module for module in requested_modules if module in accessible_modules]
    if not selected_modules:
        raise PermissionError("None of the requested reporting modules are available for this user.")

    warnings: list[str] = []
    if blocked_modules:
        warnings.append(
            "Some requested report modules were omitted due to permissions: "
            + ", ".join(_module_label(module) for module in blocked_modules)
            + "."
        )

    module_contexts = [
        _build_module_context(db, module=module, start_date=start_date, end_date=end_date)
        for module in selected_modules
    ]
    chart = _select_chart(
        module_contexts,
        question=payload.question,
        history_text=_history_text(payload.history),
        include_visualization=payload.include_visualization,
    )

    prompt_context = {
        "filters": {
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "warnings": warnings,
        "sources": [_compact_prompt_source(context.prompt_data) for context in module_contexts],
    }

    return ReportQAContextSnapshot(
        applied_modules=selected_modules,
        warnings=warnings,
        sources=[context.source for context in module_contexts],
        prompt_context=prompt_context,
        chart=chart,
        charts_by_module={context.module: context.chart for context in module_contexts if context.chart is not None},
    )


def normalize_report_qa_dates(start_date: date | None, end_date: date | None) -> tuple[date | None, date | None]:
    if start_date and end_date and start_date > end_date:
        return end_date, start_date
    return start_date, end_date


def build_mock_report_answer(
    payload: AIReportQARequest,
    *,
    context: ReportQAContextSnapshot,
) -> AIReportAnswerResponse:
    start_date, end_date = normalize_report_qa_dates(payload.start_date, payload.end_date)
    prompt_sources = {source["module"]: source for source in context.prompt_context["sources"]}
    matched_modules = _match_modules(payload.question, context.applied_modules)
    primary_module = _infer_primary_module(payload.question, context.applied_modules)
    direct_answer = _build_direct_answer(
        payload,
        prompt_sources=prompt_sources,
        modules=context.applied_modules,
        start_date=start_date,
        end_date=end_date,
    )

    direct_chart = None
    response_sources = context.sources

    if direct_answer:
        answer = direct_answer.answer
        focus_module = direct_answer.focus_module
        direct_chart = direct_answer.chart
        response_sources = _select_response_sources(context.sources, list(direct_answer.source_modules))
    elif _is_attention_question(payload.question):
        answer, focus_module = _build_attention_answer(
            prompt_sources,
            modules=matched_modules or context.applied_modules,
            start_date=start_date,
            end_date=end_date,
        )
    elif _is_recent_question(payload.question):
        answer, focus_module = _build_recent_change_answer(
            prompt_sources,
            modules=matched_modules or context.applied_modules,
            start_date=start_date,
            end_date=end_date,
        )
    elif len(matched_modules) > 1:
        answer, focus_module = _build_overview_answer(
            prompt_sources,
            modules=matched_modules,
            start_date=start_date,
            end_date=end_date,
        )
    elif primary_module and primary_module in prompt_sources:
        answer = _build_module_answer(
            primary_module,
            prompt_sources[primary_module],
            start_date=start_date,
            end_date=end_date,
        )
        focus_module = primary_module
    else:
        answer, focus_module = _build_overview_answer(
            prompt_sources,
            modules=context.applied_modules,
            start_date=start_date,
            end_date=end_date,
        )

    warnings = [
        "Mock provider output. Replace with an OpenAI-compatible model server before production rollout.",
        *context.warnings,
    ]
    return AIReportAnswerResponse(
        task="report_qa",
        provider="mock",
        model="mock-report-qa",
        answer=answer,
        warnings=warnings,
        sources=response_sources,
        chart=direct_chart
        or _select_answer_chart(
            context,
            question=payload.question,
            history=payload.history,
            focus_module=matched_modules[0] if len(matched_modules) > 1 else focus_module,
            fallback_modules=matched_modules or context.applied_modules,
            include_visualization=payload.include_visualization,
        ),
        applied_modules=context.applied_modules,
        start_date=start_date,
        end_date=end_date,
    )


def build_grounded_report_answer(
    payload: AIReportQARequest,
    *,
    context: ReportQAContextSnapshot,
) -> AIReportAnswerResponse | None:
    start_date, end_date = normalize_report_qa_dates(payload.start_date, payload.end_date)
    prompt_sources = {source["module"]: source for source in context.prompt_context["sources"]}
    matched_modules = _match_modules(payload.question, context.applied_modules)
    direct_answer = _build_direct_answer(
        payload,
        prompt_sources=prompt_sources,
        modules=context.applied_modules,
        start_date=start_date,
        end_date=end_date,
    )
    if not direct_answer:
        return None

    answer = direct_answer.answer
    focus_module = direct_answer.focus_module
    chart_focus_module = matched_modules[0] if len(matched_modules) > 1 else focus_module
    return AIReportAnswerResponse(
        task="report_qa",
        provider="grounded",
        model="report-rules",
        answer=answer,
        warnings=context.warnings,
        sources=_select_response_sources(context.sources, list(direct_answer.source_modules)),
        chart=direct_answer.chart
        or _select_answer_chart(
            context,
            question=payload.question,
            history=payload.history,
            focus_module=chart_focus_module,
            fallback_modules=matched_modules or context.applied_modules,
            include_visualization=payload.include_visualization,
        ),
        applied_modules=context.applied_modules,
        start_date=start_date,
        end_date=end_date,
    )


def build_report_scope_confirmation_response(
    payload: AIReportQARequest,
    *,
    context: ReportQAContextSnapshot,
) -> AIReportAnswerResponse:
    start_date, end_date = normalize_report_qa_dates(payload.start_date, payload.end_date)
    confirmation_message = (
        "This goes a bit beyond the live report data on this screen. "
        "If you want, I can take a broader look and try to answer it another way."
    )
    return AIReportAnswerResponse(
        task="report_qa",
        provider="scope_guard",
        model="report-qa-guard",
        status="confirmation_required",
        answer=confirmation_message,
        warnings=context.warnings,
        confirmation=AIReportConfirmationRead(
            mode="broader_system_context",
            title="Want me to take a broader look?",
            message=(
                "I can look at the system's available features, screens, and API metadata to piece together a helpful answer. "
                "That usually takes longer and may be a little less certain than a report-based answer."
            ),
            original_question=payload.question.strip(),
            confirm_label="Yes, take a broader look",
            cancel_label="Keep it report-focused",
            estimated_wait_seconds=20,
        ),
        applied_modules=context.applied_modules,
        start_date=start_date,
        end_date=end_date,
        requires_human_review=True,
    )


def _build_overview_answer(
    prompt_sources: dict[AIReportQAModule, dict[str, Any]],
    *,
    modules: list[AIReportQAModule],
    start_date: date | None,
    end_date: date | None,
) -> tuple[str, AIReportQAModule | None]:
    available_modules = [module for module in modules if module in prompt_sources]
    if not available_modules:
        return "No approved reporting data was available for this question.", None

    lines = [f"Operational snapshot {_format_reporting_window(start_date, end_date)}:"]
    for module in available_modules[:4]:
        lines.append(f"- {_module_label(module)}: {_module_takeaway(module, prompt_sources[module])}")

    focus_module, reason = _pick_attention_module(prompt_sources, available_modules)
    if reason:
        lines.append(f"Priority: {_module_label(focus_module)}. {reason}")
    return "\n".join(lines), focus_module


def _build_module_answer(
    module: AIReportQAModule,
    prompt_source: dict[str, Any],
    *,
    start_date: date | None,
    end_date: date | None,
) -> str:
    detail = _module_takeaway(module, prompt_source)
    next_step = _module_attention_reason(module, prompt_source)
    return (
        f"{_module_label(module)} {_format_reporting_window(start_date, end_date)}: {detail}\n"
        f"Main takeaway: {next_step}"
    )


def _build_attention_answer(
    prompt_sources: dict[AIReportQAModule, dict[str, Any]],
    *,
    modules: list[AIReportQAModule],
    start_date: date | None,
    end_date: date | None,
) -> tuple[str, AIReportQAModule | None]:
    available_modules = [module for module in modules if module in prompt_sources]
    if not available_modules:
        return "No approved reporting data was available for this question.", None

    focus_module, reason = _pick_attention_module(prompt_sources, available_modules)
    if focus_module is None:
        return _build_overview_answer(prompt_sources, modules=available_modules, start_date=start_date, end_date=end_date)

    secondary_modules = [module for module in available_modules if module != focus_module][:2]
    lines = [
        f"The area needing the most attention {_format_reporting_window(start_date, end_date)} is {_module_label(focus_module)}.",
        reason,
        f"Current view: {_module_takeaway(focus_module, prompt_sources[focus_module])}",
    ]
    if secondary_modules:
        lines.append(
            "Secondary pressure points: "
            + "; ".join(f"{_module_label(module)} - {_module_attention_reason(module, prompt_sources[module])}" for module in secondary_modules)
        )
    return "\n".join(lines), focus_module


def _build_recent_change_answer(
    prompt_sources: dict[AIReportQAModule, dict[str, Any]],
    *,
    modules: list[AIReportQAModule],
    start_date: date | None,
    end_date: date | None,
) -> tuple[str, AIReportQAModule | None]:
    activity_source = prompt_sources.get("activity")
    if activity_source:
        metrics = activity_source.get("metrics") or {}
        event_count = _safe_int(metrics.get("event_count"))
        recent_events = activity_source.get("recent_events") or []
        lines = [
            f"Recent changes {_format_reporting_window(start_date, end_date)} are best reflected in the audit feed: {event_count} events were returned.",
        ]
        if recent_events:
            lines.append(
                "Latest events: "
                + "; ".join(_format_recent_event(event) for event in recent_events[:3])
            )

        focus_module, reason = _pick_attention_module(prompt_sources, [module for module in modules if module in prompt_sources and module != "activity"])
        if focus_module and reason:
            lines.append(f"Operationally, {_module_label(focus_module)} remains the strongest watch area. {reason}")
        return "\n".join(lines), "activity"

    answer, focus_module = _build_overview_answer(
        prompt_sources,
        modules=modules,
        start_date=start_date,
        end_date=end_date,
    )
    return f"{answer}\nRecent activity data was not in scope, so this is based on the current snapshot only.", focus_module


def _build_direct_answer(
    payload: AIReportQARequest,
    *,
    prompt_sources: dict[AIReportQAModule, dict[str, Any]],
    modules: list[AIReportQAModule],
    start_date: date | None,
    end_date: date | None,
) -> ReportQADirectAnswer | None:
    question = _normalize_text(payload.question)
    history_text = _history_text(payload.history)

    if _is_member_non_payer_chart_question(question):
        members_source = prompt_sources.get("members")
        if members_source:
            return _build_member_non_payer_chart_answer(members_source, start_date=start_date, end_date=end_date)

    if _is_active_payers_question(question) or (_is_correction_request(question) and _is_active_payers_question(history_text)):
        members_source = prompt_sources.get("members")
        if members_source:
            return ReportQADirectAnswer(
                answer=_build_active_payers_answer(members_source, start_date=start_date, end_date=end_date),
                focus_module="members",
                source_modules=("members",),
            )

    if _is_money_question(question):
        payments_source = prompt_sources.get("payments")
        if payments_source:
            return ReportQADirectAnswer(
                answer=_build_total_revenue_answer(payments_source, start_date=start_date, end_date=end_date),
                focus_module="payments",
                source_modules=("payments",),
            )

    if _is_sponsorship_budget_question(question, modules=modules):
        sponsorship_source = prompt_sources.get("sponsorships")
        if sponsorship_source:
            return ReportQADirectAnswer(
                answer=_build_sponsorship_budget_answer(sponsorship_source, start_date=start_date, end_date=end_date),
                focus_module="sponsorships",
                source_modules=("sponsorships",),
            )

    if _asks_for_person_name(question) and _history_mentions_top_payer(history_text):
        payments_source = prompt_sources.get("payments")
        if payments_source:
            return ReportQADirectAnswer(
                answer=_build_top_payer_answer(payments_source, start_date=start_date, end_date=end_date, name_only=True),
                focus_module="payments",
                source_modules=("payments",),
            )

    if _is_top_payer_question(question) or (_is_correction_request(question) and _history_mentions_top_payer(history_text)):
        payments_source = prompt_sources.get("payments")
        if payments_source:
            return ReportQADirectAnswer(
                answer=_build_top_payer_answer(payments_source, start_date=start_date, end_date=end_date),
                focus_module="payments",
                source_modules=("payments",),
            )

    if _is_top_categories_question(question) or (_is_clarification_request(question) and _is_top_categories_question(history_text)):
        category_module = _pick_category_module(question, history_text=history_text, prompt_sources=prompt_sources, modules=modules)
        if category_module:
            return ReportQADirectAnswer(
                answer=_build_top_categories_answer(
                    category_module,
                    prompt_sources[category_module],
                    start_date=start_date,
                    end_date=end_date,
                ),
                focus_module=category_module,
                source_modules=(category_module,),
            )

    if _is_clarification_request(question):
        return ReportQADirectAnswer(
            answer=_build_clarification_answer(
                prompt_sources,
                modules=modules,
                history_text=history_text,
                start_date=start_date,
                end_date=end_date,
            ),
            focus_module=None,
        )

    return None


def _build_active_payers_answer(
    prompt_source: dict[str, Any],
    *,
    start_date: date | None,
    end_date: date | None,
) -> str:
    metrics = prompt_source.get("metrics") or {}
    active_payers = _safe_int(metrics.get("active_payers"))
    member_label = "member" if active_payers == 1 else "members"
    return f"There {'is' if active_payers == 1 else 'are'} {active_payers} active {member_label} marked as paying contribution {_format_reporting_window(start_date, end_date)}."


def _build_total_revenue_answer(
    prompt_source: dict[str, Any],
    *,
    start_date: date | None,
    end_date: date | None,
) -> str:
    metrics = prompt_source.get("metrics") or {}
    grand_total = _safe_float(metrics.get("grand_total"))
    top_service = metrics.get("top_service")
    top_service_total = _safe_float(metrics.get("top_service_total"))

    if grand_total <= 0:
        return f"No posted revenue was recorded {_format_reporting_window(start_date, end_date)}."

    answer = f"Total recorded revenue {_format_reporting_window(start_date, end_date)} is {_format_currency(grand_total)}."
    if top_service:
        answer += f" The leading service is {top_service} at {_format_currency(top_service_total)}."
    return answer


def _build_sponsorship_budget_answer(
    prompt_source: dict[str, Any],
    *,
    start_date: date | None,
    end_date: date | None,
) -> str:
    metrics = prompt_source.get("metrics") or {}
    utilization = _safe_float(metrics.get("budget_utilization_percent"))
    budget_slots = _safe_int(metrics.get("budget_slots"))
    used_slots = _safe_int(metrics.get("used_slots"))
    available_slots = _safe_int(metrics.get("available_slots"))
    active_cases = _safe_int(metrics.get("active_cases"))

    if budget_slots > 0:
        return (
            f"In sponsorships, budget refers to case capacity rather than money {_format_reporting_window(start_date, end_date)}. "
            f"Current utilization is {_format_percent(utilization)}: {used_slots} of {budget_slots} slots are used, "
            f"{available_slots} remain available, and {active_cases} cases are active."
        )

    return (
        f"In sponsorships, budget refers to case capacity rather than money {_format_reporting_window(start_date, end_date)}. "
        f"No slot budget is configured in the current snapshot, so utilization is {_format_percent(utilization)} with {active_cases} active cases."
    )


def _build_member_non_payer_chart_answer(
    prompt_source: dict[str, Any],
    *,
    start_date: date | None,
    end_date: date | None,
) -> ReportQADirectAnswer:
    metrics = prompt_source.get("metrics") or {}
    active = _safe_int(metrics.get("active"))
    total = _safe_int(metrics.get("total"))
    total_payers = _safe_int(metrics.get("total_payers"))
    non_paying = max(total - total_payers, 0)
    active_label = "member" if active == 1 else "members"
    non_paying_label = "member" if non_paying == 1 else "members"
    chart = AIReportChartRead(
        type="bar",
        title="Active members vs non-paying members",
        description="Side-by-side comparison of active members and members not marked as paying contribution.",
        unit="count",
        data=[
            AIReportChartDatum(label="Active members", value=float(active)),
            AIReportChartDatum(label="Non-paying members", value=float(non_paying)),
        ],
    )
    answer = (
        f"Here is the comparison {_format_reporting_window(start_date, end_date)}: {active} active {active_label} versus "
        f"{non_paying} {non_paying_label} not marked as paying contribution. These counts are shown side by side and are not mutually exclusive segments."
    )
    return ReportQADirectAnswer(
        answer=answer,
        focus_module="members",
        source_modules=("members",),
        chart=chart,
    )


def _build_top_payer_answer(
    prompt_source: dict[str, Any],
    *,
    start_date: date | None,
    end_date: date | None,
    name_only: bool = False,
) -> str:
    member_rows = [row for row in prompt_source.get("member_rows") or [] if _safe_float(row.get("total_amount")) > 0]
    if not member_rows:
        return f"No member-linked payments were available {_format_reporting_window(start_date, end_date)} to identify a top payer."

    top_by_total = max(
        member_rows,
        key=lambda row: (
            _safe_float(row.get("total_amount")),
            _safe_int(row.get("transaction_count")),
            str(row.get("member_name") or ""),
        ),
    )
    top_by_transactions = max(
        member_rows,
        key=lambda row: (
            _safe_int(row.get("transaction_count")),
            _safe_float(row.get("total_amount")),
            str(row.get("member_name") or ""),
        ),
    )
    leader_name = str(top_by_total.get("member_name") or "the linked member")
    total_amount = _safe_float(top_by_total.get("total_amount"))
    transaction_count = _safe_int(top_by_total.get("transaction_count"))
    transaction_label = "transaction" if transaction_count == 1 else "transactions"

    if name_only:
        return f"It is {leader_name}, with {_format_currency(total_amount)} across {transaction_count} {transaction_label} {_format_reporting_window(start_date, end_date)}."

    if top_by_total.get("member_name") == top_by_transactions.get("member_name"):
        return (
            f"{leader_name} is the leading recorded payer {_format_reporting_window(start_date, end_date)} "
            f"with {_format_currency(total_amount)} across {transaction_count} {transaction_label}."
        )

    transaction_leader_name = str(top_by_transactions.get("member_name") or "another linked member")
    transaction_leader_count = _safe_int(top_by_transactions.get("transaction_count"))
    total_leader_label = "transaction" if transaction_leader_count == 1 else "transactions"
    return (
        f"By total amount, {leader_name} leads {_format_reporting_window(start_date, end_date)} with {_format_currency(total_amount)}. "
        f"By transaction count, {transaction_leader_name} leads with {transaction_leader_count} {total_leader_label}."
    )


def _build_top_categories_answer(
    module: AIReportQAModule,
    prompt_source: dict[str, Any],
    *,
    start_date: date | None,
    end_date: date | None,
) -> str:
    if module == "payments":
        rows = sorted(
            [row for row in prompt_source.get("rows") or [] if _safe_float(row.get("total_amount")) > 0],
            key=lambda row: _safe_float(row.get("total_amount")),
            reverse=True,
        )
        if not rows:
            return f"There are no payment categories with posted revenue {_format_reporting_window(start_date, end_date)}."
        top_rows = rows[:3]
        formatted = ", ".join(
            f"{row.get('service_type_label') or 'Unknown'} ({_format_currency(_safe_float(row.get('total_amount')))})"
            for row in top_rows
        )
        return f"The top payment categories {_format_reporting_window(start_date, end_date)} are {formatted}."

    if module == "activity":
        category_counts = prompt_source.get("metrics", {}).get("category_counts") or {}
        ranked = sorted(category_counts.items(), key=lambda item: item[1], reverse=True)
        ranked = [(label, count) for label, count in ranked if _safe_int(count) > 0][:3]
        if not ranked:
            return f"There is no recent activity to rank by category {_format_reporting_window(start_date, end_date)}."
        formatted = ", ".join(f"{label} ({_safe_int(count)})" for label, count in ranked)
        return f"The busiest activity categories {_format_reporting_window(start_date, end_date)} are {formatted}."

    if module == "schools":
        metrics = prompt_source.get("metrics") or {}
        ranked = sorted(
            [
                ("Child", _safe_int(metrics.get("count_child"))),
                ("Youth", _safe_int(metrics.get("count_youth"))),
                ("Adult", _safe_int(metrics.get("count_adult"))),
            ],
            key=lambda item: item[1],
            reverse=True,
        )
        ranked = [(label, count) for label, count in ranked if count > 0][:3]
        if not ranked:
            return f"There are no school participant categories with activity {_format_reporting_window(start_date, end_date)}."
        formatted = ", ".join(f"{label} ({count})" for label, count in ranked)
        return f"The largest school participant categories {_format_reporting_window(start_date, end_date)} are {formatted}."

    if module == "members":
        metrics = prompt_source.get("metrics") or {}
        ranked = sorted(
            [
                ("Pending", _safe_int(metrics.get("pending"))),
                ("Inactive", _safe_int(metrics.get("inactive"))),
                ("Active", _safe_int(metrics.get("active"))),
                ("Archived", _safe_int(metrics.get("archived"))),
            ],
            key=lambda item: item[1],
            reverse=True,
        )
        ranked = [(label, count) for label, count in ranked if count > 0][:3]
        if not ranked:
            return f"There are no member status categories to rank {_format_reporting_window(start_date, end_date)}."
        formatted = ", ".join(f"{label} ({count})" for label, count in ranked)
        return f"The largest member status categories {_format_reporting_window(start_date, end_date)} are {formatted}."

    return _build_module_answer(module, prompt_source, start_date=start_date, end_date=end_date)


def _build_clarification_answer(
    prompt_sources: dict[AIReportQAModule, dict[str, Any]],
    *,
    modules: list[AIReportQAModule],
    history_text: str,
    start_date: date | None,
    end_date: date | None,
) -> str:
    if _is_top_categories_question(history_text):
        category_module = _pick_category_module("", history_text=history_text, prompt_sources=prompt_sources, modules=modules)
        if category_module:
            return _build_top_categories_answer(
                category_module,
                prompt_sources[category_module],
                start_date=start_date,
                end_date=end_date,
            )

    if _is_active_payers_question(history_text):
        members_source = prompt_sources.get("members")
        if members_source:
            return _build_active_payers_answer(members_source, start_date=start_date, end_date=end_date)

    suggestions = []
    if "payments" in prompt_sources:
        suggestions.append("top payment categories")
    if "members" in prompt_sources:
        suggestions.append("active payers")
    if "activity" in prompt_sources:
        suggestions.append("recent activity")

    if suggestions:
        return "I need a little more direction. Try asking about " + ", ".join(suggestions[:3]) + "."
    return "I need a little more direction before I can answer that."


def _module_takeaway(module: AIReportQAModule, prompt_source: dict[str, Any]) -> str:
    metrics = prompt_source.get("metrics") or {}

    if module == "members":
        total = _safe_int(metrics.get("total"))
        active = _safe_int(metrics.get("active"))
        active_rate = _safe_float(metrics.get("active_rate_percent"))
        missing_phone = _safe_int(metrics.get("missing_phone"))
        new_this_month = _safe_int(metrics.get("new_this_month"))
        detail = f"{active} active out of {total} total members ({active_rate:.1f}% active rate)"
        if missing_phone:
            detail += f", with {missing_phone} profiles still missing phone numbers"
        if new_this_month:
            detail += f"; {new_this_month} were added this month"
        return detail + "."

    if module == "payments":
        grand_total = _safe_float(metrics.get("grand_total"))
        service_count = _safe_int(metrics.get("service_count"))
        top_service = prompt_source.get("metrics", {}).get("top_service")
        top_service_total = _safe_float(metrics.get("top_service_total"))
        if grand_total <= 0:
            return "No posted revenue was recorded in the selected period."
        detail = f"Revenue totals {_format_currency(grand_total)} across {service_count} service categories"
        if top_service:
            detail += f", led by {top_service} at {_format_currency(top_service_total)}"
        return detail + "."

    if module == "sponsorships":
        active_cases = _safe_int(metrics.get("active_cases"))
        submitted_cases = _safe_int(metrics.get("submitted_cases"))
        suspended_cases = _safe_int(metrics.get("suspended_cases"))
        utilization = _safe_float(metrics.get("budget_utilization_percent"))
        available_slots = _safe_int(metrics.get("available_slots"))
        alerts = [str(item) for item in metrics.get("alerts") or [] if str(item).strip()]
        detail = (
            f"{active_cases} active cases, {submitted_cases} submitted, {suspended_cases} suspended, "
            f"and {utilization:.1f}% of capacity used"
        )
        if available_slots or utilization:
            detail += f", leaving {available_slots} open slots"
        if alerts:
            detail += f". Alerts: {'; '.join(alerts[:2])}"
        return detail + "."

    if module == "newcomers":
        open_cases = _safe_int(metrics.get("open_cases"))
        overdue = _safe_int(metrics.get("followups_overdue"))
        unassigned = _safe_int(metrics.get("unassigned_cases"))
        settled = _safe_int(metrics.get("settled_cases"))
        stale = _safe_int(metrics.get("stale_cases"))
        active_support_cases = _safe_int(metrics.get("active_support_cases"))
        return (
            f"Newcomer workflow has {open_cases} open cases, {overdue} overdue follow-ups, "
            f"{unassigned} unassigned cases, {settled} settled, and {stale} stale cases. "
            f"{active_support_cases} linked support cases are currently active."
        )

    if module == "schools":
        total_participants = _safe_int(metrics.get("total_participants"))
        contribution_rate = _safe_float(metrics.get("contribution_rate_percent"))
        pending_content = _safe_int(metrics.get("pending_content"))
        revenue = _safe_float(metrics.get("revenue"))
        return (
            f"Schools are supporting {total_participants} participants with a {contribution_rate:.1f}% contribution rate, "
            f"{pending_content} pending content items, and {_format_currency(revenue)} in recent revenue."
        )

    if module == "activity":
        event_count = _safe_int(metrics.get("event_count"))
        recent_events = prompt_source.get("recent_events") or []
        if not recent_events:
            return f"{event_count} recent audit events were returned."
        return f"{event_count} recent audit events were returned; latest activity was {_format_recent_event(recent_events[0])}."

    return str(prompt_source.get("headline") or prompt_source.get("summary") or "No current insight was available.")


def _pick_attention_module(
    prompt_sources: dict[AIReportQAModule, dict[str, Any]],
    modules: list[AIReportQAModule],
) -> tuple[AIReportQAModule | None, str]:
    best_module: AIReportQAModule | None = None
    best_score = -1.0
    best_reason = ""

    for module in modules:
        prompt_source = prompt_sources.get(module)
        if not prompt_source:
            continue
        score, reason = _attention_score(module, prompt_source)
        if score > best_score:
            best_module = module
            best_score = score
            best_reason = reason

    return best_module, best_reason


def _attention_score(module: AIReportQAModule, prompt_source: dict[str, Any]) -> tuple[float, str]:
    metrics = prompt_source.get("metrics") or {}

    if module == "members":
        pending = _safe_int(metrics.get("pending"))
        missing_phone = _safe_int(metrics.get("missing_phone"))
        inactive = _safe_int(metrics.get("inactive"))
        active_rate = _safe_float(metrics.get("active_rate_percent"))
        score = pending * 4 + missing_phone * 2 + inactive + max(0.0, 85.0 - active_rate)
        return score, f"Roster quality needs follow-through: {pending} pending profiles and {missing_phone} missing phone numbers are still open."

    if module == "payments":
        grand_total = _safe_float(metrics.get("grand_total"))
        top_service_total = _safe_float(metrics.get("top_service_total"))
        top_service = metrics.get("top_service") or "the leading service"
        concentration = (top_service_total / grand_total * 100) if grand_total > 0 else 0.0
        score = (40.0 if grand_total <= 0 else 0.0) + max(0.0, concentration - 55.0) / 2
        if grand_total <= 0:
            return score, "No posted revenue was recorded in the selected period, so finance visibility needs attention first."
        return score, f"Revenue is concentrated in {top_service} at {concentration:.1f}% of total, which is worth monitoring."

    if module == "sponsorships":
        submitted_cases = _safe_int(metrics.get("submitted_cases"))
        suspended_cases = _safe_int(metrics.get("suspended_cases"))
        utilization = _safe_float(metrics.get("budget_utilization_percent"))
        alerts = [str(item) for item in metrics.get("alerts") or [] if str(item).strip()]
        score = max(0.0, utilization - 70.0) + submitted_cases * 3 + suspended_cases * 4 + len(alerts) * 8
        alert_text = f" Alerts: {'; '.join(alerts[:2])}." if alerts else ""
        return score, (
            f"Program load is elevated: {submitted_cases} submitted and {suspended_cases} suspended cases sit alongside {utilization:.1f}% capacity usage."
            f"{alert_text}"
        )

    if module == "newcomers":
        overdue = _safe_int(metrics.get("followups_overdue"))
        unassigned = _safe_int(metrics.get("unassigned_cases"))
        stale = _safe_int(metrics.get("stale_cases"))
        due_next = _safe_int(metrics.get("followups_due_next_7_days"))
        interpreter_required = _safe_int(metrics.get("interpreter_required_cases"))
        score = overdue * 6 + unassigned * 5 + stale * 4 + due_next * 2 + interpreter_required
        return score, (
            f"Case coordination needs attention: {overdue} follow-ups are overdue, {unassigned} cases still have no owner, and {stale} cases have gone quiet."
        )

    if module == "schools":
        pending_content = _safe_int(metrics.get("pending_content"))
        contribution_rate = _safe_float(metrics.get("contribution_rate_percent"))
        score = pending_content * 3 + max(0.0, 70.0 - contribution_rate)
        return score, f"School operations need cleanup around {pending_content} pending content items and a {contribution_rate:.1f}% contribution rate."

    if module == "activity":
        event_count = _safe_int(metrics.get("event_count"))
        category_counts = metrics.get("category_counts") or {}
        dominant_category = max(category_counts.items(), key=lambda item: item[1], default=("activity", 0))[0]
        return float(event_count), f"Recent operational churn is elevated in {dominant_category} activity with {event_count} logged events."

    return 0.0, str(prompt_source.get("summary") or "No significant attention signal was identified.")


def _module_attention_reason(module: AIReportQAModule, prompt_source: dict[str, Any]) -> str:
    return _attention_score(module, prompt_source)[1]


def _pick_mock_chart(
    context: ReportQAContextSnapshot,
    *,
    focus_module: AIReportQAModule | None,
    fallback_modules: list[AIReportQAModule],
) -> AIReportChartRead | None:
    if focus_module and focus_module in context.charts_by_module:
        return context.charts_by_module[focus_module]
    for module in fallback_modules:
        if module in context.charts_by_module:
            return context.charts_by_module[module]
    return context.chart


def _select_response_sources(
    sources: list[AIReportSourceRead],
    modules: list[AIReportQAModule],
) -> list[AIReportSourceRead]:
    if not modules:
        return sources
    module_set = set(modules)
    filtered = [source for source in sources if source.module in module_set]
    return filtered or sources


def _select_answer_chart(
    context: ReportQAContextSnapshot,
    *,
    question: str,
    history: list[Any],
    focus_module: AIReportQAModule | None,
    fallback_modules: list[AIReportQAModule],
    include_visualization: bool,
) -> AIReportChartRead | None:
    if not include_visualization:
        return None

    if not _question_warrants_chart(question, history_text=_history_text(history), modules=context.applied_modules):
        return None

    return _pick_mock_chart(context, focus_module=focus_module, fallback_modules=fallback_modules)


def _match_modules(question: str, modules: list[AIReportQAModule]) -> list[AIReportQAModule]:
    lowered = question.lower()
    return [module for module in modules if any(keyword in lowered for keyword in MODULE_KEYWORDS[module])]


def _normalize_text(value: str) -> str:
    return " ".join(value.lower().split())


def _history_text(history: list[Any]) -> str:
    return " ".join(str(getattr(message, "content", "") or "").strip().lower() for message in history if getattr(message, "content", ""))


def _is_clarification_request(question: str) -> bool:
    return question in {"?", "??", "what?", "what"} or question.startswith("clarify")


def _is_correction_request(question: str) -> bool:
    return any(hint in question for hint in CORRECTION_HINTS)


def _is_top_categories_question(question: str) -> bool:
    return any(hint in question for hint in TOP_HINTS) and any(hint in question for hint in CATEGORY_HINTS)


def _is_active_payers_question(question: str) -> bool:
    return (
        "active" in question
        and any(hint in question for hint in PAYER_HINTS)
        and not any(hint in question for hint in NON_PAYER_HINTS)
    )


def _is_money_question(question: str) -> bool:
    return any(hint in question for hint in MONEY_HINTS)


def _is_sponsorship_budget_question(question: str, *, modules: list[AIReportQAModule]) -> bool:
    if not any(hint in question for hint in SPONSORSHIP_BUDGET_HINTS):
        return False
    if "sponsorship" in question or "sponsor" in question:
        return True
    return len(modules) == 1 and modules[0] == "sponsorships"


def _is_top_payer_question(question: str) -> bool:
    return any(hint in question for hint in TOP_PAYER_HINTS) or (
        "member" in question and "transaction" in question and any(hint in question for hint in PAYER_HINTS)
    )


def _asks_for_person_name(question: str) -> bool:
    return any(hint in question for hint in NAME_FOLLOW_UP_HINTS)


def _history_mentions_top_payer(history_text: str) -> bool:
    return any(hint in history_text for hint in TOP_PAYER_HINTS) or "leading recorded payer" in history_text


def _is_member_non_payer_chart_question(question: str) -> bool:
    has_compare = any(hint in question for hint in VISUAL_EXPLICIT_HINTS + VISUAL_COMPARISON_HINTS)
    return "active" in question and any(hint in question for hint in NON_PAYER_HINTS) and has_compare


def _is_explicit_no_chart_request(question: str) -> bool:
    return any(hint in question for hint in NO_CHART_HINTS)


def _question_uses_followup_context(question: str) -> bool:
    return _is_clarification_request(question) or any(question.startswith(prefix) for prefix in FOLLOW_UP_PREFIX_HINTS)


def _requires_broader_system_context(
    question: str,
    *,
    modules: list[AIReportQAModule],
    history: list[Any] | None = None,
) -> bool:
    question_text = _normalize_text(question)
    history_text = _history_text(history or [])
    if not question_text:
        return False

    if _looks_like_system_workflow_question(question_text, history_text=history_text):
        return True

    if _match_modules(question_text, modules):
        return False

    if any(hint in question_text for hint in SYSTEM_SCOPE_HINTS):
        return not any(hint in question_text for hint in REPORT_SCOPE_HINTS)

    return False


def _looks_like_system_workflow_question(question: str, *, history_text: str = "") -> bool:
    asks_for_explanation = any(hint in question for hint in SYSTEM_EXPLANATION_HINTS)
    asks_about_automation = any(hint in question for hint in SYSTEM_AUTOMATION_HINTS)
    mentions_entities = any(hint in question for hint in SYSTEM_ENTITY_HINTS)
    mentions_system_surface = "system" in question or "module" in question or "screen" in question or "page" in question

    if any(question.startswith(prefix) for prefix in SYSTEM_ACTION_PREFIX_HINTS):
        return True

    if asks_about_automation and (mentions_entities or mentions_system_surface):
        return True

    if asks_for_explanation and (mentions_entities or mentions_system_surface):
        return True

    if (mentions_system_surface or asks_for_explanation) and _history_looks_like_system_question(history_text):
        return True

    if ("not in" in question or "wrong module" in question) and _history_looks_like_system_question(history_text):
        return True

    if _is_clarification_request(question) and _history_looks_like_system_question(history_text):
        return True

    return False


def _history_looks_like_system_question(history_text: str) -> bool:
    if not history_text:
        return False

    return any(
        hint in history_text
        for hint in (
            *SYSTEM_SCOPE_HINTS,
            *SYSTEM_ACTION_PREFIX_HINTS,
            *SYSTEM_EXPLANATION_HINTS,
            *SYSTEM_AUTOMATION_HINTS,
        )
    )


def _question_warrants_chart(
    question: str,
    *,
    history_text: str = "",
    modules: list[AIReportQAModule] | None = None,
) -> bool:
    question_text = _normalize_text(question)
    combined_text = (
        _normalize_text(f"{question} {history_text}".strip())
        if _question_uses_followup_context(question_text)
        else question_text
    )
    available_modules = modules or []

    if not combined_text:
        return False

    if _is_explicit_no_chart_request(question_text):
        return False

    if _is_active_payers_question(question_text):
        return False

    if any(question_text.startswith(prefix) for prefix in ("how many", "how much", "count", "total")) and not any(
        hint in combined_text for hint in VISUAL_EXPLICIT_HINTS
    ):
        return False

    if any(hint in combined_text for hint in VISUAL_EXPLICIT_HINTS):
        return True

    if _is_top_categories_question(combined_text):
        return True

    if any(hint in combined_text for hint in VISUAL_COMPARISON_HINTS):
        return True

    if "status" in combined_text and any(module in {"members", "newcomers", "sponsorships"} for module in available_modules):
        return True

    if any(hint in combined_text for hint in TOP_HINTS) and any(
        hint in combined_text for hint in ("service", "services", "revenue", "payment category", "payment categories", "service category", "service categories")
    ):
        return True

    return False


def _pick_category_module(
    question: str,
    *,
    history_text: str,
    prompt_sources: dict[AIReportQAModule, dict[str, Any]],
    modules: list[AIReportQAModule],
) -> AIReportQAModule | None:
    explicit_modules = _match_modules(question, modules)
    for module in explicit_modules:
        if module in {"payments", "activity", "schools", "members"} and module in prompt_sources:
            return module

    combined = f"{question} {history_text}".strip()
    if any(keyword in combined for keyword in ("payment", "payments", "revenue", "service categories", "donation", "contribution")):
        return "payments" if "payments" in prompt_sources else None
    if any(keyword in combined for keyword in ("recent activity", "audit", "activity by category", "timeline")):
        return "activity" if "activity" in prompt_sources else None
    if any(keyword in combined for keyword in ("school", "schools", "participant", "student")):
        return "schools" if "schools" in prompt_sources else None
    if any(keyword in combined for keyword in ("member", "members", "status distribution", "roster")):
        return "members" if "members" in prompt_sources else None

    for module in ("payments", "activity", "schools", "members"):
        if module in prompt_sources:
            return module  # type: ignore[return-value]
    return None


def _is_attention_question(question: str) -> bool:
    lowered = question.lower()
    return any(hint in lowered for hint in ATTENTION_HINTS)


def _is_recent_question(question: str) -> bool:
    lowered = question.lower()
    return any(hint in lowered for hint in RECENT_HINTS)


def _member_display_name_from_parts(first_name: Any, last_name: Any, username: Any = None) -> str:
    name = " ".join(str(part).strip() for part in [first_name, last_name] if part and str(part).strip())
    if name:
        return name
    if username and str(username).strip():
        return str(username).strip()
    return "Linked member"


def _format_recent_event(event: dict[str, Any]) -> str:
    action = str(event.get("action") or "activity").replace("_", " ").lower()
    target = str(event.get("target") or event.get("detail") or event.get("category") or "system record").strip()
    return f"{action} on {target}"


def _format_reporting_window(start_date: date | None, end_date: date | None) -> str:
    if start_date and end_date:
        return f"for {start_date.strftime('%b %d, %Y')} to {end_date.strftime('%b %d, %Y')}"
    if start_date:
        return f"from {start_date.strftime('%b %d, %Y')} onward"
    if end_date:
        return f"through {end_date.strftime('%b %d, %Y')}"
    return "for the current snapshot"


def _safe_int(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, Decimal):
        return int(value)
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return 0


def _safe_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return 0.0


def _can_read_module(user: User, module: AIReportQAModule) -> bool:
    if module == "activity":
        return has_field_permission(user, "reports", "overview", "read")
    return has_field_permission(user, "reports", module, "read") and has_module_permission(user, module, "read")


def _module_label(module: AIReportQAModule) -> str:
    return {
        "members": "Members",
        "payments": "Payments",
        "sponsorships": "Sponsorships",
        "newcomers": "Newcomers",
        "schools": "Schools",
        "activity": "Recent activity",
    }[module]


def _compact_prompt_source(prompt_data: dict[str, Any]) -> dict[str, Any]:
    compact = {
        "id": prompt_data.get("id"),
        "module": prompt_data.get("module"),
        "summary": prompt_data.get("summary"),
        "metrics": prompt_data.get("metrics") or {},
    }

    rows = prompt_data.get("rows") or []
    if rows:
        compact["rows"] = [
            {
                "service_type_label": row.get("service_type_label"),
                "total_amount": row.get("total_amount"),
            }
            for row in rows[:3]
        ]

    member_rows = prompt_data.get("member_rows") or []
    if member_rows:
        compact["member_rows"] = [
            {
                "member_name": row.get("member_name"),
                "total_amount": row.get("total_amount"),
                "transaction_count": row.get("transaction_count"),
            }
            for row in member_rows[:3]
        ]

    recent_events = prompt_data.get("recent_events") or []
    if recent_events:
        compact["recent_events"] = [
            {
                "category": event.get("category"),
                "action": event.get("action"),
                "target": event.get("target"),
            }
            for event in recent_events[:3]
        ]

    return compact


def _build_module_context(
    db: Session,
    *,
    module: AIReportQAModule,
    start_date: date | None,
    end_date: date | None,
) -> ReportQAModuleContext:
    builders = {
        "members": _build_members_context,
        "payments": _build_payments_context,
        "sponsorships": _build_sponsorships_context,
        "newcomers": _build_newcomers_context,
        "schools": _build_schools_context,
        "activity": _build_activity_context,
    }
    return builders[module](db, start_date=start_date, end_date=end_date)


def _build_members_context(
    db: Session,
    *,
    start_date: date | None,
    end_date: date | None,
) -> ReportQAModuleContext:
    total = _count_members(db, start_date=start_date, end_date=end_date)
    active = _count_members(db, status_filter="Active", start_date=start_date, end_date=end_date)
    inactive = _count_members(db, status_filter="Inactive", start_date=start_date, end_date=end_date)
    pending = _count_members(db, status_filter="Pending", start_date=start_date, end_date=end_date)
    archived = _count_members(db, status_filter="Archived", start_date=start_date, end_date=end_date)
    missing_phone = _count_members(db, missing_phone=True, start_date=start_date, end_date=end_date)
    has_children = _count_members(db, has_children=True, start_date=start_date, end_date=end_date)
    total_payers = _count_members(db, pays_contribution=True, start_date=start_date, end_date=end_date)
    active_payers = _count_members(db, status_filter="Active", pays_contribution=True, start_date=start_date, end_date=end_date)
    new_this_month = 0 if start_date or end_date else _count_members(db, new_this_month=True)
    active_rate = round((active / total) * 100, 1) if total else 0.0

    summary = (
        "Member roster snapshot is empty for the selected filters."
        if total == 0 and archived == 0
        else (
            f"Member roster shows {active} active of {total} non-archived records, "
            f"with {missing_phone} missing phone numbers."
        )
    )
    metrics = [
        AIReportSourceMetric(label="Total members", value=_format_count(total)),
        AIReportSourceMetric(label="Active members", value=_format_count(active)),
        AIReportSourceMetric(label="Active rate", value=_format_percent(active_rate)),
        AIReportSourceMetric(label="Missing phones", value=_format_count(missing_phone)),
        AIReportSourceMetric(label="Active payers", value=_format_count(active_payers)),
        AIReportSourceMetric(label="Members with children", value=_format_count(has_children)),
    ]
    if not (start_date or end_date):
        metrics.append(AIReportSourceMetric(label="New this month", value=_format_count(new_this_month)))
    metrics.append(AIReportSourceMetric(label="Archived records", value=_format_count(archived)))

    chart = AIReportChartRead(
        type="bar",
        title="Member status distribution",
        description="Current distribution across member statuses.",
        unit="count",
        data=[
            AIReportChartDatum(label="Active", value=float(active)),
            AIReportChartDatum(label="Inactive", value=float(inactive)),
            AIReportChartDatum(label="Pending", value=float(pending)),
            AIReportChartDatum(label="Archived", value=float(archived)),
        ],
    )
    headline = (
        "No member records matched the selected filters."
        if total == 0 and archived == 0
        else f"Members currently total {total}, with {active} active and {missing_phone} profiles missing phone numbers."
    )
    return ReportQAModuleContext(
        module="members",
        source=AIReportSourceRead(
            id="members_overview",
            module="members",
            title="Member roster metrics",
            summary=summary,
            metrics=metrics,
        ),
        prompt_data={
            "id": "members_overview",
            "module": "members",
            "headline": headline,
            "summary": summary,
            "metrics": {
                "total": total,
                "active": active,
                "inactive": inactive,
                "pending": pending,
                "archived": archived,
                "missing_phone": missing_phone,
                "total_payers": total_payers,
                "active_payers": active_payers,
                "has_children": has_children,
                "new_this_month": new_this_month,
                "active_rate_percent": active_rate,
            },
        },
        chart=chart,
    )


def _summarize_member_payments(
    db: Session,
    *,
    start_date: date | None,
    end_date: date | None,
) -> list[dict[str, Any]]:
    query = (
        db.query(
            Payment.member_id.label("member_id"),
            Member.first_name.label("first_name"),
            Member.last_name.label("last_name"),
            Member.username.label("username"),
            func.sum(Payment.amount).label("total_amount"),
            func.count(Payment.id).label("transaction_count"),
            func.min(Payment.currency).label("currency"),
        )
        .join(Member, Payment.member_id == Member.id)
        .filter(Payment.member_id.isnot(None))
        .group_by(Payment.member_id, Member.first_name, Member.last_name, Member.username)
    )
    if start_date:
        query = query.filter(Payment.posted_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        query = query.filter(Payment.posted_at <= datetime.combine(end_date, datetime.max.time()))

    rows = query.all()
    items = [
        {
            "member_id": row.member_id,
            "member_name": _member_display_name_from_parts(row.first_name, row.last_name, row.username),
            "total_amount": _decimal_to_float(row.total_amount),
            "transaction_count": _safe_int(row.transaction_count),
            "currency": row.currency or "CAD",
        }
        for row in rows
        if row.member_id is not None
    ]
    items.sort(
        key=lambda row: (
            _safe_float(row.get("total_amount")),
            _safe_int(row.get("transaction_count")),
            str(row.get("member_name") or ""),
        ),
        reverse=True,
    )
    return items


def _build_payments_context(
    db: Session,
    *,
    start_date: date | None,
    end_date: date | None,
) -> ReportQAModuleContext:
    summary = payment_service.summarize_payments(db, start_date=start_date, end_date=end_date)
    member_rows = _summarize_member_payments(db, start_date=start_date, end_date=end_date)
    sorted_items = sorted(summary.items, key=lambda item: item.total_amount, reverse=True)
    top_item = sorted_items[0] if sorted_items else None
    top_member = member_rows[0] if member_rows else None
    service_count = len(sorted_items)
    chart = None
    if sorted_items:
        chart = AIReportChartRead(
            type="bar",
            title="Revenue by service type",
            description="Posted revenue grouped by service category.",
            unit="currency",
            data=[
                AIReportChartDatum(label=item.service_type_label, value=_decimal_to_float(item.total_amount))
                for item in sorted_items[:6]
            ],
        )

    summary_text = (
        "No posted payments were found for the selected period."
        if not sorted_items
        else (
            f"Posted revenue totals {_format_currency(summary.grand_total)} across {service_count} service categories, "
            f"led by {top_item.service_type_label} at {_format_currency(top_item.total_amount)}."
        )
    )
    metrics = [
        AIReportSourceMetric(label="Total revenue", value=_format_currency(summary.grand_total)),
        AIReportSourceMetric(label="Service categories", value=_format_count(service_count)),
    ]
    if top_item:
        metrics.append(AIReportSourceMetric(label="Top service", value=top_item.service_type_label))
        metrics.append(AIReportSourceMetric(label="Top service revenue", value=_format_currency(top_item.total_amount)))
    if top_member:
        metrics.append(AIReportSourceMetric(label="Top payer", value=str(top_member.get("member_name") or "Linked member")))
        metrics.append(
            AIReportSourceMetric(
                label="Top payer total",
                value=_format_currency(_safe_float(top_member.get("total_amount"))),
            )
        )
        metrics.append(
            AIReportSourceMetric(
                label="Top payer transactions",
                value=_format_count(_safe_int(top_member.get("transaction_count"))),
            )
        )

    return ReportQAModuleContext(
        module="payments",
        source=AIReportSourceRead(
            id="payments_summary",
            module="payments",
            title="Payment revenue summary",
            summary=summary_text,
            metrics=metrics,
        ),
        prompt_data={
            "id": "payments_summary",
            "module": "payments",
            "headline": (
                "No posted payments were found for the selected period."
                if not sorted_items
                else f"Payments total {_format_currency(summary.grand_total)}, with {top_item.service_type_label} leading revenue."
            ),
            "summary": summary_text,
            "metrics": {
                "grand_total": _decimal_to_float(summary.grand_total),
                "service_count": service_count,
                "top_service": top_item.service_type_label if top_item else None,
                "top_service_total": _decimal_to_float(top_item.total_amount) if top_item else 0.0,
                "top_member_name": top_member.get("member_name") if top_member else None,
                "top_member_total": _safe_float(top_member.get("total_amount")) if top_member else 0.0,
                "top_member_transactions": _safe_int(top_member.get("transaction_count")) if top_member else 0,
            },
            "rows": [
                {
                    "service_type_code": item.service_type_code,
                    "service_type_label": item.service_type_label,
                    "total_amount": _decimal_to_float(item.total_amount),
                    "currency": item.currency,
                }
                for item in sorted_items
            ],
            "member_rows": member_rows,
        },
        chart=chart,
    )


def _build_sponsorships_context(
    db: Session,
    *,
    start_date: date | None,
    end_date: date | None,
) -> ReportQAModuleContext:
    metrics = sponsorship_service.get_sponsorship_metrics(db, start_date=start_date, end_date=end_date)
    budget = metrics.get("current_budget") or {}
    total_slots = int(budget.get("total_slots", 0) or 0)
    used_slots = int(budget.get("used_slots", 0) or 0)
    available_slots = max(0, int(budget.get("total_slots", 0) or 0) - int(budget.get("used_slots", 0) or 0))
    chart = AIReportChartRead(
        type="bar",
        title="Sponsorship pipeline",
        description="Current case volume and completed cases for the selected period.",
        unit="count",
        data=[
            AIReportChartDatum(label="Active", value=float(metrics["active_cases"])),
            AIReportChartDatum(label="Submitted", value=float(metrics["submitted_cases"])),
            AIReportChartDatum(label="Suspended", value=float(metrics["suspended_cases"])),
            AIReportChartDatum(label="Completed", value=float(metrics["month_executed"])),
        ],
    )
    summary = (
        f"Sponsorships show {metrics['active_cases']} active cases, {metrics['submitted_cases']} submitted, "
        f"and {metrics['budget_utilization_percent']}% budget utilization."
    )
    source_metrics = [
        AIReportSourceMetric(label="Active cases", value=_format_count(metrics["active_cases"])),
        AIReportSourceMetric(label="Submitted cases", value=_format_count(metrics["submitted_cases"])),
        AIReportSourceMetric(label="Suspended cases", value=_format_count(metrics["suspended_cases"])),
        AIReportSourceMetric(label="Completed in period", value=_format_count(metrics["month_executed"])),
        AIReportSourceMetric(
            label="Budget utilization",
            value=_format_percent(float(metrics["budget_utilization_percent"])),
        ),
    ]
    if budget:
        source_metrics.append(AIReportSourceMetric(label="Budget slots", value=_format_count(total_slots)))
        source_metrics.append(AIReportSourceMetric(label="Used slots", value=_format_count(used_slots)))
        source_metrics.append(AIReportSourceMetric(label="Available slots", value=_format_count(available_slots)))

    return ReportQAModuleContext(
        module="sponsorships",
        source=AIReportSourceRead(
            id="sponsorships_overview",
            module="sponsorships",
            title="Sponsorship program metrics",
            summary=summary,
            metrics=source_metrics,
        ),
        prompt_data={
            "id": "sponsorships_overview",
            "module": "sponsorships",
            "headline": (
                f"Sponsorships currently have {metrics['active_cases']} active cases, with "
                f"{metrics['submitted_cases']} awaiting approval and {metrics['budget_utilization_percent']}% capacity used."
            ),
            "summary": summary,
            "metrics": {
                "active_cases": metrics["active_cases"],
                "submitted_cases": metrics["submitted_cases"],
                "suspended_cases": metrics["suspended_cases"],
                "completed_in_period": metrics["month_executed"],
                "budget_utilization_percent": float(metrics["budget_utilization_percent"]),
                "budget_slots": total_slots,
                "used_slots": used_slots,
                "available_slots": available_slots,
                "alerts": list(metrics.get("alerts") or []),
            },
        },
        chart=chart,
    )


def _build_newcomers_context(
    db: Session,
    *,
    start_date: date | None,
    end_date: date | None,
) -> ReportQAModuleContext:
    report = reporting_service.get_newcomer_report(db, start_date=start_date, end_date=end_date)
    summary_metrics = report.summary
    total = summary_metrics.total_cases
    dominant_status = max(
        report.status_breakdown,
        key=lambda item: item.value,
        default=AIReportChartDatum(label="New", value=0),
    )
    summary = (
        "No newcomer records matched the selected filters."
        if total == 0
        else (
            f"Newcomer operations have {summary_metrics.open_cases} open cases, "
            f"{summary_metrics.followups_overdue} overdue follow-ups, and {summary_metrics.unassigned_cases} unassigned cases."
        )
    )
    chart = AIReportChartRead(
        type="bar",
        title="Newcomer pipeline",
        description="Current newcomer status mix for the selected period.",
        unit="count",
        data=[
            AIReportChartDatum(label=item.label, value=float(item.value))
            for item in report.status_breakdown
        ],
    )

    return ReportQAModuleContext(
        module="newcomers",
        source=AIReportSourceRead(
            id="newcomers_overview",
            module="newcomers",
            title="Newcomer pipeline and follow-up metrics",
            summary=summary,
            metrics=[
                AIReportSourceMetric(label="Open cases", value=_format_count(summary_metrics.open_cases)),
                AIReportSourceMetric(label="Overdue follow-ups", value=_format_count(summary_metrics.followups_overdue)),
                AIReportSourceMetric(label="Unassigned", value=_format_count(summary_metrics.unassigned_cases)),
                AIReportSourceMetric(label="Stale cases", value=_format_count(summary_metrics.stale_cases)),
                AIReportSourceMetric(label="Settled", value=_format_count(summary_metrics.settled_cases)),
                AIReportSourceMetric(label="Interpreter required", value=_format_count(summary_metrics.interpreter_required_cases)),
                AIReportSourceMetric(label="Interactions (30d)", value=_format_count(summary_metrics.interactions_last_30_days)),
                AIReportSourceMetric(label="Active support cases", value=_format_count(summary_metrics.active_support_cases)),
            ],
        ),
        prompt_data={
            "id": "newcomers_overview",
            "module": "newcomers",
            "headline": (
                "No newcomer records matched the selected filters."
                if total == 0
                else (
                    f"Newcomers are concentrated in {dominant_status.label.lower()} cases, with "
                    f"{summary_metrics.followups_overdue} overdue follow-ups and {summary_metrics.settled_cases} settled cases."
                )
            ),
            "summary": summary,
            "metrics": {
                "total_cases": summary_metrics.total_cases,
                "open_cases": summary_metrics.open_cases,
                "inactive_cases": summary_metrics.inactive_cases,
                "settled_cases": summary_metrics.settled_cases,
                "closed_cases": summary_metrics.closed_cases,
                "unassigned_cases": summary_metrics.unassigned_cases,
                "sponsored_cases": summary_metrics.sponsored_cases,
                "interpreter_required_cases": summary_metrics.interpreter_required_cases,
                "family_households": summary_metrics.family_households,
                "recent_intakes_30_days": summary_metrics.recent_intakes_30_days,
                "followups_overdue": summary_metrics.followups_overdue,
                "followups_due_next_7_days": summary_metrics.followups_due_next_7_days,
                "stale_cases": summary_metrics.stale_cases,
                "interactions_last_30_days": summary_metrics.interactions_last_30_days,
                "submitted_support_cases": summary_metrics.submitted_support_cases,
                "active_support_cases": summary_metrics.active_support_cases,
                "suspended_support_cases": summary_metrics.suspended_support_cases,
            },
            "status_breakdown": [item.model_dump() for item in report.status_breakdown],
            "followup_breakdown": [item.model_dump() for item in report.followup_breakdown],
            "owner_breakdown": [item.model_dump() for item in report.owner_breakdown[:5]],
            "county_breakdown": [item.model_dump() for item in report.county_breakdown[:5]],
            "language_breakdown": [item.model_dump() for item in report.language_breakdown[:5]],
            "referral_breakdown": [item.model_dump() for item in report.referral_breakdown[:5]],
            "interaction_breakdown": [item.model_dump() for item in report.interaction_breakdown[:5]],
            "sponsorship_breakdown": [item.model_dump() for item in report.sponsorship_breakdown[:5]],
            "attention_cases": [item.model_dump() for item in report.attention_cases[:5]],
            "recent_cases": [item.model_dump() for item in report.recent_cases[:5]],
        },
        chart=chart,
    )


def _build_schools_context(
    db: Session,
    *,
    start_date: date | None,
    end_date: date | None,
) -> ReportQAModuleContext:
    stats = sunday_school_service.participants_stats(db, start_date=start_date, end_date=end_date)
    contribution_rate = (
        round((stats.count_paying_contribution / stats.total_participants) * 100, 1)
        if stats.total_participants
        else 0.0
    )
    pending_total = stats.pending_lessons + stats.pending_mezmur + stats.pending_art
    summary = (
        "No school participation data was found."
        if stats.total_participants == 0
        else (
            f"Schools show {stats.total_participants} participants with a {contribution_rate}% contribution rate "
            f"and {pending_total} pending content items."
        )
    )
    chart = AIReportChartRead(
        type="bar",
        title="School participants by category",
        description="Current Sunday School participant split.",
        unit="count",
        data=[
            AIReportChartDatum(label="Child", value=float(stats.count_child)),
            AIReportChartDatum(label="Youth", value=float(stats.count_youth)),
            AIReportChartDatum(label="Adult", value=float(stats.count_adult)),
        ],
    )
    return ReportQAModuleContext(
        module="schools",
        source=AIReportSourceRead(
            id="schools_overview",
            module="schools",
            title="Schools participation metrics",
            summary=summary,
            metrics=[
                AIReportSourceMetric(label="Total participants", value=_format_count(stats.total_participants)),
                AIReportSourceMetric(label="Contribution rate", value=_format_percent(contribution_rate)),
                AIReportSourceMetric(label="Revenue", value=_format_currency(stats.revenue_last_30_days)),
                AIReportSourceMetric(label="Pending content", value=_format_count(pending_total)),
            ],
        ),
        prompt_data={
            "id": "schools_overview",
            "module": "schools",
            "headline": (
                "No school participation data was found."
                if stats.total_participants == 0
                else f"Schools currently have {stats.total_participants} participants and {pending_total} pending content items."
            ),
            "summary": summary,
            "metrics": {
                "total_participants": stats.total_participants,
                "count_child": stats.count_child,
                "count_youth": stats.count_youth,
                "count_adult": stats.count_adult,
                "contribution_rate_percent": contribution_rate,
                "revenue": float(stats.revenue_last_30_days),
                "pending_content": pending_total,
            },
        },
        chart=chart,
    )


def _build_activity_context(
    db: Session,
    *,
    start_date: date | None,
    end_date: date | None,
) -> ReportQAModuleContext:
    items = reporting_service.get_report_activity(db, limit=10, start_date=start_date, end_date=end_date)
    categories = {"promotion": 0, "member": 0, "sponsorship": 0, "newcomer": 0, "user": 0}
    for item in items:
        categories[item.category] = categories.get(item.category, 0) + 1

    latest_item = items[0] if items else None
    summary = (
        "No recent audit activity matched the selected filters."
        if not items
        else f"Recent activity is led by {latest_item.action} for {latest_item.target or latest_item.entity_type or 'system activity'}."
    )
    chart = None
    if items:
        chart = AIReportChartRead(
            type="bar",
            title="Recent activity by category",
            description="Top 10 recent audit events grouped by category.",
            unit="count",
            data=[
                AIReportChartDatum(label="Promotions", value=float(categories["promotion"])),
                AIReportChartDatum(label="Members", value=float(categories["member"])),
                AIReportChartDatum(label="Sponsorships", value=float(categories["sponsorship"])),
                AIReportChartDatum(label="Newcomers", value=float(categories["newcomer"])),
                AIReportChartDatum(label="Users", value=float(categories["user"])),
            ],
        )

    return ReportQAModuleContext(
        module="activity",
        source=AIReportSourceRead(
            id="activity_feed",
            module="activity",
            title="Recent report activity",
            summary=summary,
            metrics=[
                AIReportSourceMetric(label="Events returned", value=_format_count(len(items))),
                AIReportSourceMetric(label="Member events", value=_format_count(categories["member"])),
                AIReportSourceMetric(label="Sponsorship events", value=_format_count(categories["sponsorship"])),
                AIReportSourceMetric(label="Newcomer events", value=_format_count(categories["newcomer"])),
            ],
        ),
        prompt_data={
            "id": "activity_feed",
            "module": "activity",
            "headline": (
                "No recent audit activity matched the selected filters."
                if not items
                else f"Recent activity includes {len(items)} audit events, most recently {latest_item.action.lower()}."
            ),
            "summary": summary,
            "metrics": {
                "event_count": len(items),
                "category_counts": categories,
            },
            "recent_events": [
                {
                    "category": item.category,
                    "action": item.action,
                    "target": item.target,
                    "detail": item.detail,
                    "occurred_at": item.occurred_at.isoformat(),
                }
                for item in items[:5]
            ],
        },
        chart=chart,
    )


def _count_members(
    db: Session,
    *,
    status_filter: str | None = None,
    pays_contribution: bool | None = None,
    has_children: bool | None = None,
    missing_phone: bool | None = None,
    new_this_month: bool | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> int:
    query = build_members_query(
        db,
        base_query=db.query(Member.id),
        status_filter=status_filter,
        q=None,
        tag=None,
        ministry=None,
        gender=None,
        district=None,
        has_children=has_children,
        missing_phone=missing_phone,
        new_this_month=new_this_month,
        created_from=start_date,
        created_to=end_date,
        member_ids=None,
    )
    if pays_contribution is not None:
        query = query.filter(Member.pays_contribution.is_(pays_contribution))
    return query.order_by(None).count()


def _select_chart(
    contexts: list[ReportQAModuleContext],
    *,
    question: str,
    history_text: str,
    include_visualization: bool,
) -> AIReportChartRead | None:
    if not include_visualization:
        return None

    modules = [context.module for context in contexts]
    if not _question_warrants_chart(question, history_text=history_text, modules=modules):
        return None

    combined_text = f"{question} {history_text}".strip() if _question_uses_followup_context(_normalize_text(question)) else question
    primary_module = _infer_primary_module(combined_text, modules)
    if primary_module:
        for context in contexts:
            if context.module == primary_module and context.chart and context.chart.data:
                return context.chart

    if len(contexts) == 1 and contexts[0].chart and contexts[0].chart.data:
        return contexts[0].chart

    for context in contexts:
        if context.chart and context.chart.data:
            return context.chart
    return None


def _infer_primary_module(question: str, modules: list[AIReportQAModule]) -> AIReportQAModule | None:
    lowered = question.lower()
    best_module = None
    best_score = 0
    for module in modules:
        score = sum(1 for keyword in MODULE_KEYWORDS[module] if keyword in lowered)
        if score > best_score:
            best_module = module
            best_score = score
    if best_module:
        return best_module
    if len(modules) == 1:
        return modules[0]
    return None


def _decimal_to_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _format_currency(value: Decimal | float | int | None) -> str:
    return f"CAD {_decimal_to_float(value):,.2f}"


def _format_percent(value: float) -> str:
    return f"{value:.1f}%"


def _format_count(value: int | float) -> str:
    return f"{int(value):,}"
