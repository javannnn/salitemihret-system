# Development Standards

## Tooling & Linters
- **Frontend**: ESLint (Airbnb + React rules), Stylelint (Tailwind plugin), and
  Prettier for formatting.
- **Backend**: Ruff for linting, Black for formatting, MyPy for type checks on
  Python modules.
- **Git Hooks**: pre-commit runs lint, format, and security scans prior to push.

## Coding Conventions
- TypeScript interfaces mirror the backend Pydantic schemas. Shared DTOs live in
  `frontend/src/api/types.ts`; keep them in sync with `server/app/schemas/*`.
- React components use function components with hooks; state management via
  TanStack Query and local component state only.
- Python modules follow FastAPI conventions: routers in `app/routers/`,
  services under `app/services/`, models under `app/models/`, and background job
  helpers under `app/services/*`.
- Avoid direct SQL except inside Alembic migrations or read-only reporting views
  (SQL files under `server/app/reporting/`).

## Commit Hygiene
- Follow Conventional Commits (`feat`, `fix`, `docs`, `chore`, `refactor`,
  `test`, `ci`).
- Reference relevant Spec IDs or module acceptance criteria in commit body.
- Commit small, logical units; avoid mixing feature and refactor in same commit.

## Database Migrations
- Use Alembic revisions (`server/alembic/versions/`). One migration per PR unless
  there is a compelling reason to batch.
- Always include idempotent guards when altering enums or data.
- Document downgrade feasibility; if irreversible, call it out in the migration
  docstring and PR.

## Feature Flags & Toggles
- Configurable toggles stored in `salitemiret/feature_flags.py` and persisted via
  `System Settings`.
- Flags require documentation, default state, and removal plan within 2 release
  cycles.

## Fixtures & Seed Data
- Canonical seed script lives in `server/app/scripts/seed_demo.py`; update it
  whenever schema or lookup tables change.
- JSON/CSV fixtures for tests live under `server/tests/fixtures/` and
  `frontend/tests/fixtures/`. No PII allowed.
- Reference data (tags, ministries, payment service types) should be inserted
  via Alembic migrations to keep environments aligned.

## Documentation Expectations
- Update relevant Spec Kit module and API docs when introducing new workflows.
- Inline code comments reserved for complex business logic; prefer descriptive
  function names.
- Each PR must link to updated documentation or state "docs not required" with
  justification.

## Review Checklist
- Tests added/updated and passing.
- Security implications analyzed (authz, PII exposure).
- Performance impact measured against budgets.
- Observability updates (logs, metrics, audit events) included.
- Translations provided for both English and Amharic copy.
