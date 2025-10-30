# Implementation Plan: Core Plan RBAC Baseline

**Branch**: `001-auth-rbac-baseline` | **Date**: 2025-10-30 | **Spec**: specs/001-core-plan/spec.md
**Input**: Feature specification from `/specs/001-core-plan/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Bootstrap the SaliteMihret RBAC foundation by codifying deny-by-default permissions, exposing persona-aware session metadata, and wiring frontend route guards so P1 slices can ship independently with auditable access controls.

## Technical Context

**Language/Version**: Python 3.11 (Frappe v14), TypeScript 5.x with React 18
**Primary Dependencies**: Frappe framework, MariaDB, Redis background workers, TanStack Query, Vite, Tailwind CSS, i18next
**Storage**: MariaDB 10.6 (DocTypes), Redis queues
**Testing**: pytest via Frappe test runner, Vitest + React Testing Library, Playwright for E2E
**Target Platform**: Linux server (Frappe bench), modern evergreen browsers for admin UI
**Project Type**: Web application (Frappe backend + React admin frontend)
**Performance Goals**: REST p95 ≤400 ms, background jobs ≤5 min, whoami bootstrap ≤200 ms
**Constraints**: Deny-by-default RBAC, WCAG AA baseline, EN/Amharic parity, audit events for all privileged actions
**Scale/Scope**: Up to 150 concurrent admin sessions; persona list per spec (8 roles)

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
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── server/
│   └── salitemiret/
│       ├── salitemiret/
│       │   ├── api/
│       │   ├── config/
│       │   ├── doctype/
│       │   ├── jobs/
│       │   └── tests/
│       └── fixtures/
└── web/
    └── src/
        ├── api/
        ├── components/
        ├── context/
        ├── hooks/
        ├── routes/
        └── types/
```

**Structure Decision**: Dual-app monorepo (Frappe backend under `apps/server/salitemiret`, Vite/React frontend under `apps/web/src`) with shared Spec Kit documentation in `specs/001-core-plan`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | - | - |
