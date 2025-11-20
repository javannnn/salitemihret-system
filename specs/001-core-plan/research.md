# Research — Core Plan

## Performance Targets
- **Decision**: Set backend REST endpoints to maintain ≤400 ms p95 latency and ≤1.5 s p99 under 50 concurrent admin users; Member import must process 10 000 rows within 3 minutes; background jobs must complete within their scheduled window (≤5 minutes for reminders, ≤15 minutes for batch reporting).
- **Rationale**: Aligns with BRD expectation of quick admin workflows and the FastAPI performance envelope while respecting the import SLA.
- **Alternatives considered**: 250 ms p95 (rejected: unrealistic without aggressive caching up front), 500 ms p95 (rejected: risks frustrating admins during bulk operations).

## Operational Constraints
- **Decision**: Commit to 99.5% monthly uptime, WCAG AA compliance, dual-language parity (EN/Amharic), daily encrypted backups with 35-day retention, and audit logging for every semantic action.
- **Rationale**: Matches Ops spec expectations and constitution principle IV, while balancing volunteer-staffed operations.
- **Alternatives considered**: 99.9% uptime (rejected: exceeds current infrastructure budget), weekly backups (rejected: conflicts with reporting accuracy requirements).

## Scale & Data Volume
- **Decision**: Plan for 150 active admin users across roles, 25 000 member records, 600 000 payment entries per year, and growth of 15% annually; design SQLAlchemy models + indexes to handle these baselines without re-partitioning.
- **Rationale**: Derived from parish census + sponsorship numbers in BRD; provides buffer for growth and ensures ledger indexing meets reporting needs.
- **Alternatives considered**: 50 000 members baseline (rejected: would force sharding redesign too early), 10 000 payments/year (rejected: underestimates tithe cadence).

## SQLAlchemy Modeling Strategy
- **Decision**: Model each domain entity as a dedicated SQLAlchemy table with explicit naming conventions, leverage Postgres enums for selects, and centralize validation in Pydantic schemas.
- **Rationale**: Keeps migrations explicit (Alembic), enables fine-grained indexes, and preserves auditability without DocType coupling.
- **Alternatives considered**: Reusing legacy DocType exports (rejected: incompatible with FastAPI stack), collapsing entities into JSON columns (rejected: hinders reporting).

## PostgreSQL Indexing & Storage
- **Decision**: Apply composite indexes on frequent filters (status, role, date ranges), enforce UTF-8 encoding, and partition payment ledger via yearly inheritance tables.
- **Rationale**: Ensures reporting and ledger corrections stay performant under projected load.
- **Alternatives considered**: No partitioning (rejected: long-term table scans), per-month partitions (rejected: operational overhead).

## Scheduler & Background Jobs
- **Decision**: Use APScheduler in-process jobs for reminders and digests; isolate job definitions and expose health metrics. Consider Redis-backed task queue in later phases if concurrency needs increase.
- **Rationale**: APScheduler matches the lightweight job requirements and keeps infrastructure minimal while still allowing future Celery adoption.
- **Alternatives considered**: Celery + Redis (rejected for MVP due to added ops load), cron-only scripts (rejected: lacks app context + observability).

## React Admin Architecture
- **Decision**: Use feature folders (`web/src/features/<domain>`) with TanStack Query hooks, shadcn/ui primitives, and Tailwind tokens; enforce ESLint + Prettier + TypeScript strict mode.
- **Rationale**: Keeps UI slices independent per constitution principle I and mirrors tasks structure.
- **Alternatives considered**: Global Redux store (rejected: adds unnecessary complexity), atomic CSS without component library (rejected: slows delivery).

## TanStack Query Usage
- **Decision**: Configure a shared `QueryClientProvider`, use query keys per DocType (`['members', id]`), and leverage optimistic updates only where audit rules allow.
- **Rationale**: Ensures cache consistency while respecting immutable ledger constraints.
- **Alternatives considered**: SWR (rejected: less granular mutation control), manual fetch hooks (rejected: duplicated state logic).

## i18next & Localization
- **Decision**: Structure locale files under `web/src/i18n/locales`, enable ICU message formatting, and integrate detection middleware for admin language preferences.
- **Rationale**: Supports EN/Amharic parity and simplifies future locale addition.
- **Alternatives considered**: React Intl (rejected: heavier migration), keeping strings inline (rejected: fails constitution traceability).

## Observability & Telemetry
- **Decision**: Instrument FastAPI with structured JSON logging, expose Prometheus metrics, trace key workflows via OpenTelemetry, and capture frontend performance marks tied to backend `trace_id`.
- **Rationale**: Satisfies constitution principle IV and ensures ledger corrections/audit flow visibility.
- **Alternatives considered**: Logs-only approach (rejected: insufficient for proactive monitoring), proprietary APM tooling (rejected: budget constraints).

## Testing Strategy
- **Decision**: Use pytest with FastAPI `TestClient` for backend suites, Playwright for end-to-end flows, Vitest + React Testing Library for component coverage, and schemathesis to fuzz REST contracts.
- **Rationale**: Provides failing tests across layers before implementation and integrates cleanly with the FastAPI/React toolchain.
- **Alternatives considered**: Robot Framework (rejected: heavier maintenance), Cypress (rejected: Playwright already standardized in spec kit).

## CI/CD Pipeline
- **Decision**: Adopt GitHub Actions workflows mirroring Spec Kit guidance: lint → test → build per story, plus nightly full-stack run with Alembic migrations and Playwright suites in headless Chromium.
- **Rationale**: Ensures plan-first artifacts gate code changes and keeps feedback loops fast for distributed contributors.
- **Alternatives considered**: Self-hosted Jenkins (rejected: higher ops overhead), GitLab CI (rejected: project currently centralized on GitHub).

## RBAC Baseline
- **Decision**: Implement role/permission tables with FastAPI dependency guards (`require_roles`) and expose `/auth/whoami` for frontend hydration.
- **Rationale**: Keeps persona mapping declarative, satisfies constitution traceability, and supports frontend TanStack Query bootstrapping.
- **Alternatives considered**: Hard-coded role checks in routers (rejected: brittle, difficult to audit); client-side role assumptions (rejected: violates security guidelines).
