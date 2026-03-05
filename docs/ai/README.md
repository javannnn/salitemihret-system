# AI Enablement Docs

Reviewed on March 3, 2026.

This folder turns the earlier AI strategy into repo-facing documentation and a concrete backend scaffold. The initial server implementation lives under `server/app/services/ai/` and is exposed through `server/app/routers/ai.py`.

## What is in the repo now

- A provider-agnostic backend `/ai` route group with:
  - `GET /ai/capabilities`
  - `GET /ai/status`
  - `POST /ai/drafts/newcomer-follow-up`
- Config flags in `server/app/core/config.py` and `server/.env.example`
- A minimal provider layer that supports:
  - `disabled`
  - `mock`
  - `openai_compatible`
- Prompt scaffolding for newcomer follow-up drafts

## Recommended reading order

1. [Architecture](./architecture.md)
2. [Implementation Plan](./implementation-plan.md)
3. [Model Selection](./model-selection.md)
4. [Hardware Sizing](./hardware-sizing.md)
5. [Session Status](./session-status.md)

## Near-term recommendation

Start with the newcomer follow-up draft workflow in the Newcomers module, keep the output draft-only, and require human approval before anything is sent or saved. That is the lowest-risk feature that still creates visible staff value.

## Environment flags

The current scaffold uses these variables:

```env
AI_ENABLED=false
AI_PROVIDER=disabled
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_API_KEY=
AI_DEFAULT_CHAT_MODEL=Qwen/Qwen3-14B
AI_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-4B
AI_GUARD_MODEL=Qwen/Qwen3Guard-4B
AI_OCR_MODEL=PaddleOCR-VL
AI_ALLOWED_ROLES=Admin,OfficeAdmin,PublicRelations
AI_NEWCOMER_FOLLOW_UP_ENABLED=false
AI_SEMANTIC_SEARCH_ENABLED=false
AI_EMAIL_DRAFTS_ENABLED=false
AI_DUPLICATE_REVIEW_ENABLED=false
AI_DOCUMENT_INTAKE_ENABLED=false
AI_REPORT_QA_ENABLED=false
```

Use `AI_PROVIDER=mock` for local UI and workflow development. Use `AI_PROVIDER=openai_compatible` when pointing at Ollama or vLLM.
