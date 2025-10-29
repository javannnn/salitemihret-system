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
- **Auth/RBAC**: deny-by-default; per-module permissions; audit for all semantic actions.
- **Members**: import stepper with error CSV; family linking; status suggestion after 6 paid months; PR approval flow.
- **Payments**: append-only ledger; correction workflow with audit; reports by date/type/source.
- **Sponsorship/Newcomers**: pledges with frequency/budget; newcomer register + conversion; reminder jobs.
- **Schools**: enrollments, class rosters, monthly fee reminders; promotion helpers.
- **Volunteers**: 12 groups, leaders, rosters; service logs; inactivity digest.
- **Media**: request inbox, approve/reject with reason; approved → public feed; rejection notif.
- **Councils**: departments, trainee pipeline; term reports.
- **Reporting**: per-module reports + global dashboards.
- **NFRs**: i18n (EN/Am), perf budgets, backups, logs/metrics/traces.

## Links
- Project spec set: `docs/spec-kit/`
- Architecture & UX principles: `docs/spec-kit/01-architecture.md`, `docs/spec-kit/02-ux-principles.md`
