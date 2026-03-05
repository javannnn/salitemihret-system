# AI Session Status

Last updated: March 5, 2026

This file is the handoff checkpoint for continuing AI implementation in later sessions.

## Completed in this session

- Added backend AI route group and wiring:
  - `GET /ai/capabilities`
  - `GET /ai/status`
  - `POST /ai/drafts/newcomer-follow-up`
- Added AI service scaffold in `server/app/services/ai/`:
  - provider abstraction (`disabled`, `mock`, `openai_compatible`)
  - capability catalog
  - newcomer draft prompt builder
  - orchestration service
- Added AI schemas in `server/app/schemas/ai.py`.
- Added AI config flags to backend settings and `.env.example`.
- Added initial test file: `server/tests/test_ai_api.py`.
- Added AI documentation set under `docs/ai/`.

## Current verified state

- `server/.venv/bin/python -m compileall server/app` passed.
- Direct service smoke checks succeeded for:
  - disabled status path
  - mock newcomer draft generation path
- `server/.venv/bin/pytest server/tests/test_ai_api.py -q` hung in this shell, so there is no full pytest pass claim yet.

## Known gaps

- Frontend integration is not implemented yet for `/ai` endpoints.
- No persistent AI audit table yet (prompt version, model, latency, reviewer action).
- No vector search pipeline yet (chunking, embeddings, retrieval, citations).
- No OCR worker pipeline yet.
- No guard-model moderation path wired into request/response flow yet.

## Next implementation steps (priority order)

1. Integrate newcomer draft UI in `frontend/src/pages/Newcomers/index.tsx`.
2. Add backend audit persistence for AI draft generation and reviewer actions.
3. Add provider health check endpoint/logic for runtime observability.
4. Stabilize and run `server/tests/test_ai_api.py` in a non-hanging environment.
5. Start semantic search foundation (chunking + embeddings + vector storage).

## Backend files to continue from

- `server/app/routers/ai.py`
- `server/app/schemas/ai.py`
- `server/app/services/ai/__init__.py`
- `server/app/services/ai/catalog.py`
- `server/app/services/ai/models.py`
- `server/app/services/ai/prompts.py`
- `server/app/services/ai/providers.py`
- `server/app/services/ai/service.py`
- `server/app/core/config.py`
- `server/.env.example`
- `server/tests/test_ai_api.py`

## Environment flags in use

```env
AI_ENABLED=false
AI_PROVIDER=disabled
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_API_KEY=
AI_TIMEOUT_SECONDS=45
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

## Local setup commands

### Option A: Mock provider (fastest)

```bash
cd server
cp .env.example .env
# Edit .env:
# AI_ENABLED=true
# AI_PROVIDER=mock
# AI_NEWCOMER_FOLLOW_UP_ENABLED=true
make dev
```

### Option B: Ollama OpenAI-compatible endpoint

```bash
# Terminal 1
ollama serve

# Terminal 2 (example model pull)
ollama pull qwen3:14b

# Terminal 3
cd server
cp .env.example .env
# Edit .env:
# AI_ENABLED=true
# AI_PROVIDER=openai_compatible
# AI_BASE_URL=http://127.0.0.1:11434/v1
# AI_API_KEY=ollama
# AI_DEFAULT_CHAT_MODEL=qwen3:14b
# AI_NEWCOMER_FOLLOW_UP_ENABLED=true
make dev
```

## Quick API checks

```bash
# Requires a valid Bearer token for a role listed in AI_ALLOWED_ROLES
curl -s http://127.0.0.1:8001/ai/status -H "Authorization: Bearer <TOKEN>"
curl -s http://127.0.0.1:8001/ai/capabilities -H "Authorization: Bearer <TOKEN>"
curl -s -X POST http://127.0.0.1:8001/ai/drafts/newcomer-follow-up \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "primary_contact_name": "Marta",
    "preferred_languages": ["English", "Amharic"],
    "situation_summary": "The family recently completed intake and needs follow-up on orientation.",
    "missing_fields": ["best callback time"],
    "next_steps": ["confirm orientation date"]
  }'
```

## Resume prompt for next session

Use this text to resume quickly with another agent:

```text
Continue AI implementation from docs/ai/session-status.md. Keep the existing /ai scaffold, add newcomer UI integration in frontend/src/pages/Newcomers/index.tsx, and implement backend audit logging for AI draft generation and reviewer actions. Do not introduce autonomous writes; keep draft-only and human-review required.
```
