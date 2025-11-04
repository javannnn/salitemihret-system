# Implementation Plan: Core Platform Pivot

**Branch**: `010-fastapi-pivot` | **Date**: 2025-10-30 | **Spec**: specs/001-core-plan/spec.md  
**Input**: Feature specification from `/specs/001-core-plan/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Pivot the SaliteMihret platform from Frappe to a composable FastAPI + Postgres backend and a modern React (Vite + MUI) frontend. Stand up shared auth/role infrastructure, refactor Spec-Kit artifacts for module delivery, and prepare the Membership slice as the first independently shippable increment.

## Technical Context

**Language/Version**: Python 3.11 (FastAPI), TypeScript 5.x with React 18  
**Primary Dependencies**: FastAPI, SQLAlchemy, Alembic, python-jose, Passlib, PostgreSQL 16, TanStack Query, React Router, Material UI, i18next  
**Storage**: PostgreSQL via SQLAlchemy ORM (AWS RDS target), object storage for media (future modules)  
**Testing**: pytest (API + models), React Testing Library + Vitest, Playwright roadmap for E2E  
**Target Platform**: Containerised services (Docker Compose locally, GitHub Actions + staging cluster for CI/CD)  
**Project Type**: Modular web platform (FastAPI backend + Vite/React admin frontend)  
**Performance Goals**: REST p95 ≤ 250 ms, list endpoints paginated ≤ 1 s for 10k rows, login bootstrap ≤ 150 ms  
**Constraints**: JWT auth with deny-by-default guards, WCAG AA compliance, EN/Amharic localisation, auditable actions, Spec-Kit governance  
**Scale/Scope**: ~150 concurrent admin sessions, module-by-module delivery (Membership, Payments, Sponsorship, etc.)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **P1: Independent Slice Delivery** — Updated module specs map to standalone increments (Membership first).  
- [x] **P2: Documented Plan-First Execution** — Research + plan capture pivot rationale; Frappe artefacts archived but retained for traceability.  
- [x] **P3: Test-First Proof** — Pytest and Vitest baselines defined; CI will block merges until unit/API specs exist per module.  
- [x] **P4: Observable Operations Discipline** — Postgres/uvicorn metrics hooks planned, container observability docs updated.  
- [x] **P5: Governance Traceability** — Each module spec records BRD citations and acceptance criteria; plan references Spec-Kit IDs.

## Project Structure

### Documentation (this feature)

```text
specs/
├── 001-core-plan/
│   ├── plan.md
│   ├── research.md
│   ├── data-model.md
│   ├── quickstart.md
│   ├── contracts/
│   ├── spec.md
│   └── tasks.md
├── membership.md
├── user-management.md
├── payments.md
├── sponsorships.md
├── newcomers.md
├── schools.md
├── volunteers.md
├── media.md
├── councils.md
└── reports.md
```

### Source Code (repository root)

```text
server/
├── app/
│   ├── core/
│   ├── auth/
│   ├── models/
│   ├── schemas/
│   ├── routers/
│   └── main.py
├── alembic/
│   ├── versions/
│   └── env.py
└── scripts/
    └── seed_demo.py
frontend/
├── src/
│   ├── api/
│   ├── auth/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   ├── styles/
│   └── i18n/
└── vite.config.ts
infra/
└── compose.yml
```

**Structure Decision**: Monorepo with FastAPI backend (`server/`), Vite/React frontend (`frontend/`), and shared infrastructure (`infra/`). Legacy Frappe code under `apps/` remains for reference until fully retired.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| None | - | - |
