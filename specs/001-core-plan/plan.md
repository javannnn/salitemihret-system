# Implementation Plan — Core Plan (SPEC-CORE-001)

## Technical Context
Frontend: React + Tailwind + shadcn/ui + i18next; Router + TanStack Query.
Backend: Frappe (Python) with DocTypes for all modules; REST endpoints; background jobs.
DB: MariaDB. Queue: Frappe background workers. Storage: local + S3-compatible (media).
Observability: logs + metrics + traces; backup policy per Ops spec.
i18n/a11y: EN/Amharic, WCAG AA.

## Constitution Check
Adhere to testing-first, observability, performance budgets, UX consistency, and traceable docs (see `.specify/memory/constitution.md`).

## Phases
### Phase 0 — Research & Setup
- Confirm DocType schema per `docs/spec-kit/03-domain-model.md`.
- Decide audit event model and RBAC matrix.
- Baseline Frappe app, CI, pre-commit, test harness.

### Phase 1 — Data Model & Contracts
- Implement DocTypes + indexes.
- Draft REST contracts in `/contracts/` (OpenAPI) for Members, Payments, Sponsorship, Newcomers, Schools, Volunteers, Media, Councils, Reports.
- Seed fixtures (roles, permissions).

### Phase 2 — UX Shells
- Admin console shell, nav, role guard, i18n scaffolding.
- Members module UI (create, family, status, import stepper).
- Payments ledger + correction UI.

### Phase 3 — Remaining Modules
- Sponsorship/Newcomers, Schools, Volunteers, Media approvals, Councils, Reports.
- Notifications (mail) and digests.

### Phase 4 — Ops & Hardening
- Backups, monitoring, dashboards.
- Perf budget checks; a11y pass; i18n QA.

## Deliverables
- `specs/001-core-plan/` : spec.md, plan.md, tasks.md, research.md
- `/contracts` OpenAPI, `/server` Frappe app, `/web` React app
