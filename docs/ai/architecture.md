# AI Architecture

Reviewed on March 3, 2026.

## Product goals

The system should use AI for assistive work, not for authoritative decisions. The right boundary is:

- AI may draft, summarize, rank, extract, and explain.
- AI may not directly post payments, merge records, change contribution rules, override permissions, or finalize case status.

That boundary fits the existing product surfaces in:

- `frontend/src/pages/Newcomers/index.tsx`
- `frontend/src/pages/Sponsorships/index.tsx`
- `frontend/src/pages/Admin/Email/Client.tsx`
- `frontend/src/pages/Members/Edit.tsx`
- `frontend/src/pages/Payments/Ledger.tsx`

## Recommended architecture

```text
React UI
  -> FastAPI /ai router
    -> AI service orchestration
      -> prompt builders
      -> provider adapter
      -> guard model adapter
      -> retrieval layer
      -> audit logging
      -> background jobs for OCR/indexing
    -> Postgres business data
    -> pgvector or external vector store
    -> object storage for PDFs/images
    -> open-model runtime (vLLM prod, Ollama dev)
```

## Why this shape

- The application already has a clear FastAPI service layer under `server/app/services/`.
- The provider boundary keeps frontend and business logic insulated from model swaps.
- OpenAI-compatible APIs let the repo move between local development and production runtimes without rewriting routes.
- Retrieval, OCR, and long-running summaries should not live inside request handlers.

## Initial repo skeleton

The initial scaffold added in this repo is intentionally narrow:

- `server/app/routers/ai.py`
  - public API surface for AI features
- `server/app/schemas/ai.py`
  - request and response contracts
- `server/app/services/ai/catalog.py`
  - feature catalog and rollout flags
- `server/app/services/ai/prompts.py`
  - prompt construction
- `server/app/services/ai/providers.py`
  - `disabled`, `mock`, and `openai_compatible` providers
- `server/app/services/ai/service.py`
  - orchestration and feature gating

This is enough to wire a first feature end-to-end without committing the system to a vendor or model family.

## First production workflows

### Phase 1

- Newcomer follow-up draft generation
- Email reply drafting and thread summarization

### Phase 2

- Semantic search over newcomer, sponsorship, and internal notes
- Duplicate review suggestions for member/newcomer intake
- OCR extraction for forms and attachments

### Phase 3

- Read-only report Q&A over approved reporting views

## Retrieval architecture

Semantic search should be built as a separate layer, not as a prompt hack.

1. Normalize source records into chunks.
2. Generate embeddings.
3. Store vectors with source metadata and row-level identifiers.
4. Retrieve top matches by module and permission scope.
5. Pass only retrieved evidence into the LLM.
6. Return citations or source references in the UI.

The simplest first implementation is Postgres with `pgvector` because the project already centers on Postgres. If operationally easier, Qdrant is a reasonable second option.

## Guardrails

Every AI workflow should enforce these rules:

- Human review required for outbound communication.
- No direct writes to financial or canonical identity records.
- Output logging for prompt, model, latency, and user approval/rejection.
- PII-minimized prompts where possible.
- Role-based feature gating on the backend, not only in the frontend.

## Runtime split

### Development

- Ollama
- Mock provider in the API when a model runtime is not available

### Staging and production

- vLLM serving an OpenAI-compatible endpoint
- Separate worker path for OCR and embedding jobs
- Health checks, latency metrics, and request logging

## Data flow for the first feature

```text
Newcomer intake screen
  -> POST /ai/drafts/newcomer-follow-up
    -> AI service checks flags and roles
    -> prompt builder creates system/user messages
    -> provider generates a draft
    -> API returns preview-only content
  -> staff edits draft
  -> existing email workflow sends after explicit approval
```

That first flow stays low risk because nothing is persisted or sent automatically.
