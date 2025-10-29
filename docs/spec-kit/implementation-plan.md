# Implementation Plan Overview

This delivery roadmap sequences system work across ten execution days, ensuring
Auth/RBAC foundations precede module feature builds and that operational
hardening closes the iteration. Workstreams reference concrete code locations in
the `salitemihret-system` monorepo (Frappe app under `apps/salitemiret/` and
React client under `frontend/`).

## Day-by-Day Breakdown

### Day 1 – Auth & RBAC Baseline
- Define role profiles and permissions in `apps/salitemiret/fixtures/role.json`
  (Parish Registrar, PR Administrator, Finance Clerk, Media Coordinator, Sunday
  School Lead, Volunteer Coordinator, Council Secretary).
- Implement RBAC deny-by-default rules in `apps/salitemiret/hooks/permission.py`
  and DocType-specific permission files (`apps/salitemiret/doctype/*/*_permission.py`).
- Configure 2FA policies and session limits in `apps/salitemiret/hooks.py`
  (`before_request` handlers for CSRF and TTL enforcement).
- Create audit scaffolding:
  - `apps/salitemiret/doctype/audit_event/audit_event.py`
  - Background job logging utilities in `apps/salitemiret/api/audit.py`.
- Frontend: scaffold auth context in `frontend/src/providers/AuthProvider.tsx`
  and secure route wrappers in `frontend/src/routes/ProtectedRoute.tsx`.

### Day 2 – Membership Core
- Build `Member`, `Family Member`, and `Member Status History` DocTypes with
  validations (`apps/salitemiret/doctype/member/`, etc.).
- Add REST serializers and hook overrides where necessary
  (`apps/salitemiret/api/members.py`).
- Implement React membership list and drawer
  (`frontend/src/features/membership/MemberList.tsx`,
  `MemberDrawer.tsx`).
- Seed sample fixtures for initial members in
  `apps/salitemiret/fixtures/member.json`.

### Day 3 – Membership Imports & Automations
- Implement import endpoints: `members.download_template`,
  `members.preview_import`, `members.import_members` in
  `apps/salitemiret/api/members_import.py` using `openpyxl`.
- Configure background queue workers in
  `apps/salitemiret/background_jobs/imports.py`.
- Build React import stepper at
  `frontend/src/features/membership/MemberImportStepper.tsx` and integrate job
  polling.
- Add status suggestion cron jobs in
  `apps/salitemiret/background_jobs/status_rules.py`; ensure audit emissions.

### Day 4 – Payments Module
- Create `Payment` DocType with correction logic in
  `apps/salitemiret/doctype/payment/payment.py`.
- Implement correction endpoint and ledger export in
  `apps/salitemiret/api/payments.py`.
- Develop UI: payments table and correction modal in
  `frontend/src/features/payments/PaymentsPage.tsx` and `PaymentCorrectionDialog.tsx`.
- Add automated tests (pytest) under `apps/salitemiret/tests/payments/test_payments.py`.

### Day 5 – Sponsorships & Newcomers
- Build `Sponsorship` DocType, child tables, and pledge adjustment hooks in
  `apps/salitemiret/doctype/sponsorship/`.
- Implement `Newcomer` DocType and conversion service in
  `apps/salitemiret/api/newcomers.py`.
- React: Sponsorship and newcomer Kanban/drawers in
  `frontend/src/features/sponsorships/` and `frontend/src/features/newcomers/`.
- Add scheduled jobs for pledge reminders and newcomer digests under
  `apps/salitemiret/background_jobs/stewardship.py`.

### Day 6 – Schools (Abenet & Sunday School)
- Create DocTypes: `Abenet Enrollment`, `Sunday School Enrollment`, `Lesson`,
  `Mezmur` (`apps/salitemiret/doctype/<name>/`).
- Implement promotion endpoint and notifications in
  `apps/salitemiret/api/schools.py`.
- React: enrollment dashboards and attendance forms in
  `frontend/src/features/schools/`.
- Configure child-turns-18 automation job in
  `apps/salitemiret/background_jobs/age_transitions.py`.

### Day 7 – Volunteers
- Define `Volunteer Group`, `Volunteer`, `Service Log` DocTypes with validations.
- Implement engagement report endpoint
  (`apps/salitemiret/api/volunteers.py`) and inactivity scheduled job.
- Build UI for group management and service logging at
  `frontend/src/features/volunteers/`.
- Add tests for inactivity digest and report export.

### Day 8 – Media Pipeline
- Finalize `Media Request` and `Public Post` DocTypes and workflow actions.
- Implement whitelisted method `media.public_feed` and approval automation in
  `apps/salitemiret/api/media.py`.
- React: media request board, approval drawer, and public feed preview in
  `frontend/src/features/media/`.
- Configure CDN invalidation webhook integration under
  `apps/salitemiret/integrations/cdn.py`.

### Day 9 – Reporting Layer
- Create SQL views (`apps/salitemiret/reporting/sql/`) and Frappe reports.
- Implement report execution and scheduling APIs in
  `apps/salitemiret/api/reports.py`.
- React: report catalog and scheduling UI in
  `frontend/src/features/reports/`.
- Add cron jobs for scheduled deliveries and integrate email templates.

### Day 10 – Hardening & Cross-Cutting Enhancements
- Internationalization: finalize `frontend/src/locales/{en,am}/` bundles and
  translation QA.
- Accessibility: axe-core tests, focus management adjustments, high-contrast
  toggle.
- Observability: ensure JSON log schema implemented, add Prometheus exporters,
  wire Sentry tracing baggage.
- Backups & DR: verify `ops/docker/compose.prod.yaml` includes backup jobs,
  update runbooks in `docs/runbooks/`.
- Final compliance review against constitution gates; update documentation and
  fixtures.

## Deliverables Summary
- Complete DocType definitions, APIs, and background jobs per module.
- React features with import steppers, drawers, and dashboards aligned to Neo-Lumina design language.
- Reporting and observability infrastructure ready for production monitoring.
- Hardening tasks (i18n, accessibility, backups, observability) finalized by Day 10.

