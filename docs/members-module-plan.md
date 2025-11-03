# Members Module Blueprint

## Phase 0 – Backlog Overview

- Extend the membership domain with households, tags, ministries, audit history, avatars.
- Support CSV import/export, bulk updates, and rich filtering/sorting.
- Deliver a modern monochrome UI (dark/light mode, motion) covering login → dashboard → members CRUD.
- Enforce role matrix:
  - **Read**: PublicRelations, OfficeAdmin, Registrar, Admin
  - **Write**: Registrar, Admin
  - **Bulk/Destructive**: Admin

---

## Phase 1 – Backend Foundations

1. **Models & Migration**
   - Expand `members` table with new fields (middle_name, gender enum, birth/join dates, address, district, avatar_path, deleted_at, created/updated metadata).
   - Add tables: `households`, `tags`, `member_tags`, `ministries`, `member_ministries`, `member_audit`.
   - Alembic revision `0003_members_expansion.py` with guarded enums and indexes.

2. **API Enhancements**
   - `/members` GET: filters (`q`, `status`, `tag`, `ministry`, `gender`, `district`), sort (`?sort=last_name,-created_at`), paginated envelope.
   - CRUD: POST, PATCH, soft DELETE, POST `/members/{id}/restore`.
   - Seed demo data: households, tags (Youth, Choir, Media), ministries (SundaySchool, PR), avatar stubs.

3. **Services & Config**
   - Audit logging utility to record field diffs.
   - CSV parser skeleton for upcoming import.
   - `config.py` for `UPLOAD_DIR`; mount static uploads in `main.py`.

---

## Phase 2 – Backend Bulk & File Operations

1. **Routers**
   - `members_files.py`: avatar upload endpoint.
   - `members_bulk.py`: bulk update/archive, import/export, `/members/{id}/audit`, `/members/broadcast` stub.

2. **Services**
   - `members_import.py`: CSV ingestion (preview/report), reuse audit hooks.
   - Export helper to stream CSV.
   - Broadcast stub returning recipient count.

3. **Access Control**
   - Enforce Admin on bulk/destructive routes; Registrar/Admin on uploads.
   - Ensure audit feed returns actor + timestamp.

4. **Tooling**
   - Extend `Makefile` with `export`, `import file=...`, refresh existing targets.

---

## Phase 3 – Frontend Reskin & Core Features

1. **Infrastructure**
   - Tailwind dark mode (`darkMode: 'class'`) with theme context (localStorage + prefers-color-scheme).
   - Toasts (existing) & framer-motion transitions.

2. **Layout & Navigation**
   - AppShell header with theme toggle, user dropdown, animated content area.
   - Dashboard summary cards (Recharts mini metrics).

3. **Members Table**
   - Multi-select bulk actions (archive, update status, export selection).
   - Filter drawer (tag, ministry, gender, district, status).
   - Search, sort, skeleton loaders, role-based button visibility.
   - Import/Export buttons.

4. **Import Wizard**
   - Dropzone (react-dropzone), parsed preview, column mapping, submit to API, response summary.

---

## Phase 4 – Member Profile & Audit Experience

1. **Profile Page**
   - Avatar upload card, contact details, household linkage, tags, ministries.
   - Tag chip add/remove, ministry assignment modals.
   - Audit timeline (fades) from `/members/{id}/audit`.
   - Restore action for Admin.

2. **UI Components**
   - StatusChip, TagChip, FilterBadge, confirmation dialogs.
   - Motion-enhanced page transitions.

3. **Refinements**
   - Role-based UI gating & informative messages.
   - Robust error handling (toasts + redirects).
   - Smooth dark/light palette transitions.

---

## Phase 5 – QA & Polish

- End-to-end smoke scripts (curl + UI).
- pytest coverage for bulk/import/export & audit flows.
- Documentation updates (Quickstart, README, API reference, client demo guide).
- Optional backlog: trigram search index, real broadcast integration, CDN avatars.

---

## Execution Notes

- Work sequentially by phase; ensure migrations/tests succeed before advancing.
- Track progress in `docs/members-module-progress.md`.
- Coordinate frontend work only after Phase 1 backend endpoints stabilize.
