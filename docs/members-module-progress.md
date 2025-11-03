# Members Module Progress

## Phase Checklist

- [x] Phase 1 – Backend foundations (models, migration, CRUD updates, seed)
- [x] Phase 2 – Backend bulk & file operations (avatars, import/export, audit feed)
- [ ] Phase 3 – Frontend reskin & core features (dark mode, table, filters, import wizard)
- [ ] Phase 4 – Member profile & audit experience
- [ ] Phase 5 – QA & polish (tests, docs, optional enhancements)

## Current Notes

- _Status_: Phase 2 endpoints live. Static uploads now mount under `/static`; avatar upload with audit trail, CSV export/import (with household/tag/ministry creation + upsert), and member audit feed are in place.
- _Next action_: Move to Phase 3 for frontend reskin/import wizard once backend smoke tests pass.
- _Testing_: Manual smoke checklist pending (avatar upload, CSV export/import, audit feed). Run after backend restart with sample CSV from plan.
- _Data Ops_: Ensure `uploads/avatars` writable; rerun `alembic upgrade head` + `python -m app.scripts.seed_demo` if database needs fresh seed.

Update this file after each phase with progress, blockers, and test results.
