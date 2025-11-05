# SaliteMihret System

The SaliteMihret system is an in-progress monorepo that couples a Frappe 15 backend with a React/TanStack Query admin surface. The initial deliverable focuses on bootstrapping a role-based access control (RBAC) baseline so that future member management, payments, sponsorship, and reporting modules inherit deny-by-default permissions out of the box. 【F:apps/server/salitemiret/salitemiret/api/auth.py†L23-L67】【F:apps/server/salitemiret/salitemiret/permissions.py†L1-L48】

## Repository layout

- `apps/server/salitemiret/` – Core Frappe app that ships curated fixtures, permission guards, and API endpoints for the RBAC baseline, plus pytest coverage for the fixture integrity. 【F:apps/server/salitemiret/fixtures/role.json†L1-L10】【F:apps/server/salitemiret/salitemiret/tests/test_auth_rbac.py†L1-L140】
- `apps/web/src/` – React 18 components, hooks, and API utilities that hydrate RBAC state with TanStack Query and enforce guards in routing or component trees. 【F:apps/web/src/context/RBACContext.tsx†L1-L95】【F:apps/web/src/components/ProtectedRoute.tsx†L1-L45】
- `specs/001-core-plan/` – Approved specification pack containing the research, plan, and quickstart workflows for the wider platform rollout. 【F:specs/001-core-plan/plan.md†L1-L120】【F:specs/001-core-plan/quickstart.md†L1-L48】

## Tech stack

| Tier | Technologies |
| ---- | ------------ |
| Backend | Python 3.11, Frappe 15, MariaDB 10.6, Redis workers, MinIO/S3 for object storage |
| Frontend | TypeScript 5, React 18, TanStack Query, React Router, Tailwind CSS, shadcn/ui, i18next |
| Tooling & QA | pytest (bench runner), Vitest + React Testing Library, Playwright, OpenAPI linting |

> Refer to the Quickstart for the canonical versions, setup steps, and test-first workflow that the plan mandates. 【F:specs/001-core-plan/quickstart.md†L3-L45】

## Backend (Frappe) details

### RBAC fixtures

The repo seeds eight core personas and grants controlled access to the Role Permission Matrix DocTypes through fixtures that can be re-exported with `bench --site <site> export-fixtures --app salitemiret` after edits. 【F:apps/server/salitemiret/fixtures/role.json†L1-L10】【F:apps/server/salitemiret/fixtures/custom_docperm.json†L1-L69】

### Permission hooks

`salitemiret.permissions` centralizes deny-by-default helpers that Frappe resolves when deciding whether a user can touch the Role Permission Matrix or its entries. System Managers retain full CRUD while PR Administrators get read-only insight for governance audits. 【F:apps/server/salitemiret/salitemiret/permissions.py†L13-L48】

### WhoAmI API

`salitemiret.api.auth.whoami` returns a compact payload (user id, full name, roles, derived personas) for the current session. The function works inside Bench and in isolated tests thanks to a safe `frappe.whitelist` shim. 【F:apps/server/salitemiret/salitemiret/api/auth.py†L13-L67】

### Tests

`pytest`-based tests validate fixture integrity, permission semantics, and the WhoAmI response contract without requiring a running Frappe instance. The suite monkeypatches `frappe` so it can run in CI or local Python without Bench. 【F:apps/server/salitemiret/salitemiret/tests/test_auth_rbac.py†L19-L140】

## Frontend (React) details

### RBAC context & hook

`RBACProvider` issues the WhoAmI request via TanStack Query, deduplicates roles, and exposes helpers for local overrides—handy for Storybook or unit tests. Consumers call `useRBAC` to check roles, adjust overrides, or ask for complex authorization checks. 【F:apps/web/src/context/RBACContext.tsx†L8-L95】【F:apps/web/src/hooks/useRBAC.ts†L1-L29】

### Guards & routes

- `RoleGate` wraps arbitrary UI fragments and enforces allow/forbid/complex rule sets, showing loading or fallback states when appropriate. 【F:apps/web/src/components/RoleGate.tsx†L7-L41】
- `ProtectedRoute` integrates with React Router to restrict navigation and redirect unauthorized users. 【F:apps/web/src/components/ProtectedRoute.tsx†L8-L43】
- `PRAdminDemoRoute` demonstrates wiring by locking content behind the “PR Administrator” persona. 【F:apps/web/src/routes/PRAdminDemoRoute.tsx†L5-L16】

The RBAC types align with the backend fixtures so role mismatches surface during compilation. 【F:apps/web/src/types/rbac.ts†L1-L16】

### API client

`fetchWhoAmI` calls the Frappe endpoint with cookie auth, gracefully handling the envelope variations that Frappe methods return (plain payload, `message`, or `data`). 【F:apps/web/src/api/client.ts†L3-L38】

## Getting started

1. Follow the Quickstart prerequisites and environment bootstrap instructions for Bench and pnpm. 【F:specs/001-core-plan/quickstart.md†L3-L21】
2. Export/import fixtures whenever RBAC roles change so that sites stay synchronized. 【F:apps/server/salitemiret/README.md†L10-L18】
3. Mount `RBACProvider` within a `QueryClientProvider` and reuse `ProtectedRoute`/`RoleGate` to enforce RBAC in the admin shell. 【F:specs/001-core-plan/quickstart.md†L45-L48】【F:apps/web/src/index.ts†L1-L8】

## Testing

- Backend: `bench --site salitemihret.local run-tests --app salitemiret --module salitemiret.salitemiret.tests.test_auth_rbac`
- Frontend unit: `pnpm test`
- Frontend e2e: `pnpm test:e2e`
- Contracts: `pnpm lint:openapi --file specs/001-core-plan/contracts/openapi.yaml`

Refer to the Quickstart for the expected test order in CI pipelines. 【F:apps/server/salitemiret/README.md†L26-L36】【F:specs/001-core-plan/quickstart.md†L16-L21】

## Additional documentation

The `specs/001-core-plan` folder captures the approved architecture, data model, research notes, and validation matrix that govern future phases (members, payments, sponsorship, schools, volunteers, media, councils, reporting). Use these artifacts to align new work with the signed-off scope. 【F:specs/001-core-plan/plan.md†L8-L120】【F:specs/001-core-plan/quickstart.md†L23-L48】

