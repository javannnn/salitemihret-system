---
description: "Task list template for feature implementation (FastAPI stack)"
---

# Tasks: Core Plan (FastAPI Pivot)

**Input**: Design documents from `/specs/001-core-plan/`  
**Prerequisites**: `plan.md` (approved), `spec.md` (stories + acceptance criteria)  
**Tests**: Follow the constitution mandate—write failing tests before coding and
keep them green.  
**Branch Naming**: `feat/SPEC-<ID>-<slug>` (e.g., `feat/SPEC-AUTH-001-rbac`).  

> **Legacy Notice**: Earlier versions of this file referenced the retired Frappe
> app under `apps/salitemiret/`. All active work now happens in `server/`
> (FastAPI + SQLAlchemy) and `frontend/` (React + Vite). The legacy directory
> remains read-only for historical traceability.

## Path Conventions
- Backend: `server/app/**`, Alembic migrations under `server/alembic/versions/`
- Frontend: `frontend/src/**`
- Tests: `server/tests/**`, `frontend/src/**/__tests__/`
- Docs: `docs/**`, `specs/**`

---

## Phase 1: Setup & Tooling
**Purpose**: Establish project scaffolding and baseline tooling.  
**Spec Alignment**: Enables SPEC-AUTH series.

- [ ] T001 Create `.env.example` with `DATABASE_URL`, `JWT_SECRET`, `VITE_API_BASE`.
- [ ] T002 Configure logging + settings in `server/app/core/config.py` and document defaults in `docs/setup/local-development.md`.
- [ ] T003 Initialize FastAPI app entrypoint (`server/app/main.py`) with CORS, license middleware, APScheduler wiring.
- [ ] T004 Configure Ruff, MyPy, and pytest settings (`pyproject.toml`).
- [ ] T005 Bootstrap Vite workspace with Tailwind, shadcn/ui, TanStack Query (`frontend/package.json`, `tailwind.config.js`).
- [ ] T006 Write local quickstart (backend make targets, frontend env) in `docs/setup/local-development.md`.

---

## Phase 2: Auth & RBAC (SPEC-AUTH-001/002)
**Goal**: JWT auth, deny-by-default RBAC, immutable audit trail.  
**Independent Test**: Login + role enforcement without other modules.

Tests (mandatory):
- [ ] T010 Add RBAC integration tests `server/tests/integration/test_auth_roles.py`.
- [ ] T011 Add audit event contract tests `server/tests/integration/test_audit_events.py`.

Implementation:
- [ ] T012 Implement `User`, `Role`, `UserRole` models + Alembic migration.
- [ ] T013 Build auth utilities (`app/auth/security.py`, `app/auth/deps.py`) with password hashing and JWT creation.
- [ ] T014 Expose `/auth/login` + `/auth/whoami` routers.
- [ ] T015 Implement audit service (`app/services/audit.py`) + `member_audit` table.
- [ ] T016 Wire middleware to attach `trace_id` + enforce license status.
- [ ] T017 Frontend: Auth provider, login form, protected route wrappers.
- [ ] T018 Frontend: Role-aware navigation + guard tests.

Checkpoint: SPEC-AUTH stories complete.

---

## Phase 3: Membership Core (SPEC-MBR-001/002)
**Goal**: CRUD members, households, statuses with chip-based UI.  
**Tests**: `server/tests/members/test_member_crud.py`, React component tests.

- [ ] T020 Model `Member`, `Household`, `MemberStatusHistory`, `Tag`, `Ministry`, `Priest`; create Alembic migration.
- [ ] T021 Build query helpers + filters (`app/services/members_query.py`).
- [ ] T022 Implement `/members` router (list/create/update/delete, duplicates, contributions).
- [ ] T023 Implement `/priests` router for father-confessor lookup.
- [ ] T024 Seed demo data via `app/scripts/seed_demo.py`.
- [ ] T025 Frontend: Members list, drawer, quick actions, chip inputs.
- [ ] T026 Frontend: Father confessor selector with inline “add” modal.

---

## Phase 4: Imports & Automations (SPEC-MBR-003)
- [ ] T030 Build file upload + avatar endpoints (`app/routers/members_files.py`).
- [ ] T031 Implement CSV import service + validations (`app/services/members_import.py`) and bulk router.
- [ ] T032 Add APScheduler jobs for status suggestions + child promotion.
- [ ] T033 Frontend: Import wizard, bulk toolbar, suggestion drawer.
- [ ] T034 Tests: CSV validation cases, promotion automation, avatar upload.

---

## Phase 5: Payments (SPEC-PAY-001)
- [ ] T040 Define `Payment`, `PaymentDayLock`, `PaymentServiceType` models.
- [ ] T041 Implement payments router (list/create/correct/export/day-lock).
- [ ] T042 Service logic for ledger, corrections, exports (`app/services/payments.py`).
- [ ] T043 Frontend payments workspace (table, correction dialog, exports).
- [ ] T044 Tests: ledger CRUD, correction invariants, CSV export, day lock rules.

---

## Phase 6: Sponsorships & Newcomers (SPEC-SPN-001, SPEC-NCM-001)
- [ ] T050 Build models + routers for `Sponsorship` and `Newcomer`.
- [ ] T051 Services for pledge math, beneficiary sync, reminder scheduling.
- [ ] T052 Frontend: Sponsorship board, pledge drawer, newcomer Kanban.
- [ ] T053 Tests: pledge lifecycle, newcomer conversion, reminder cadence.

---

## Phase 7: Formation & Volunteers (SPEC-SCH-001, SPEC-VOL-001)
- [ ] T060 Models + routers for lessons, mezmur, enrollments, volunteers.
- [ ] T061 Child promotion + attendance services.
- [ ] T062 Frontend: Schools dashboard, volunteer management & logging.
- [ ] T063 Tests: promotion workflow, volunteer inactivity digests.

---

## Phase 8: Media & Public Feed (SPEC-MED-001)
- [ ] T070 Models + routers for media requests/public posts.
- [ ] T071 Approval + publication service (includes CDN invalidation hook).
- [ ] T072 Public feed endpoint consumed by external site.
- [ ] T073 Frontend: Media Kanban, approval drawer, feed preview.
- [ ] T074 Tests: workflow transitions, feed caching, audit entries.

---

## Phase 9: Reporting (SPEC-RPT-001)
- [ ] T080 Create SQL/materialized views (`server/app/reporting/sql/`).
- [ ] T081 Router/services for report execution, scheduling, CSV exports.
- [ ] T082 APScheduler jobs for scheduled deliveries.
- [ ] T083 Frontend: Report catalog, filter drawer, scheduling UI.
- [ ] T084 Tests: report permissions, scheduled delivery smoke tests.

---

## Phase 10: Hardening (Cross-Cutting)
- [ ] T090 Internationalization final pass (copy review, missing strings).
- [ ] T091 Accessibility fixes + axe-core coverage.
- [ ] T092 Observability instrumentation (logs, metrics, trace propagation).
- [ ] T093 Backup/restore automation validated; runbooks updated.
- [ ] T094 Penultimate QA + documentation sweep (Spec-Kit, API docs).

---

## Regression & Release Checklist
- All automated tests green (CI + local).
- Alembic migrations applied and reversible (when feasible).
- Frontend build + backend service smoke-tested via systemd-managed host.
- Docs updated (architecture, API, module specs) to reflect changes.
- Release notes prepared with Spec IDs and acceptance criteria references.
