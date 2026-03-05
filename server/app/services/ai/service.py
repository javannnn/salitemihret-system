from __future__ import annotations

from app.core.config import settings
from app.schemas.ai import AICapabilityRead, AIDraftResponse, AIStatusRead, NewcomerFollowUpDraftRequest
from app.services.ai.catalog import get_ai_operator_roles, list_capabilities
from app.services.ai.models import AIProviderKind
from app.services.ai.prompts import build_newcomer_follow_up_messages
from app.services.ai.providers import AIProvider, AIProviderError, build_provider


class AITaskDisabledError(RuntimeError):
    pass


class AIService:
    def __init__(self, provider: AIProvider | None = None) -> None:
        self.provider = provider or build_provider()

    def list_capabilities(self) -> list[AICapabilityRead]:
        return list_capabilities()

    def get_status(self) -> AIStatusRead:
        warnings: list[str] = []
        if settings.AI_ENABLED and self.provider.kind == AIProviderKind.DISABLED:
            warnings.append("AI is enabled in config, but the selected provider is not available.")
        if settings.AI_PROVIDER == AIProviderKind.OPENAI_COMPATIBLE.value and not settings.AI_BASE_URL:
            warnings.append("AI_BASE_URL is required for the openai_compatible provider.")

        return AIStatusRead(
            enabled=settings.AI_ENABLED,
            provider=self.provider.kind.value,
            default_chat_model=settings.AI_DEFAULT_CHAT_MODEL,
            embedding_model=settings.AI_EMBEDDING_MODEL,
            guard_model=settings.AI_GUARD_MODEL,
            ocr_model=settings.AI_OCR_MODEL,
            base_url_configured=bool(settings.AI_BASE_URL),
            allowed_roles=get_ai_operator_roles(),
            capabilities=self.list_capabilities(),
            warnings=warnings,
        )

    def draft_newcomer_follow_up(self, payload: NewcomerFollowUpDraftRequest) -> AIDraftResponse:
        if not settings.AI_ENABLED or not settings.AI_NEWCOMER_FOLLOW_UP_ENABLED:
            raise AITaskDisabledError(
                "Newcomer follow-up drafts are not enabled. Set AI_ENABLED=true and AI_NEWCOMER_FOLLOW_UP_ENABLED=true."
            )

        if self.provider.kind == AIProviderKind.MOCK:
            subject, content = _mock_newcomer_follow_up(payload)
            warnings = ["Mock provider output. Replace with an OpenAI-compatible model server before rollout."]
            if payload.missing_fields:
                warnings.append("Review the listed missing intake fields before sending.")
            return AIDraftResponse(
                task="newcomer_follow_up_draft",
                provider=self.provider.kind.value,
                model=settings.AI_DEFAULT_CHAT_MODEL,
                subject=subject,
                content=content,
                warnings=warnings,
            )

        generation = self.provider.generate_text(
            model=settings.AI_DEFAULT_CHAT_MODEL,
            messages=build_newcomer_follow_up_messages(payload),
            temperature=0.2,
            max_tokens=500,
        )
        subject, content = _split_subject(generation.content)
        warnings = list(generation.warnings)
        if payload.missing_fields:
            warnings.append("Review the listed missing intake fields before sending.")

        return AIDraftResponse(
            task="newcomer_follow_up_draft",
            provider=generation.provider.value,
            model=generation.model,
            subject=subject,
            content=content,
            warnings=warnings,
        )


def get_ai_service() -> AIService:
    return AIService()


def _split_subject(content: str) -> tuple[str | None, str]:
    normalized = content.strip()
    if not normalized:
        return None, ""

    lines = normalized.splitlines()
    first_line = lines[0].strip()
    if first_line.lower().startswith("subject:"):
        subject = first_line.split(":", 1)[1].strip() or None
        body = "\n".join(lines[1:]).strip()
        return subject, body
    return None, normalized


def _mock_newcomer_follow_up(payload: NewcomerFollowUpDraftRequest) -> tuple[str, str]:
    greeting = f"Hello {payload.primary_contact_name},"
    if payload.tone == "formal":
        greeting = f"Dear {payload.primary_contact_name},"
    if payload.tone == "pastoral":
        greeting = f"Peace be with you {payload.primary_contact_name},"

    language_line = ""
    if payload.preferred_languages:
        preferred_languages = ", ".join(language.strip() for language in payload.preferred_languages if language.strip())
        language_line = f"We noted your preferred language(s): {preferred_languages}. "

    request_line = ""
    if payload.missing_fields:
        request_line = "Please reply with the following details so we can complete your intake: "
        request_line += ", ".join(field.strip() for field in payload.missing_fields if field.strip()) + "."

    next_steps_line = ""
    if payload.next_steps:
        next_steps_line = "Next steps from our side: " + "; ".join(
            step.strip() for step in payload.next_steps if step.strip()
        ) + "."

    notes_line = ""
    if payload.recent_notes:
        notes_line = "We have noted the following so far: " + "; ".join(
            note.strip() for note in payload.recent_notes if note.strip()
        ) + "."

    household_line = ""
    if payload.household_name:
        household_line = f" regarding {payload.household_name}"

    body = "\n\n".join(
        part
        for part in [
            greeting,
            (
                "Thank you for connecting with St. Mary EOTC Edmonton"
                f"{household_line}. We are following up on your newcomer intake. "
                f"{language_line}{payload.situation_summary.strip()}"
            ).strip(),
            notes_line,
            request_line,
            next_steps_line,
            "A staff member will review this message before anything is sent. May God bless you.",
        ]
        if part
    )
    return "Follow-up from St. Mary EOTC Edmonton", body
