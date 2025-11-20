# Implementation Plan Overview

This roadmap sequences work across ten execution days. Auth/RBAC foundations
come first, followed by module slices (Membership → Payments → Sponsorships →
Schools/Volunteers → Media → Reporting). Each workstream references concrete
paths in the FastAPI + React monorepo (`server/` + `frontend/`). Legacy Frappe
code under `apps/` is archived and not part of this delivery.

## Day-by-Day Breakdown

### Day 1 – Auth & RBAC Baseline
- Define role profiles in `server/app/models/role.py` + Alembic seed migration.
- Harden auth flows in `server/app/routers/auth.py` and `app/auth/security.py`
  (JWT issuance, bcrypt password hashing).
- Implement deny-by-default guards in `app/auth/deps.py` (`require_roles`) and
  wire them into every router as dependencies.
- Create audit scaffolding: `app/models/member_audit.py`,
  `app/services/audit.py`, and `app/routers/whoami.py`.
- Frontend: scaffold auth context in `frontend/src/providers/AuthProvider.tsx`
  and protected routes in `frontend/src/routes/ProtectedRoute.tsx`.

### Day 2 – Membership Core
- Build SQLAlchemy models for `Member`, `Household`, `MemberStatusHistory`,
  `Tag`, `Ministry`, `Priest` under `server/app/models/`.
- Add CRUD + list endpoints in `app/routers/members.py` plus helper services in
  `app/services/members_query.py` and `members_utils.py`.
- Seed demo members via `app/scripts/seed_demo.py`.
- React: Membership list/drawer components in
  `frontend/src/features/membership/MemberList.tsx` and
  `MemberDrawer.tsx`, including chip-based inputs for statuses/tags.

### Day 3 – Membership Imports & Automations
- Implement import endpoints in `app/routers/members_bulk.py` and file uploads
  in `app/routers/members_files.py` using streaming CSV validation.
- Build import service (`app/services/members_import.py`) backed by
  APScheduler job hooks for async processing.
- React import stepper at
  `frontend/src/features/membership/MemberImportStepper.tsx` with job polling.
- Add status suggestion/child promotion jobs in
  `app/services/child_promotion.py` and scheduler wiring in `app/main.py`.

### Day 4 – Payments Module
- Finalize `Payment`, `PaymentDayLock`, and `PaymentServiceType` models plus
  Alembic migrations.
- Implement routes in `app/routers/payments.py` (CRUD, corrections, exports,
  day locks) with shared logic in `app/services/payments.py`.
- React payments workspace in `frontend/src/features/payments/`
  (ledger table, correction modal, export/download wiring).
- Pytest coverage for payment recording, correction validation, and export CSV
  generation under `server/tests/payments/`.

### Day 5 – Sponsorships & Newcomers
- Create SQLAlchemy models (`sponsorship.py`, `newcomer.py`) and link them to
  members.
- Routes: `app/routers/sponsorships.py` (pledges, reminders, adjustments) and
  `app/routers/newcomers.py` (intake + conversion).
- Services: `app/services/sponsorships.py` for pledge math/reminders.
- React: Sponsorship board + newcomer pipeline in
  `frontend/src/features/sponsorships/` and `frontend/src/features/newcomers/`.
- APScheduler jobs for pledge reminders + newcomer digests.

### Day 6 – Schools (Abenet & Sunday School)
- Models: `app/models/lesson.py`, `app/models/mezmur.py`,
  `app/models/abenet_enrollment.py`, `app/models/sunday_school_enrollment.py`.
- Routes and services under `app/routers/schools.py` and
  `app/services/schools.py` for enrollments, promotions, and notifications.
- React: Enrollment dashboards + child promotion workflow in
  `frontend/src/features/schools/`.
- Extend child-turns-18 automation to notify PR Admin + Registrar.

### Day 7 – Volunteers
- Models for `VolunteerGroup`, `Volunteer`, `ServiceLog`.
- Router `app/routers/volunteers.py` with engagement report endpoints and
  inactivity digest scheduling.
- React volunteer management UI in `frontend/src/features/volunteers/`
  (group management, service logging, reporting).
- Tests for inactivity digest service and CSV export.

### Day 8 – Media Pipeline
- Models `MediaRequest`, `PublicPost`, and media asset tables.
- Router `app/routers/media.py` for request lifecycle, approvals, and public
  feed.
- Integration with CDN invalidation helpers in `app/services/media.py`.
- React: Media Kanban board, approval drawer, and public feed preview in
  `frontend/src/features/media/`.

### Day 9 – Reporting Layer
- Build SQL views/materialized views in `server/app/reporting/sql/` and map to
  read-only SQLAlchemy models.
- Router `app/routers/reports.py` + services for execution, CSV export, and
  scheduling (APScheduler jobs + email templates).
- React report catalog/filter drawer/scheduling UI in
  `frontend/src/features/reports/`.

### Day 10 – Hardening & Cross-Cutting Enhancements
- **Internationalization**: finalize `frontend/src/locales/{en,am}/`, add copy
  review, and ensure fallback coverage.
- **Accessibility**: axe-core automation, focus outlines, high-contrast toggle.
- **Observability**: confirm JSON logging schema, add Prometheus exporters, wire
  Sentry tracing baggage.
- **Backups & DR**: verify backup cron/systemd units, refresh runbooks in
  `docs/runbooks/`, and document restoration drills.
- **Docs & QA**: update Spec-Kit, API contracts, QA checklists, and ensure
  constitution gates remain green.

## Deliverables Summary
- FastAPI modules, services, and Alembic migrations for every domain slice.
- React UI flows for membership, payments, sponsorships, schools, volunteers,
  media, and reporting (modern Neo-Lumina UX, chip-based controls).
- Import/export toolchains with audit trails and observability wiring.
- Operational readiness: observability, backups, accessibility, localization,
  and deployment scripts completed by Day 10.
