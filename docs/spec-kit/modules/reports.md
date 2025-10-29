# Reports Module

## Purpose
Provide cross-cutting analytics and exports spanning membership, finance,
ministries, and governance to support decision-making and compliance.

## Roles & Permissions
- **Council Secretary**: Full access to all reports.
- **Parish Registrar / PR Administrator / Finance Clerk / Media Coordinator /
  Volunteer Coordinator**: Access scoped to their domain reports.

## Fields & Data Model
| Report | Source | Notes |
|--------|--------|-------|
| Membership roster | `member_profile_view` | Denormalized view with status, household, language.
| Finance ledger | `Payment` | Includes correction metadata.
| Volunteer engagement | `volunteer_engagement_view` | Aggregated hours.
| Media pipeline | `media_pipeline_view` | Request status, publish lag.
| Council governance | Derived SQL | Combines departments, trainees, audit events.

## User Flows
1. **List → Drawer → Actions**
   - Reports catalog grouped by persona. Drawer shows description, filters,
     export options, and schedule configuration.
   - Actions: Run report, Schedule email, Download CSV/PDF.
2. **Scheduling Flow**
   - Users select frequency (weekly/monthly), recipients, and format. System
     validates permissions before saving schedule.
3. **Export Flow**
   - Large exports trigger background jobs; progress tracked in notifications and
     operations dashboard.

## API Endpoints
- `GET /api/method/salitemiret.api.reports.run` (supports `report_name`,
  `filters`).
- `POST /api/method/salitemiret.api.reports.schedule` for scheduled delivery.

## Validation Rules
- Filters validated against allowlist per report to prevent SQL injection.
- Scheduled reports require at least one valid email recipient.
- Large date ranges (> 2 years) require Council role override.

## Notifications
- Scheduled report deliveries send email with download link and summary metrics.
- Failed report jobs alert owners with error message and trace ID.

## Edge Cases
- Empty results prompt "No data" state with suggested filters instead of blank
  file.
- Re-running report with same parameters caches result for 5 minutes to reduce
  load.

## Acceptance Criteria (Spec IDs)
- `REP-AC-01`: Registrar runs membership roster with filters and export completes
  under 2 minutes.
- `REP-AC-02`: Finance ledger schedule emails monthly PDF without manual
  intervention.
- `REP-AC-03`: Failed report job notifies owner with actionable error details.

## Tests
- Backend tests for report execution permissions, parameter validation, and
  caching.
- Frontend tests for report drawer interactions and scheduling forms.

## Security & Audit
- Report access logged with report name, filters, and user.
- Exports containing PII require acknowledgement and produce `Audit Event` type
  `Report Exported`.
- Generated files expire after 24 hours to minimize exposure.

## Implementation Plan
- **Day 9**: Build SQL views in `apps/salitemiret/reporting/sql/` and map Frappe
  report definitions; ensure permissions align with RBAC roles.
- **Day 9**: Implement execution and scheduling APIs in
  `apps/salitemiret/api/reports.py`, plus scheduled delivery workers and email
  templates.
- **Day 9**: Deliver React report catalog, filter drawer, and scheduling UI in
  `frontend/src/features/reports/`, wiring background job polling and audit
  notations.
