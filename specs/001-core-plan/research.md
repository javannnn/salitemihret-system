# Research — Core Plan

## Performance Targets
- **Decision**: Set backend REST endpoints to maintain ≤400 ms p95 latency and ≤1.5 s p99 under 50 concurrent admin users; Member import must process 10 000 rows within 3 minutes; background jobs must complete within their scheduled window (≤5 minutes for reminders, ≤15 minutes for batch reporting).
- **Rationale**: Aligns with BRD expectation of quick admin workflows, matches Frappe 15 guidance for DocType-heavy apps, and respects the spec’s import SLA.
- **Alternatives considered**: 250 ms p95 (rejected: unrealistic without aggressive caching up front), 500 ms p95 (rejected: risks frustrating admins during bulk operations).

## Operational Constraints
- **Decision**: Commit to 99.5% monthly uptime, WCAG AA compliance, dual-language parity (EN/Amharic), daily encrypted backups with 35-day retention, and audit logging for every semantic action.
- **Rationale**: Matches Ops spec expectations and constitution principle IV, while balancing volunteer-staffed operations.
- **Alternatives considered**: 99.9% uptime (rejected: exceeds current infrastructure budget), weekly backups (rejected: conflicts with reporting accuracy requirements).

## Scale & Data Volume
- **Decision**: Plan for 150 active admin users across roles, 25 000 member records, 600 000 payment entries per year, and growth of 15% annually; design DocTypes and indexes to handle these baselines without re-partitioning.
- **Rationale**: Derived from parish census + sponsorship numbers in BRD; provides buffer for growth and ensures ledger indexing meets reporting needs.
- **Alternatives considered**: 50 000 members baseline (rejected: would force sharding redesign too early), 10 000 payments/year (rejected: underestimates tithe cadence).

## Frappe DocType Strategy
- **Decision**: Model each domain entity as a Frappe DocType with explicit naming conventions, enable `track_changes`, and configure role-based permissions via DocPerm.
- **Rationale**: Leverages Frappe’s strengths (audit history, RBAC) while reducing custom table management.
- **Alternatives considered**: Using custom SQL tables with ORM wrappers (rejected: loses built-in Frappe features), combining multiple entities into a single DocType (rejected: hampers workflow granularity).

## MariaDB Indexing & Storage
- **Decision**: Apply composite indexes on frequent filters (status, role, date ranges), enforce utf8mb4 encoding, and partition payment ledger by fiscal year using MariaDB virtual columns.
- **Rationale**: Ensures reporting and ledger corrections stay performant under projected load.
- **Alternatives considered**: No partitioning (rejected: long-term table scans), per-month partitions (rejected: operational overhead).

## Redis Background Jobs
- **Decision**: Use Frappe background workers with Redis for reminder jobs, digests, and imports; isolate queues (`long`, `default`, `short`) and monitor queue depth via Prometheus exporter.
- **Rationale**: Matches plan.md tasks and keeps long-running jobs from blocking interactive requests.
- **Alternatives considered**: Celery-based workers (rejected: duplicates Frappe tooling), single shared queue (rejected: risks starvation).

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
- **Decision**: Instrument Frappe with structured logging (JSON), expose metrics via StatsD/Prometheus bridge, and trace key workflows using OpenTelemetry; on the frontend, capture important interactions with browser performance marks.
- **Rationale**: Satisfies constitution principle IV and ensures ledger corrections/audit flow visibility.
- **Alternatives considered**: Logs-only approach (rejected: insufficient for proactive monitoring), proprietary APM tooling (rejected: budget constraints).

## Testing Strategy
- **Decision**: Use pytest via Frappe’s bench runner for backend unit/integration suites, Playwright for end-to-end flows, Vitest + React Testing Library for component coverage, and schemathesis to fuzz REST contracts.
- **Rationale**: Provides failing tests across layers before implementation, aligns with constitution principle III, and integrates with existing Frappe tooling.
- **Alternatives considered**: Robot Framework (rejected: heavier maintenance), Cypress (rejected: Playwright already standardized in spec kit).

## CI/CD Pipeline
- **Decision**: Adopt GitHub Actions workflows mirroring Spec Kit guidance: lint → test → build per story, plus nightly full-stack run with bench migrations and Playwright suites in headless Chromium.
- **Rationale**: Ensures plan-first artifacts gate code changes and keeps feedback loops fast for distributed contributors.
- **Alternatives considered**: Self-hosted Jenkins (rejected: higher ops overhead), GitLab CI (rejected: project currently centralized on GitHub).
