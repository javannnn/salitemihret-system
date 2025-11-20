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
- `GET /reports/{code}` – run a report synchronously with query params/filters (FastAPI router backed by SQL views or query builders).
- `POST /reports/{code}/schedule` – create/update schedules (frequency, recipients, format) stored in Postgres and executed via APScheduler.
- `GET /reports/summary` – persona dashboard summarizing recent totals (finance, membership, sponsorships, etc.).
- Module-specific feeds (e.g., `GET /schools/abenet/report`) expose focused datasets that the reporting workspace can render/export alongside the generic catalog.

## Validation Rules
- Filters validated against allowlist per report to prevent SQL injection.
- Scheduled reports require at least one valid email recipient.
- Large date ranges (> 2 years) require Council role override.

## Reports & Exports
- **Membership roster**, **Finance ledger**, **Volunteer engagement**, **Media pipeline**, and **Council governance** reports described above remain first-class catalog entries.
- **Abenet School Report** (`GET /schools/abenet/report`) feeds the Work Item #6 requirement (child, parent, service stage, last payment date) and is surfaced in the same UI/export flow.
- All exports ship as streamed CSV (or PDF when requested) with consistent headers + trace IDs.

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
- **Day 9**: Build SQL views/queries in `server/app/reporting/` (or inline SQLAlchemy read models) with RBAC guards; add Alembic seeds for default schedules if needed.
- **Day 9**: Implement FastAPI router/service (`server/app/routers/reports.py`, `server/app/services/reports.py`) plus APScheduler jobs + email templates for scheduled delivery.
- **Day 9**: Deliver React report catalog/filter drawer/scheduling UI in `frontend/src/features/reports/`, wiring background job polling, audit logging, and hooks to module feeds such as `/schools/abenet/report`.
