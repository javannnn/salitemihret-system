# Feature Spec — Core Plan (SPEC-CORE-001)

## Problem / Goal
Deliver SaliteMihret System Phase 1 (system-only) per BRD: Members, Payments, Sponsorships, Newcomers, Schools, Volunteers, Media approvals, Councils, Reporting, RBAC, and full audit trail.

## In Scope
- Admin & Sub-admin workflows per role (Super Admin, Office, PR, Finance, School, Sponsorship, Volunteer, Media/Kahen).
- Member lifecycle incl. family links, status suggestions, import pipeline.
- Payments (contribution/tithe/service/school) incl. immutable ledger + correction workflow.
- Sponsorship management & Newcomer settlement.
- Abenet/Sunday School enrollments + fixed-fee billing.
- Volunteer groups, rosters, service logging.
- Media request → approve → publish (system-originated public feed).
- Councils: departments, trainees, terms.
- Notifications, reporting, i18n (EN/Amharic), accessibility baseline, observability, backups.

## Out of Scope
- Public website (WordPress), external payment gateways, donor portals, LMS/CRM integrations.

## Users & Roles
Super Admin, Office Admin (RO), PR Admin, Finance Admin, School Admin, Sponsorship Admin, Volunteer Coordinator, Media Admin (Kahen).

## Acceptance Criteria (high level)
- **Auth/RBAC**: deny-by-default; per-module permissions; audit events emitted for every semantic action with trace IDs visible in the admin drawer.
- **Members**: import 500-row spreadsheets with downloadable error CSV in <3 minutes; maintain bilingual member profiles; household relationships propagate instantly; status suggestions trigger after six consecutive contributions and age milestones with approval workflow logged in audit events.
- **Payments**: append-only ledger leveraging `correction_of` linkage; finance clerks record adjustments without editing originals; ledger-backed reports reconcile by date/type/source within two minutes.
- **Sponsorship/Newcomers**: pledges track monthly_amount, status, and outstanding balance; newcomer register supports conversion to member with reminder jobs for follow-up ownership.
- **Schools**: Sunday School enrollment ties mezmur assignments and promotion helpers; monthly fee reminders fire automatically; attendance and lesson completion reports export per cohort.
- **Volunteers**: manage volunteer groups, rosters, and service logs with coordinator verification; dashboards flag volunteers approaching inactivity thresholds.
- **Media**: request inbox supports attachments and review workflow; approval auto-creates Public Post within 60 seconds and logs audit events; public preview stays in sync.
- **Councils**: departments manage trainee mentorship history; quarterly governance reports summarize trainee status, audit events, and departmental updates.
- **Reporting**: per-module and cross-module dashboards leverage documented report engine, support scheduling, and reconcile with ledger totals.
- **NFRs**: enforce EN/Am localization, WCAG AA accessibility, performance budgets, daily encrypted backups, and observability (logs/metrics/traces) per Spec Kit.

## Links
- Project spec set: `docs/spec-kit/`
- Architecture & UX principles: `docs/spec-kit/01-architecture.md`, `docs/spec-kit/02-ux-principles.md`
