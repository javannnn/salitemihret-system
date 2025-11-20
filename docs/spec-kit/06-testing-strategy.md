# Testing Strategy

## Objectives
- Guarantee data integrity across membership, financial, and media workflows.
- Ensure role-based authorization holds for every endpoint and UI flow.
- Validate performance budgets under realistic load.
- Provide confidence for multilingual experiences and import tooling.

## Test Layers
### Front-End
- **Unit Tests**: React Testing Library with Vitest. Cover form validation,
  drawer logic, TanStack Query hooks, and localization toggles.
- **Component Visual Diffs**: Chromatic or Storybook snapshots to maintain
  Neo-Lumina styling.
- **End-to-End (E2E)**: Cypress running against staging nightly and in CI smoke
  suite. Scenarios include import stepper, status approval, payment correction,
  media approval publishing, and volunteer logging.
- **Accessibility**: axe-core checks integrated into Cypress flows.

### Back-End
- **Unit Tests**: Python `pytest` targeting SQLAlchemy models, services, and
  Pydantic schemas. Use the in-memory Postgres fixture (`tests/conftest.py`) to
  validate constraints and soft-delete behaviors.
- **Integration Tests**: FastAPI `TestClient` + httpx sessions hit real routers
  (`/members`, `/payments`, `/sponsorships`). Focus on imports, status
  suggestion logic (six-month streaks, turning-18 automation), and sponsorship
  reminder workflows.
- **Background Jobs**: APScheduler tasks executed via dependency injection,
  simulating promotion digests and finance reminders with frozen time to assert
  scheduling cadence.

### Cross-Cutting
- **Authorization Matrix**: Automated suite iterates through roles executing key
  endpoints to assert deny-by-default enforcement.
- **Localization Regression**: Snapshot comparisons for English/Amharic content
  and number/date formatting.
- **Data Migration Tests**: When schema changes require patches, include tests to
  verify data backfills and rename logic.

## Performance & Load Testing
- **API Load**: k6 scripts simulate 200 concurrent users performing member
  searches, status approvals, and payments entry. Target <400ms p95 REST latency.
- **Import Throughput**: Simulate 5,000-row imports to confirm completion within
  15 minutes and error CSV availability.
- **Dashboard TTI**: Lighthouse CI ensures admin dashboard time-to-interactive
  under 4 seconds on simulated 3G network.

## User Acceptance Testing (UAT)
- Conducted in staging with fixtures representing real ministries.
- Each persona executes predefined scripts:
  - Parish Registrar: import new family, reconcile suggestions, archive inactive
    member.
  - PR Admin: approve contribution streak, receive child-turning-18 alert.
  - Finance Clerk: record payment and submit correction.
  - Media Coordinator: progress request from draft to published.
  - Volunteer Coordinator: log service hours, export report.
- Capture findings in UAT checklist; unresolved issues block production release.

## Regression Strategy
- Full regression run before every production deployment.
- Smoke suite (status suggestions, payments, imports, media) must pass on each
  pull request via GitHub Actions.

## Test Data Management
- Fixtures sanitized to remove PII. Randomized data for load tests to prevent
  caching artifacts.
- Import test files stored under `tests/fixtures/imports/` with bilingual columns.
- Background jobs recorded with deterministic IDs for assertion.

## Reporting & Coverage
- Jest/Vitest coverage target: 85% statements for frontend.
- Pytest coverage target: 80% statements for backend.
- CI publishes coverage reports and fails if thresholds not met.
- Test results exported to `docs/reports/testing/` for audit readiness.
