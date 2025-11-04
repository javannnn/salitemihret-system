# Quickstart — FastAPI Pivot

## Prerequisites
- Python 3.11 with `venv`
- Node.js 20 LTS (npm or pnpm)
- Docker (Compose v2) for Postgres
- Access to `docs/spec-kit/` (architecture, UX, operations)
- `make` (optional) for convenience targets

## Environment Setup (Backend)
1. `git checkout 010-fastapi-pivot`
2. Bootstrap Postgres:
   ```bash
   docker compose -f infra/compose.yml up -d
   ```
3. Create backend environment:
   ```bash
   cd server
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -U pip
   pip install -r requirements.txt  # generated in this branch
   ```
4. Configure environment variables:
   ```bash
   cp .env.example .env
   # adjust DATABASE_URL, JWT_SECRET, etc.
   ```
5. Apply migrations and seed demo data:
   ```bash
   alembic upgrade head
   python -m app.scripts.seed_demo
   ```
6. Run API locally:
   ```bash
   uvicorn app.main:app --reload --port 8001
   ```
7. Smoke test:
   ```bash
   curl -s http://localhost:8001/health
  curl -s -X POST http://localhost:8001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"pradmin@example.com","password":"Demo123!"}'
   ```

## Environment Setup (Frontend)
1. `cd frontend`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment file:
   ```bash
   cp .env.example .env.local  # contains VITE_API_BASE
   ```
4. Run dev server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:5173` and sign in with seeded credentials (e.g. `pradmin@example.com` / `Demo123!`).

## Test-First Workflow
1. Backend unit/API tests:
   ```bash
   cd server && source .venv/bin/activate
   pytest
   ```
2. Frontend unit tests:
   ```bash
   cd frontend
   npm run test
   ```
3. Contract checks (OpenAPI soon):
   ```bash
   cd server
   python -m scripts.generate_openapi  # placeholder until implemented
   ```
4. Constitution gate: ensure failing tests exist for new modules before writing implementation.

## Story Validation Matrix (Pivot)
- **Auth & RBAC (SPEC-AUTH-001/002)**: Verify JWT login, refresh, whoami, and role guards via API + protected routes.
- **Members (SPEC-MEMBERSHIP)**: CRUD flows via FastAPI endpoints, soft delete email stubs, list pagination and filters.
- **Payments (SPEC-PAY-001)**: Ledger endpoints + invariants (coming after membership).
- **Sponsorship/Newcomers (SPEC-SPN-001 / SPEC-NEW-001)**: Pledge + settlement flows (post-membership).
- **Schools / Volunteers / Media / Councils / Reports**: Each maps to dedicated module spec with acceptance tests.

## Observability & Operations
1. Metrics: enable FastAPI instrumentor (OpenTelemetry) and expose `/metrics` (planned Phase 2).
2. Logs: structured JSON with request IDs via `app.core.logging` (to be wired).
3. Migrations: Alembic revision per module, run via CI/CD before deploy.
4. Backups: Postgres dump + S3 upload script tracked in `docs/spec-kit/10-operations-and-backups.md`.

## Data Reset & Fixtures
- `python -m app.scripts.seed_demo --reset` (drops and recreates demo data; idempotent)
- `alembic downgrade base && alembic upgrade head` (clean migrations)

## Frontend RBAC Wiring
1. `AuthProvider` boots, calls `/auth/whoami`, stores roles in context.
2. `ProtectedRoute` enforces role lists (`PublicRelations` vs `OfficeAdmin`).
3. `AppShell` displays persona badges, localisation toggle (EN/Am) using i18next.

## UAT Smoke Script (Membership MVP)
1. Login as `pradmin@example.com` (PublicRelations).
2. Create member with spouse + two children; verify username `first.last`.
3. Toggle tithe + contribution metadata; save and re-open detail.
4. Login as `registrar@example.com` (OfficeAdmin); confirm read-only detail view.
5. Soft-delete member; confirm audit/email stub logged in backend.
