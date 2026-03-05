# AI Implementation Plan

Reviewed on March 3, 2026.

## Phase 0: Foundation

Target: 1 week

Deliverables:

- Finalize model/runtime choices
- Stand up an internal AI endpoint
- Add backend config flags and role gating
- Add prompt/output logging schema
- Define approval requirements per workflow

Exit criteria:

- `/ai/status` returns a valid runtime summary
- `mock` and `openai_compatible` providers both work
- Draft-only workflow cannot bypass human review

## Phase 1: Newcomer Follow-up Drafts

Target: 1 to 2 weeks

Scope:

- Use intake notes, missing fields, and next steps to draft follow-up outreach
- Let staff review, edit, and send through the existing email client
- Capture approval and rejection events for prompt iteration

Implementation tasks:

1. Add a UI action in the Newcomers module to request a draft.
2. Pass intake context to `POST /ai/drafts/newcomer-follow-up`.
3. Render the draft in a review state, not as a sent message.
4. Add structured audit fields for prompt version, model, latency, and reviewer.

Success metrics:

- Time to send first follow-up
- Draft acceptance rate after light editing
- Staff-reported usefulness

## Phase 2: Search, Duplicates, and OCR

Target: 3 to 5 weeks

Scope:

- Semantic note search
- Duplicate review suggestions
- OCR extraction for forms and attachments

Implementation tasks:

1. Build a chunking pipeline for newcomer, sponsorship, and email notes.
2. Add embeddings and vector storage.
3. Add a duplicate-candidate explanation service that never merges automatically.
4. Add OCR ingestion jobs for PDFs and scans.
5. Store extracted fields as suggestions pending review.

Success metrics:

- Search precision on top 5 results
- Reduction in manual duplicate triage time
- OCR field acceptance rate

## Phase 3: Email and Report Assistants

Target: 2 to 4 weeks

Scope:

- Email thread summarization
- Reply drafting
- Read-only report Q&A

Implementation tasks:

1. Add thread summarization hooks to the email module.
2. Add report-answering backed by read-only SQL templates or curated reporting views.
3. Return sources with every answer.
4. Log rejected answers separately from accepted answers.

Success metrics:

- Reduced time spent in long email threads
- Reduced turnaround time for internal reporting questions

## Rollout policy

- Start with `Admin`, `OfficeAdmin`, and `PublicRelations`.
- Use `mock` provider in development until the UI flow is stable.
- Enable production models only after the draft workflow is measurable and reviewable.
- Roll out one module at a time. Do not enable AI everywhere at once.

## What not to automate

- Payment posting
- Contribution exception decisions
- Membership status changes
- Canonical merge actions
- Permission or role changes

## Suggested backlog order

1. Newcomer follow-up drafts
2. Email summarization and reply drafting
3. Semantic search over notes
4. Duplicate review assistant
5. OCR intake pipeline
6. Report Q&A
