# Development Standards

## Tooling & Linters
- **Frontend**: ESLint (Airbnb + React rules), Stylelint (Tailwind plugin), and
  Prettier for formatting.
- **Backend**: Ruff for linting, Black for formatting, MyPy for type checks on
  Python modules.
- **Git Hooks**: pre-commit runs lint, format, and security scans prior to push.

## Coding Conventions
- TypeScript interfaces generated from DocType schemas; avoid duplicate manual
  types.
- React components use function components with hooks; state management via
  TanStack Query and local component state only.
- Python modules follow Frappe best practices: services under `salitemiret/api/`,
  jobs under `salitemiret/background_jobs/`, validations in DocType classes.
- Avoid direct SQL except in migration patches or read-only reporting views.

## Commit Hygiene
- Follow Conventional Commits (`feat`, `fix`, `docs`, `chore`, `refactor`,
  `test`, `ci`).
- Reference relevant Spec IDs or module acceptance criteria in commit body.
- Commit small, logical units; avoid mixing feature and refactor in same commit.

## Database Migrations
- Use Frappe patches for schema changes, stored under
  `salitemiret/patches/<module>/` with descriptive filenames.
- Include idempotency guard in every patch.
- Provide rollback notes when destructive changes occur.

## Feature Flags & Toggles
- Configurable toggles stored in `salitemiret/feature_flags.py` and persisted via
  `System Settings`.
- Flags require documentation, default state, and removal plan within 2 release
  cycles.

## Fixtures & Seed Data
- Canonical fixtures stored in `apps/salitemiret/fixtures/`. Include roles,
  workflow states, and default translations.
- Fixtures updated via `bench export-fixtures` and version-controlled.
- Test-only fixtures live under `tests/fixtures/` and must not contain PII.

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
