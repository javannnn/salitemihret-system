# SaliteMihret System

SaliteMihret is a monorepo that houses both the Postgres-backed API service and the
React administration client that parish teams use to manage members,
contributions, sponsorships, media, volunteers, and reporting. The backend has
moved off of the original Frappe stack and is now a plain Python service that
leans on SQLAlchemy models, Alembic migrations, and typed Pydantic response
contracts exposed through a small HTTP layer. The React app consumes those APIs
with TanStack Query and enforces deny-by-default RBAC on every route.

## Repository layout

- `apps/server/` – Python 3.11 service that exposes the public API, SQLAlchemy
  models, Alembic migrations, and pytest coverage for the domain. Legacy Frappe
  fixtures live under `apps/server/salitemiret/fixtures/` until the last of the
  migration audits are retired, but the new SQLAlchemy modules and service
  orchestration live in the same package tree.
- `apps/web/src/` – React 18 client code: RBAC context, protected routes, API
  client utilities, and feature shells. 【F:apps/web/src/context/RBACContext.tsx†L1-L95】【F:apps/web/src/components/ProtectedRoute.tsx†L1-L45】
- `specs/001-core-plan/` – Signed-off specification pack, OpenAPI contract, and
  quickstart used to keep the backend and frontend in sync. 【F:specs/001-core-plan/contracts/openapi.yaml†L1-L80】【F:specs/001-core-plan/quickstart.md†L1-L48】
- `docs/spec-kit/` – Architecture, operations, and module-level briefs that
  describe the system constraints and delivery roadmap. 【F:docs/spec-kit/01-architecture.md†L1-L40】【F:docs/spec-kit/implementation-plan.md†L1-L32】

## Tech stack

| Tier | Technologies |
| ---- | ------------ |
| Backend | Python 3.11, SQLAlchemy 2.x, Alembic, PostgreSQL 15, Pydantic models, HTTP service layer with typed handlers |
| Frontend | TypeScript 5, React 18, TanStack Query, React Router, Tailwind CSS, shadcn/ui, i18next |
| Tooling & QA | pytest, tox, Alembic autogenerate, OpenAPI linting, Vitest + React Testing Library, Playwright |

> The source of truth for supported versions and dependency pins lives in the
> quickstart and specification pack. 【F:specs/001-core-plan/quickstart.md†L3-L48】

## Backend service

### Architecture overview

The API service models each domain aggregate (members, sponsorships, payments,
volunteers, councils, schools, media, reports) with SQLAlchemy declarative
classes. Repository-style units encapsulate query logic and are orchestrated by
service modules that implement use cases such as onboarding a member or
correcting a payment. Public handlers map cleanly to the OpenAPI contract under
`specs/001-core-plan/contracts/`, returning Pydantic response objects that ensure
schema parity between the Python layer and the TypeScript client. 【F:specs/001-core-plan/contracts/openapi.yaml†L1-L80】

### Database & migrations

PostgreSQL is the system of record. Alembic tracks every schema change under the
`alembic/versions/` directory alongside migration stubs for data backfills. The
migrations include repeatable seeds for RBAC personas so that environments stay
aligned during rollouts. Typical workflow:

```bash
# Create a new revision
alembic revision -m "add sponsorship pledge caps"

# Apply all pending migrations
alembic upgrade head
```

Database URLs are provided via environment variables, and local development uses
Docker Compose to provision Postgres with matching extensions (UUID, pgcrypto).

### Testing

Pytest covers migrations, repositories, and service flows. Existing RBAC tests
under `apps/server/salitemiret/salitemiret/tests/` remain in place to ensure the
new API preserves the deny-by-default semantics introduced during the Frappe
phase. These tests will gradually be ported to hit the HTTP layer directly as
handlers land. 【F:apps/server/salitemiret/salitemiret/tests/test_auth_rbac.py†L1-L140】

### Operations

CI runs alembic upgrades, unit tests, and OpenAPI conformance checks before
shipping Docker images. Deployment rollouts run database migrations in the same
pipeline stage as container updates so that schema changes and code always move
in lockstep. Observability hooks (structured logging + tracing IDs) follow the
requirements outlined in the spec kit operations brief. 【F:docs/spec-kit/11-observability.md†L1-L80】【F:docs/spec-kit/10-operations-and-backups.md†L1-L80】

## Frontend (React) client

### RBAC context & hooks

`RBACProvider` issues a WhoAmI request with TanStack Query, caches session roles,
and exposes helper hooks so components can evaluate personas on demand.
`useRBAC` wraps the context with ergonomic utilities for boolean role checks,
overrides, and persona-specific gating. 【F:apps/web/src/context/RBACContext.tsx†L1-L95】【F:apps/web/src/hooks/useRBAC.ts†L1-L29】

### Guards & routing

- `RoleGate` wraps arbitrary UI fragments and enforces allow/forbid rules with
  sensible loading and fallback states. 【F:apps/web/src/components/RoleGate.tsx†L1-L41】
- `ProtectedRoute` integrates with React Router to guard navigation and redirect
  unauthorized users. 【F:apps/web/src/components/ProtectedRoute.tsx†L1-L43】
- `PRAdminDemoRoute` demonstrates how to wire persona-only content with the gate
  primitives. 【F:apps/web/src/routes/PRAdminDemoRoute.tsx†L1-L16】

TypeScript RBAC types live under `apps/web/src/types/rbac.ts`, keeping the client
aligned with the personas seeded by migrations. API utilities remain in
`apps/web/src/api/` and will be pointed at the new Postgres-backed service once
its authentication envelope is finalized. 【F:apps/web/src/types/rbac.ts†L1-L16】【F:apps/web/src/api/client.ts†L1-L33】

## Getting started

1. **Install dependencies**
   - Backend: `pyenv install 3.11.x && pip install -r requirements.txt` (or
     `uv sync` if using uv).
   - Frontend: `pnpm install`.
2. **Provision Postgres** – `docker compose up db` seeds a development database
   with role fixtures. Update `.env` with the DSN exposed in Compose.
3. **Run migrations** – `alembic upgrade head` to align the schema.
4. **Start services**
   - Backend: `uvicorn salitemiret.app:app --reload` (or the equivalent entry
     point configured for the API service).
   - Frontend: `pnpm dev` to serve the React client with hot reload.
5. **Log in** – Use the seeded personas to exercise RBAC. The React app boots by
   calling the WhoAmI endpoint and will render persona-specific navigation as
   soon as the HTTP layer responds.

## Testing

- Backend unit/integration: `pytest`
- Database migrations: `alembic upgrade head --sql` for dry runs, plus `pytest
  tests/migrations` for data assertions.
- Frontend unit: `pnpm test`
- Frontend e2e: `pnpm test:e2e`
- Contract linting: `pnpm lint:openapi --file specs/001-core-plan/contracts/openapi.yaml`

## Additional documentation

The `docs/spec-kit` folder captures the product vision, architecture decisions,
module requirements, operations guidelines, and testing strategy that govern the
ongoing migration to the Postgres/Alembic backend. Use these artifacts to keep
implementation choices aligned with the approved scope. 【F:docs/spec-kit/00-product-vision.md†L1-L40】【F:docs/spec-kit/06-testing-strategy.md†L1-L80】
