# Members Module Blueprint

## Feature Catalogue (Work Item #4)

| ID | Feature | Notes |
| --- | --- | --- |
| 2.2.4.1 | Member username | Auto-generate `first_name.last_name` (slugified, unique) |
| 2.2.4.2 | Baptismal name | Optional text on member profile |
| 2.2.4.3 | Date of birth | Optional; already present, keep validation |
| 2.2.4.4 | Number of family | Track household size (derived + override) |
| 2.2.4.5 | Child records | Capture first/last, gender, DOB, country of birth; link to household |
| 2.2.4.6 | Marital status | Dropdown; if “Married” require spouse record |
| 2.2.4.6.1 | Spouse record | First/last, gender, country of birth (plus phone/email) |
| 2.2.4.7 | Membership date | Already captured as join date; expose in UI/export |
| 2.2.4.8 | Home address | Full address detail (street, city, region, postal) |
| 2.2.4.9 | Phone number | Required field |
| 2.2.4.10 | Email | Optional |
| 2.2.4.11 | Father Confessor | Yes/No toggle + priest lookup list |
| 2.2.4.12 | Gives tithe | Yes/No |
| 2.2.4.12.1 | Pays membership contribution | Yes/No |
| 2.2.4.12.1.1 | Contribution amount | Decimal value |
| 2.2.4.12.1.2 | Method of payment | Cash / Direct Deposit / e-Transfer / Credit |
| Notifications | Child turns 18 | Email Admin/PR; tie into promotion job |
| Access control | Office Admin vs Public Relations | Office Admin read-only; PR full control |

### Guided Inputs & Lookup Strategy
- Replace legacy dropdowns with segmented controls for languages (EN/AM/TI/FR/AR) and marital status (Single, Married, Separated, Divorced, Widowed). Values come from a centralized lookup table for analytics parity.
- Require a contact preference chip (Phone, SMS, Email, WhatsApp, Signal) plus optional “Also allow” pills so automation never guesses channels.
- Introduce `geo_country`, `geo_region`, and `geo_city` lookup tables (seeded via fixtures/Alembic) so cascading comboboxes + CSV import/export share the same curated values.
- Swap the Father Confessor yes/no toggle for a `Priest` lookup combobox with inline “Quick add priest” modal, eliminating name typos.
- Render contribution methods + hardship exceptions as button groups/radio lists so staff cannot type inconsistent verbiage (a short explanation appears only when “Other” exception is chosen).
- Tokenize tags/ministries with chips: clerks can assign existing chips; Admin/PR can create new ones with audit trails.

## Phase 0 – Backlog Overview

- Extend the membership domain with households, tags, ministries, audit history, avatars.
- Support CSV import/export, bulk updates, and rich filtering/sorting.
- Deliver a modern monochrome UI (dark/light mode, motion) covering login → dashboard → members CRUD.
- Enforce role matrix (per November 2025 mandate):
  - **Super Admin** – full system control (all features, impersonation, audit maintenance).
  - **PR Admin** – full membership lifecycle (create/update, approve transitions, manage family records, reports) but no system config or audit tampering.
  - **Registrar** – validate member identities and official records; may edit personal details and approve documents; finance fields read-only.
  - **Clerk** – data entry for contact info and attachments; read-only for finance/Father Confessor; no approvals or destructive actions.
  - **Finance Admin** – manage tithe/contribution confirmations and financial reports only; no household/spiritual edits.

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
   - Guard duplicate tag/ministry names during import (slug + name collisions resolve via upsert).
   - Export helper to stream CSV.
   - Broadcast stub returning recipient count.
   - Normalize spouse/child payload helpers so UI can reuse validation.

3. **Access Control**
   - Enforce Admin on bulk/destructive routes; Registrar/Admin on uploads.
   - Ensure audit feed returns actor + timestamp.

4. **Tooling**
   - Extend `Makefile` with `export`, `import file=...`, refresh existing targets.
   - Startup hook ensures optional `children.promoted_at` column exists when migrations lag behind.

---

## Phase 3 – Domain Enhancements (Membership Requirements)

1. **Schema & Migrations**
   - Add fields: `baptismal_name`, `marital_status`, `household_size_override`, `father_confessor_id`, `gives_tithe`, `pays_contribution`, `contribution_amount`, `contribution_method`, expanded address segments (street, city, region, postal, country), `phone` required (non-null).
   - Create lookup tables `geo_country`, `geo_region`, `geo_city`, and `reference_option` (languages, marital statuses, contact channels, ministries) with fixtures/admin views.
   - Add `contact_preference` (single select) + `communication_channels` (multi-select) columns; enforce defaults during migration (fallback to Phone).
   - Update spouse table → first/last name, gender, country_of_birth; enforce presence when member marital status is Married.
   - Replace child `full_name` with discrete fields + gender/country_of_birth; keep computed name for backward compatibility.
   - Introduce `priests` lookup table; seed demo priests for Father Confessor dropdown.

2. **Services & API**
   - Member CRUD endpoints validate new fields, enforce conditional spouse logic, and persist household size override.
   - Household service recalculates size on change; expose `family_count` (derived) + override in API responses and CSV export/import.
   - Import/Export schemas updated to include new columns (spouse, children, contributions, priest) plus lookup-backed values (language, marital status, geo hierarchy, contact preference, communication channels).
   - Lightweight `/members/meta` returned without heavy joins; filters accept quick flags (`has_children`, `missing_phone`, `new_this_month`) and explicit `ids` lists for targeted exports. **Status 2025‑11‑04:** python-side sorting fixes the prior Postgres `SELECT DISTINCT … ORDER BY` crash that broke CORS.
   - Priests API (`GET /priests`, `POST /priests`) feeds the creatable selector; children endpoints (`GET /children?eligible=`, `POST /children/{id}/promote`) support the promotions drawer and daily digest.
   - Adjust permissions: OfficeAdmin `require_roles` read-only; PublicRelations inherits write + destructive; update seeds accordingly.

3. **Notifications & Automation**
   - Extend child promotion scheduler to email Admin/PR when a child hits 18 (use templated email + background task queue).
   - Hook membership status transitions (e.g., toggling tithe/contribution) into an approval workflow stub for future Finance integration.
   - Notification routines consult `contact_preference` before picking channels and fall back to the first secondary channel (or Phone) instead of assuming email.

4. **Documentation & Tests**
   - Update OpenAPI examples, curl smoke scripts, and seed data to reflect new fields.
   - Add regression tests for spouse/child validation, household size calculations, lookup enforcement, contact preference defaults, and CSV import errors when lookups mismatch.

---

## Phase 4 – Frontend Experience (Reskin + Membership Flows)

1. **Infrastructure**
   - Tailwind dark mode (`darkMode: 'class'`) with theme context (localStorage + prefers-color-scheme).
   - Toasts (existing) & framer-motion transitions.

2. **Layout & Navigation**
   - AppShell header with theme toggle, user dropdown, animated content area.
   - Dashboard summary cards (Recharts mini metrics).

3. **Members Module UI**
   - Members table with bulk actions, filter drawer, search/sort, import/export buttons (Admin vs PR gating).
   - Member form sections for contact info, Father Confessor select, tithe/contribution toggles, household metrics.
   - Child editor (grid with gender/DOB/country) + spouse form tied to marital status.
   - **Detail page revamp (Dec 2025)** – Implement the comprehensive UX blueprint:
     - Sticky top header with back button, full name, colored status chip (Pending amber / Active green / Archived slate), and right-aligned actions (Save primary, Archive, overflow).
     - Two-column responsive layout (wide content rail + slim insights rail). Left column houses Identity → Sunday School → Membership → Contact → Address → Family → Notes sections with collapsible cards; right column presents avatar (circular preview + initials fallback, upload/remove), quick actions (Payments, Sponsorships, Schools), KPIs (age, member since date, contribution health, Sunday School summary), and shortcuts.
     - Section tabs (Identity / Membership / Contact / Family / Schools / Payments / Notes) jump to anchors on desktop and convert to a segmented control on mobile. Long subsections default to collapsed accordions to eliminate scroll fatigue.
     - Floating sticky save bar anchored to the viewport bottom surfaces “Unsaved changes” state plus Cancel / Save buttons.
     - Field layout refresh: consistent spacing rhythm (24px sections, 16px rows, 12px inputs), identity grid for first/middle/last/baptismal, username + gender + marital/membership status row, DOB with inline age calculation, membership date, contribution / tithe toggles, contact and address pairs, children rendered as a table with inline “Add child” CTA, spouse card tied to marital status.
      - Avatar card shrinks to a tasteful circle, uses initials fallback, and clarifies accepted formats (“PNG/JPG/WEBP ≤5 MB”) with Upload / Remove buttons.
      - Secondary actions consolidate into the right rail (Payments timeline, Sponsorships, Sunday School records, Abenet) instead of scattered buttons.
   - Creation experience: remove the legacy quick-add modal. Clicking “New member” now routes to `/members/new`, which loads the revamped detail page in “draft” mode (no member ID yet). Saving performs a POST, redirects to `/members/{id}/edit`, and only then enables avatar uploads, payments, and quick actions. Draft mode keeps validation/toast behavior consistent and tells the user “Save this member to unlock…” when actions are unavailable.
   - Household drawer to add/remove family members inline; surface derived family count.
   - Dedicated CRUD flows for households, father confessors, and spouse management:
     - Backend: `/households` router (list/search, create/update/delete, assign members), expanded `/priests` router (detail/update/archive), and a targeted `/members/{id}/spouse` endpoint so drawers can persist without resubmitting the full form. All reuse the existing membership RBAC scopes.
  - Frontend: shared API helpers plus three modular UIs — a Household Assign drawer (invoked from bulk actions + create/edit forms), a Priest Directory modal (tabbed quick-add + management list), and a Spouse drawer that keeps draft state, enforces the `+1##########` pattern inline, and only submits canonical contacts. Each surface inherits RBAC constraints from the membership page.
  - UX: Drawers/Dialog patterns stay consistent with current membership UI (shadcn/ui + motion). Household head selection uses drag-to-reorder; spouse drawer streams validation copy before submit; quick add modals share the validation helpers introduced during the contact rewrite.

4. **Import Wizard**
   - Dropzone (react-dropzone) with column mapping for new fields, preview of spouse/child rows, submission summary with validation hints.


---

## Phase 5 – Member Profile & Audit Experience

1. **Profile Page**
   - Avatar upload card, contact details, household linkage, tags, ministries, Father Confessor, contribution summary.
   - Tag chip add/remove, ministry assignment modals.
   - Audit timeline (fades) from `/members/{id}/audit` including spouse/child/family count changes.
   - Restore action for Admin; inline approvals for tithe/contribution updates.

2. **UI Components**
   - StatusChip, TagChip, FilterBadge, confirmation dialogs.
   - Motion-enhanced page transitions.

3. **Refinements**
   - Role-based UI gating & informative messages.
   - Robust error handling (toasts + redirects).
   - Smooth dark/light palette transitions.

---

## Phase 6 – QA & Polish

- End-to-end smoke scripts (curl + UI).
- pytest coverage for bulk/import/export & audit flows.
- Documentation updates (Quickstart, README, API reference, client demo guide).
- Optional backlog: trigram search index, real broadcast integration, CDN avatars.

---

## Execution Notes

- Phases 1 through 5 are complete in the current codebase. The membership module is ready for handoff; future work should focus on the next roadmap module (per client priorities) and any cross-cutting QA discovered during integrated testing.
- Final Phase-5 polish (Nov 2025) introduced the hover-animated quick-add button, floating required-fields modal, and a stabilized Actions dropdown to address stakeholder feedback about workflow friction.
- Duplicate safeguards now exist across the stack (`/members/duplicates` API + UI warnings + hard validation on email/phone) so clerks can't accidentally create duplicate member records.

- Work sequentially by phase; ensure migrations/tests succeed before advancing.
- Track progress in `docs/members-module-progress.md`.
- Coordinate frontend work only after Phase 1 backend endpoints stabilize.
