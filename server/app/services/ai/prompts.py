from __future__ import annotations

from app.schemas.ai import NewcomerFollowUpDraftRequest
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
