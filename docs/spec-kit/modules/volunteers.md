# Volunteers Module

## Purpose
Coordinate volunteer groups, track service participation, and surface insights
about engagement and compliance with ministry commitments.

## Roles & Permissions
- **Volunteer Coordinator**: Full control over groups, volunteers, service logs,
  and exports.
- **Parish Registrar / PR Admin**: Read-only insights for pastoral follow-up.
- **Council Secretary**: Access to service analytics for governance reports.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Volunteer Group | `Volunteer Group` DocType | Contains ministry area, coordinator, schedule.
| Volunteer | `Volunteer` DocType | Links member to group, role, status.
| Service Log | `Service Log` DocType | Records service date, hours, description, verifier.
| Engagement metrics | Computed view | Aggregates hours per volunteer.

## User Flows
1. **List → Drawer → Actions**
   - Groups list shows capacity, active volunteers, upcoming service dates.
   - Drawer actions: Add volunteer, log service, mark trainee completion.
2. **Service Log Entry**
   - Drawer or modal with quick-entry fields; verifies hours and allows notes.
3. **Import Stepper**
   - Batch volunteer enrollment template with columns `member_id`, `group_id`,
     `role`, `joined_on`. Validation ensures member is active and not already in
     group.

## API Endpoints
- `GET/POST/PUT /api/resource/Volunteer Group`
- `GET/POST/PUT /api/resource/Volunteer`
- `GET/POST/PUT /api/resource/Service Log`
- `GET /api/method/salitemiret.api.volunteers.engagement_report`

## Validation Rules
- Volunteer must be `Member.status` in {Active, Volunteer}.
- Service hours cannot exceed 24 in a single entry.
- Duplicate volunteer-group assignments blocked.

## Notifications
- Weekly digest of volunteers inactive for 60 days.
- Reminder email to coordinators for unverified service logs older than 7 days.

## Reports & Exports
- **Engagement Summary**: Hours by volunteer, month, and ministry area.
- **Roster Export**: List of volunteers with contact info and status.
- **Compliance Report**: Identifies trainees pending completion.

## Edge Cases
- Volunteer leaving group sets status to Inactive but preserves service history.
- When member archived, volunteer record automatically archived and audit event
  logged.

## Acceptance Criteria (Spec IDs)
- `VOL-AC-01`: Coordinator logs service for volunteer; hours appear in monthly
  dashboard.
- `VOL-AC-02`: Inactivity digest lists volunteers with no logs for 60 days.
- `VOL-AC-03`: Import adds volunteers without duplicates and provides error CSV
  when issues arise.

## Tests
- Backend validation tests for volunteer creation, service log constraints, and
  inactivity job.
- Frontend tests for group drawer, service log form, and inactivity badge.

## Security & Audit
- Volunteer PII restricted to coordinator and PR roles.
- Each service log creation/edit records `Audit Event` (Service Logged).
- Inactivity job logs summary audit entry with affected volunteers.
