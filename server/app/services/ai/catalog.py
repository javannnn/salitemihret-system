from __future__ import annotations

from app.core.config import settings
from app.schemas.ai import AICapabilityRead


def get_ai_operator_roles() -> list[str]:
    return settings.AI_ALLOWED_ROLES_LIST or ["Admin", "OfficeAdmin", "PublicRelations"]


def list_capabilities() -> list[AICapabilityRead]:
    operator_roles = get_ai_operator_roles()

    return [
        AICapabilityRead(
            slug="newcomer_follow_up_draft",
            label="Newcomer follow-up drafts",
            module="Newcomers",
            description="Draft staff-reviewed outreach from intake notes and next steps.",
            status="enabled"
            if settings.AI_ENABLED and settings.AI_NEWCOMER_FOLLOW_UP_ENABLED
            else "pilot"
            if settings.AI_NEWCOMER_FOLLOW_UP_ENABLED
            else "planned",
            enabled=settings.AI_ENABLED and settings.AI_NEWCOMER_FOLLOW_UP_ENABLED,
            requires_human_review=True,
            allowed_roles=operator_roles,
            recommended_model=settings.AI_DEFAULT_CHAT_MODEL,
        ),
        AICapabilityRead(
            slug="semantic_search",
            label="Semantic search",
            module="Members, Newcomers, Sponsorships",
            description="Cross-note retrieval over case notes, intake history, and email summaries.",
            status="pilot" if settings.AI_SEMANTIC_SEARCH_ENABLED else "planned",
            enabled=settings.AI_ENABLED and settings.AI_SEMANTIC_SEARCH_ENABLED,
            requires_human_review=False,
            allowed_roles=operator_roles,
            recommended_model=settings.AI_EMBEDDING_MODEL,
        ),
        AICapabilityRead(
            slug="email_drafting",
            label="Email drafting and summarization",
            module="Admin Email",
            description="Generate reply drafts and summarize long inbox threads before staff review.",
            status="pilot" if settings.AI_EMAIL_DRAFTS_ENABLED else "planned",
            enabled=settings.AI_ENABLED and settings.AI_EMAIL_DRAFTS_ENABLED,
            requires_human_review=True,
            allowed_roles=operator_roles,
            recommended_model=settings.AI_DEFAULT_CHAT_MODEL,
        ),
        AICapabilityRead(
            slug="duplicate_review",
            label="Duplicate review assistant",
            module="Members, Newcomers",
            description="Rank likely duplicate records and explain the matching signals before a human merge.",
            status="pilot" if settings.AI_DUPLICATE_REVIEW_ENABLED else "planned",
            enabled=settings.AI_ENABLED and settings.AI_DUPLICATE_REVIEW_ENABLED,
            requires_human_review=True,
            allowed_roles=operator_roles,
            recommended_model=settings.AI_DEFAULT_CHAT_MODEL,
        ),
        AICapabilityRead(
            slug="document_intake",
            label="Document intake OCR",
            module="Newcomers, Sponsorships, Payments",
            description="Extract structured fields from scans, PDFs, forms, and receipts for human review.",
            status="pilot" if settings.AI_DOCUMENT_INTAKE_ENABLED else "planned",
            enabled=settings.AI_ENABLED and settings.AI_DOCUMENT_INTAKE_ENABLED,
            requires_human_review=True,
            allowed_roles=operator_roles,
            recommended_model=settings.AI_OCR_MODEL,
        ),
        AICapabilityRead(
            slug="report_qa",
            label="Report Q&A assistant",
            module="Reports",
            description="Answer natural-language questions over read-only reporting views and saved metrics.",
            status="pilot" if settings.AI_REPORT_QA_ENABLED else "planned",
            enabled=settings.AI_ENABLED and settings.AI_REPORT_QA_ENABLED,
            requires_human_review=False,
            allowed_roles=operator_roles,
            recommended_model=settings.AI_DEFAULT_CHAT_MODEL,
        ),
    ]
