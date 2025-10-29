# Implementation Plan: Core Plan

**Branch**: `001-core-plan` | **Date**: 2025-10-29 | **Spec**: specs/001-core-plan/spec.md
**Input**: Feature specification from `/specs/001-core-plan/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Deliver SPEC-CORE-001 (SaliteMihret System Phase 1) as an admin-only platform covering members, payments, sponsorships, schools, volunteers, media, councils, and reporting. The solution uses a Frappe (Python) backend with DocTypes, REST endpoints, and background jobs, paired with a React + Tailwind + shadcn/ui administration front-end localized via i18next. Observability (logs, metrics, traces) and backup policy adhere to the Ops spec, with EN/Amharic i18n and WCAG AA accessibility baked into each slice.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Python 3.11 (Frappe 15), TypeScript 5.x with React 18  
**Primary Dependencies**: Frappe framework, MariaDB connector, Redis workers, React, TanStack Query, Tailwind CSS, shadcn/ui, i18next  
**Storage**: MariaDB 10.6 (DocTypes), MinIO/S3-compatible object storage for media assets  
**Testing**: pytest with Frappe test runner, Playwright + Vitest for React admin  
**Target Platform**: Linux (Frappe bench on Ubuntu/Debian), modern evergreen browsers for admin UI  
**Project Type**: Web application (Frappe backend + React admin frontend)  
**Performance Goals**: REST p95 ≤400 ms (p99 ≤1.5 s), 10 000-row imports ≤3 min, background jobs ≤5 min (≤15 min for reporting)  
**Constraints**: 99.5% monthly uptime, WCAG AA compliance, EN/Amharic parity, daily encrypted backups with 35-day retention, full audit logging  
**Scale/Scope**: 150 active admins, 25 000 members, 600 000 payment records/year, 15% annual growth buffer

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **P1: Independent Slice Delivery** — Every user story listed in the spec is independently deliverable, has a unique ID, and acceptance criteria cover isolated validation.
- [x] **P2: Documented Plan-First Execution** — All upstream artifacts (research, spec, plan skeleton) have zero placeholders and received approval prior to implementation planning.
- [x] **P3: Test-First Proof** — Planned tasks include pre-implementation automated tests and identify the CI suites that must fail before coding begins.
- [x] **P4: Observable Operations Discipline** — Observability/operations documents list the instrumentation, runbooks, and validation steps this feature updates.
- [x] **P5: Governance Traceability** — Each artifact records feature identifier, authorship, and amendment date; any missing data has an assigned TODO with owner/due date.

## Project Structure

### Documentation (this feature)

```text
specs/001-core-plan/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
server/
├── apps/
│   └── salitemiret/
│       ├── api/
│       ├── audit/
│       ├── config/
│       ├── doctype/
│       ├── payments/
│       ├── sponsorship/
│       ├── volunteers/
│       └── tests/
└── sites/
    └── common_site_config.json

web/
├── src/
│   ├── features/
│   ├── layouts/
│   ├── lib/
│   └── i18n/
└── tests/ (co-located `__tests__` alongside features)

contracts/
├── members.yaml
├── payments.yaml
└── ...
```

**Structure Decision**: Web application split between `server/` (Frappe bench app `salitemiret`) and `web/` (React admin). OpenAPI specs live under `contracts/` to align with tasks and ensure backend/frontend parity.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | - | - |

## Phase Execution

### Phase 0 — Research & Setup
- **Objectives**: Validate DocType coverage against `docs/spec-kit/03-domain-model.md`, finalize RBAC/audit approach, and baseline shared tooling (bench app, CI, pre-commit, pytest/Vitest harness).
- **Key Activities**: Consolidate schema checklist, capture RBAC matrix decisions, scaffold Frappe app + React admin workspaces, document developer bootstrap instructions.
- **Exit Criteria**: Research.md approved with open questions resolved, bench app builds locally, lint/test tooling executes, constitution gate reaffirmed.

### Phase 1 — Data Model & Contracts
- **Objectives**: Translate feature spec stories into DocTypes (Member, Family Member, Member Status History, Payment, Sponsorship, Newcomer, Sunday School Enrollment, Volunteer Group, Volunteer, Service Log, Media Request, Public Post, Council Department, Council Trainee) and publish aligned OpenAPI contracts.
- **Key Activities**: Author `data-model.md`, generate consolidated OpenAPI (`specs/001-core-plan/contracts/openapi.yaml`), seed DocPerm fixtures, and build a validated quickstart walkthrough.
- **Exit Criteria**: Data model matches Spec Kit definitions, OpenAPI passes linting, quickstart checklist executed successfully, and `/speckit.tasks` backlog reflects the approved structure.

### Phase 2 — UX Shells
- **Objectives**: Deliver admin shell, navigation, role guard, i18n scaffolding, and members/payments core UI slices enabling MVP story coverage.
- **Key Activities**: Implement AuthGate, admin layout, locale toggles, initial TanStack Query integration, and smoke tests for auth/member flows.
- **Exit Criteria**: US1–US3 UI routes functional behind RBAC, base theming polished, Playwright smoke suite green, audit telemetry verified end-to-end.

### Phase 3 — Remaining Modules
- **Objectives**: Complete sponsorship/newcomer, schools, volunteers, media, councils, and reporting modules with background jobs and notifications.
- **Key Activities**: Build module-specific DocTypes/services/UI, wire reminder/inactivity jobs, flesh out media approval + publishing, assemble council dashboards, implement reporting engine + scheduling.
- **Exit Criteria**: Each module passes independent story tests, background workers stable under load test scripts, reporting exports validated against sample datasets.

### Phase 4 — Ops & Hardening
- **Objectives**: Finalize observability, backups, performance tuning, accessibility, and localization parity prior to release.
- **Key Activities**: Configure tracing + metrics exporters, harden backup automation, execute WCAG AA audit, complete Amharic translation QA, run performance benchmarks.
- **Exit Criteria**: Ops runbooks updated, telemetry dashboards populated, accessibility report signed off, performance targets met within documented thresholds.
