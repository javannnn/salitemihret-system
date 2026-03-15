from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from app.schemas.ai import AIReportQARequest, NewcomerFollowUpDraftRequest
from app.services.ai.models import AIChatMessage


def _render_bullets(items: list[str], empty_message: str) -> str:
    cleaned = [item.strip() for item in items if item.strip()]
    if not cleaned:
        return f"- {empty_message}"
    return "\n".join(f"- {item}" for item in cleaned)


def build_newcomer_follow_up_messages(payload: NewcomerFollowUpDraftRequest) -> list[AIChatMessage]:
    preferred_languages = ", ".join(language.strip() for language in payload.preferred_languages if language.strip()) or "English"

    system_prompt = (
        "You write professional but pastoral follow-up drafts for church office staff. "
        "Do not invent facts, financial promises, or approvals. Ask for missing information clearly. "
        "Keep drafts concise and respectful. Human review is always required before sending."
    )
    user_prompt = f"""
Draft a {payload.tone} follow-up message for newcomer intake.

Primary contact: {payload.primary_contact_name}
Household: {payload.household_name or "Not recorded"}
Preferred languages: {preferred_languages}

Situation summary:
{payload.situation_summary.strip()}

Recent notes:
{_render_bullets(payload.recent_notes, "No recent notes recorded.")}

Missing information to request:
{_render_bullets(payload.missing_fields, "No additional missing fields listed.")}

Next steps to mention:
{_render_bullets(payload.next_steps, "No next steps listed yet.")}

Requirements:
- Mention St. Mary EOTC Edmonton once.
- Keep the draft under 220 words.
- Use plain language.
- {"Include a subject line on the first line as `Subject: ...`." if payload.include_subject_line else "Do not include a subject line."}
- If a preferred language other than English is listed, produce the draft in the best matching language when possible.

Return only the final draft.
""".strip()

    return [
        AIChatMessage(role="system", content=system_prompt),
        AIChatMessage(role="user", content=user_prompt),
    ]


def build_report_qa_messages(
    payload: AIReportQARequest,
    *,
    prompt_context: Mapping[str, Any],
) -> list[AIChatMessage]:
    system_prompt = (
        "You are a careful reporting analyst for an internal church administration system. "
        "Answer only from the provided reporting context, do not invent facts, and cite source ids like [payments_summary]. "
        "Write in natural, concise language and answer the user's actual question."
    )

    recent_history = payload.history[-4:]
    history_lines = "\n".join(
        f"{message.role.title()}: {message.content.strip()}"
        for message in recent_history
        if message.content.strip()
    )
    history_block = history_lines or "No prior conversation."
    compact_context_json = json.dumps(_to_jsonable(prompt_context), ensure_ascii=True, separators=(",", ":"))

    user_prompt = f"""
Reporting context JSON:
{compact_context_json}

Recent conversation:
{history_block}

User question:
{payload.question.strip()}

Requirements:
- Base the answer only on the context JSON.
- For a narrow follow-up question, answer that exact question first instead of repeating a full summary.
- For direct metric questions, use the exact metric label and value from the context JSON before adding any explanation.
- Do not rename metrics; keep totals, active counts, rates, and payer counts distinct.
- Highlight the most relevant metrics first.
- If a date range is present, respect it.
- Mention permission gaps or missing data if the context shows them.
- Keep the answer under 220 words.
- Return only the final answer text.
""".strip()

    return [
        AIChatMessage(role="system", content=system_prompt),
        AIChatMessage(role="user", content=user_prompt),
    ]


def build_broader_report_qa_messages(
    payload: AIReportQARequest,
    *,
    report_context: Mapping[str, Any],
    system_context: Mapping[str, Any],
) -> list[AIChatMessage]:
    system_prompt = (
        "You are a careful product guide for an internal church administration system. "
        "The user asked something outside the current report-only scope. "
        "Answer only from the provided report context, capability catalog, permission metadata, and API/schema metadata. "
        "Do not invent endpoints, workflows, permissions, or runtime behavior. "
        "Never treat report counts or dashboard totals as proof of product behavior. "
        "Write for church office staff and lay users, not engineers. "
        "Prefer plain language about screens, tasks, and what the user can do. "
        "Do not talk about APIs, routes, schemas, or metadata unless the user explicitly asks for technical details. "
        "If the metadata is insufficient, say so plainly instead of guessing. "
        "This mode is slower and more speculative than grounded report answers."
    )

    recent_history = payload.history[-4:]
    history_lines = "\n".join(
        f"{message.role.title()}: {message.content.strip()}"
        for message in recent_history
        if message.content.strip()
    )
    history_block = history_lines or "No prior conversation."
    compact_report_json = json.dumps(_to_jsonable(report_context), ensure_ascii=True, separators=(",", ":"))
    compact_system_json = json.dumps(_to_jsonable(system_context), ensure_ascii=True, separators=(",", ":"))

    user_prompt = f"""
Grounded report context JSON:
{compact_report_json}

Broader system metadata JSON:
{compact_system_json}

Recent conversation:
{history_block}

User question:
{payload.question.strip()}

Requirements:
- Use the broader system metadata only because the question is outside the current report-only scope.
- Keep the answer concise and practical.
- Answer in plain language for a non-technical user.
- Lead with what the feature is for and what the user can do there.
- If roles and permissions are involved, distinguish between assigning roles to a person and editing what a role is allowed to do.
- Make it explicit when something is inferred from endpoint names, tags, or metadata rather than confirmed behavior.
- If the metadata does not answer the question directly, say: "I can't confirm that from the system information I have," then explain what is missing.
- Do not answer a product or workflow question with report metrics unless the question is explicitly asking about report numbers.
- Do not cite report source ids or invent numeric report facts.
- Keep the answer under 220 words.
- Return only the final answer text.
""".strip()

    return [
        AIChatMessage(role="system", content=system_prompt),
        AIChatMessage(role="user", content=user_prompt),
    ]


def _to_jsonable(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [_to_jsonable(item) for item in value]
    if hasattr(value, "model_dump"):
        return _to_jsonable(value.model_dump())
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except TypeError:
            pass
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)
