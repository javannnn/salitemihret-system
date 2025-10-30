# Quickstart — Core Plan

## Prerequisites
- Python 3.11 with Frappe Bench 15.x (`pipx install frappe-bench`)
- Node.js 20 LTS with pnpm 9.x (`corepack enable`)
- MariaDB 10.6, Redis 6.x, and MinIO (or S3-compatible) reachable locally
- Access to `docs/spec-kit/` for architecture, UX, and operations guidelines

## Environment Setup
1. Clone repository and checkout branch `001-core-plan`.
2. `bench init server --python python3.11 && cd server && bench new-app salitemiret`.
3. Copy `.env.example` to `.env`; configure MariaDB, Redis, MinIO, and localization settings as documented in `docs/spec-kit/01-architecture.md`.
4. `bench get-app payments https://github.com/frappe/payments` (optional dependency per spec kit), then `bench start` to launch site, workers, and scheduler.
5. In another terminal: `cd web && pnpm install && pnpm dev` to boot the React admin shell with hot reload.

## Test-First Workflow
1. Backend unit/integration: `cd server && bench --site salitemiret.local test --app salitemiret` (pytest).
2. Frontend unit: `cd web && pnpm test` (Vitest + React Testing Library).
3. Frontend e2e: `cd web && pnpm test:e2e` (Playwright headless Chromium).
4. Contract validation: `pnpm lint:openapi --file ../../specs/001-core-plan/contracts/openapi.yaml`.
5. Constitution gate: verify `specs/001-core-plan/tasks.md` test tasks fail prior to implementation.

## Story Validation Matrix
- **US1 Auth & Audit (SPEC-AUTH-001/002)**: Run `test_auth_rbac.py`, log in via admin UI, confirm unauthorized menus hidden, inspect `Audit Event` DocType for session entries.
- **US2 Members (SPEC-MBR-001/002)**: Upload `scripts/samples/members.csv`, download error CSV for invalid rows, approve suggested statuses through PR queue.
- **US3 Payments (SPEC-PAY-001)**: Create ledger entry, submit correction, approve via finance role, verify ledger hash continuity and audit emission.
- **US4 Sponsorship/Newcomers (SPEC-SPN-001/SPEC-NEW-001)**: Register newcomer, convert to sponsorship, monitor `bench worker --queue long` for reminder job.
- **US5 Schools (SPEC-SCH-001)**: Enroll student, trigger monthly reminders with `bench execute salitemiret.schools.billing_jobs.run_now`, confirm notification stub.
- **US6 Volunteers (SPEC-VOL-001)**: Log service hours, schedule inactivity digest, confirm digest payload in notification queue.
- **US7 Media (SPEC-MED-001)**: Submit request, approve via media admin, validate `/media/public-feed` endpoint returns published item.
- **US8 Councils (SPEC-COU-001)**: Create council, add term, open governance dashboard in React admin to ensure metrics resolve.
- **US9 Reports (SPEC-REP-001)**: Run ad-hoc report through UI, configure schedule, check scheduler log for successful execution.
- **RBAC Baseline**: After syncing fixtures (`bench --site salitemiret.local export-fixtures --app salitemiret`), reload the Role Permission Matrix DocTypes with `bench --site salitemiret.local reload-doc salitemiret --doctype role_permission_matrix` to ensure deny-by-default permissions are active.

## Observability & Operations
1. Metrics: `curl http://localhost:8000/api/method/salitemiret.observability.metrics` to confirm Prometheus exposition.
2. Traces: Inspect worker logs (`bench worker --queue default`) for JSON entries with `trace_id`/`span_id`.
3. Backups: Execute `bench --site salitemiret.local execute salitemiret.scripts.backup.run_now` and verify artifact in configured S3 bucket.
4. Accessibility/i18n: Run `pnpm lint:a11y` and toggle `/i18n` switch in UI to confirm EN/Am parity per `docs/spec-kit/02-ux-principles.md`.

## Data Reset & Fixtures
- Seed baseline roles/permissions: `bench --site salitemiret.local execute salitemiret.setup.install_fixtures`.
- Reset demo data: `bench --site salitemiret.local execute salitemiret.scripts.demo.reset`.
- Clear frontend caches: `cd web && pnpm exec vite --clearScreen false --force`.
## Frontend RBAC wiring
1. Mount `RBACProvider` inside a `QueryClientProvider` so the whoami query hydrates roles on load.
2. Use `ProtectedRoute` / `RoleGate` (see `PRAdminDemoRoute`) to gate routes or components; both expose loading fallbacks while the whoami request is in-flight.
3. The RBAC context exposes `roles`, `personas`, and helpers (`useRBAC`) for local overrides during tests or storybook scenarios.

## Core Entities Bootstrap
1. `bench --site salitemiret.local migrate`
2. `bench --site salitemiret.local reload-doc salitemiret salitemiret household`
3. `bench --site salitemiret.local reload-doc salitemiret salitemiret member`
4. `bench --site salitemiret.local execute frappe.utils.fixtures.sync_fixtures --args '["salitemiret"]'`
