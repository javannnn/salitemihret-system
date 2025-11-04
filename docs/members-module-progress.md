# Members Module Progress

## Phase Checklist

- [x] Phase 1 – Backend foundations (models, migration, CRUD updates, seed)
- [x] Phase 2 – Backend bulk & file operations (avatars, import/export, audit feed)
- [ ] Phase 3 – Frontend reskin & core features (dark mode, table, filters, import wizard)
- [ ] Phase 4 – Member profile & audit experience
- [ ] Phase 5 – QA & polish (tests, docs, optional enhancements)

## Current Notes

- _Status_: Phase 2 APIs remain stable. Static uploads mount under `/static`; avatar upload (with audit trail), CSV import/export (auto-creating households/tags/ministries), and member audit feed are verified. The startup guard now provisions `member_gender`, `member_marital_status`, and the ancillary spouse/child columns when migrations lag—eliminating the `baptismal_name`/child column crashes we hit during clerk logins. Demo seed includes `superadmin@example.com` (all roles) plus PR Admin, Registrar, Clerk, and Finance Admin personas. Priests endpoints (`GET /priests`, `POST /priests`) and children promotion tooling (`GET /children?eligible=…`, `POST /children/{id}/promote`) are live, with the daily APScheduler job gracefully degrading when the dependency is unavailable. `/members/meta` now uses a guarded distinct query (sorted client-side) so CORS preflights return 200s instead of the Postgres `ORDER BY`/`DISTINCT` error. Membership contributions are now enforced at 75 CAD unless a documented hardship exception (`LowIncome`, `Senior`, `Student`, `Other`) is selected; contribution currency is captured, and new `member_contribution_payments` history endpoints/seed data surface payment logs in the UI.
- _UX progress_: Members list now reflects the planned UX pass—quick filters (Active / Has children / Missing phone / New this month / Archived) persist to the URL, rows are fully clickable, and a per-row action menu exposes archive/export/father-confessor shortcuts. Context menus render on an opaque popover so they no longer inherit the backdrop blur transparency, and archiving now prompts for confirmation to avoid accidental deletes. The bulk toolbar groups Assign Father Confessor / Set Household / Export Selected / Archive Selected, and export routes accept explicit `ids` for CSVs. The assign-father-confessor modal auto-prompts the inline “Create new” priest form when a search yields no hits, keeping the workflow in-app. Contribution workflows received a finance-friendly polish (exception selector, locked base amount, low-income badge) and the member detail page now shows a contributions timeline with inline payment capture for Finance/Admin roles. Permission-aware error handling is in place via the shared `ApiError` helper.
- _Next action_: Rebuild the member create/edit experience with tabbed sections (Profile, Contact, Household & Family, Faith, Giving, Tags & Ministries, Audit), sticky save controls, child cards with promotion cues, and the creatable priest selector that hits the new `/priests` API. Follow-on: promotions drawer in the list header and household inline creation.
- _Testing_: Re-ran curl suite (export CSV, import CSV with duplicates, avatar upload, audit feed) post-guard fix on 2025-11-04; verified clerk/finance logins no longer break the list API locally. Local sanity check confirmed the /members meta drawer loads without 500s. Contribution endpoints (`GET/POST /members/{id}/contributions`) still need an end-to-end curl pass once the database is available; frontend smoke remains pending after the gating work.
- _Data Ops_: Keep `uploads/avatars` writable; rerun `alembic upgrade head` + `PYTHONPATH=$(pwd) python -m app.scripts.seed_demo` if the demo DB falls behind.

Update this file after each phase with progress, blockers, and test results.
