# Councils Module

## Purpose
Support parish council governance by tracking departments, trainee development,
and reporting on leadership activities.

## Roles & Permissions
- **Council Secretary**: Full access to departments, trainees, reports.
- **Parish Registrar**: Read-only view for membership alignment.
- **PR Administrator**: Read-only for leadership coordination.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Council Department | `Council Department` DocType | Charter, chair, active flag.
| Council Trainee | `Council Trainee` DocType | Links member, mentor, status.
| Training milestones | Child table | Logs completed milestones with dates.
| Audit records | `Audit Event` | Captures departmental updates and trainee status changes.

## User Flows
1. **List → Drawer → Actions**
   - Departments list includes metrics: trainee count, open action items.
   - Drawer actions: Update charter, assign chair, archive department.
2. **Trainee Progress**
   - Trainee drawer displays milestones, mentor notes, service logs.
   - Actions: Add milestone, mark completion, extend program.
3. **Import Stepper**
   - Optional template for bulk trainee onboarding with fields `member_id`,
     `department_id`, `start_date`, `mentor`, `status`.

## API Endpoints
- `GET/POST/PUT /api/resource/Council Department`
- `GET/POST/PUT /api/resource/Council Trainee`
- `GET /api/method/salitemiret.api.councils.performance_snapshot`

## Validation Rules
- Only active departments may accept trainees.
- Expected completion date must be ≥ start date.
- Mentor must possess Council role.

## Notifications
- Monthly status summary emailed to Council leadership with trainees at risk.
- When trainee status changes to Completed, automated message sent to mentor and
  PR Admin for celebration planning.

## Reports & Exports
- **Council Dashboard**: KPIs on active departments, trainee completion rate,
  outstanding action items.
- **Quarterly Governance Report**: Export summarizing department charters,
  milestones, and audit events for board review.

## Edge Cases
- Department closure archives trainees and prevents new assignments; audit event
  captures closure reason.
- Trainee transferring departments updates record and logs change history.

## Acceptance Criteria (Spec IDs)
- `COU-AC-01`: Secretary updates department charter and change appears in audit
  log.
- `COU-AC-02`: Completing trainee generates notifications and updates dashboard
  metrics within 10 minutes.
- `COU-AC-03`: Governance report export completes under 2 minutes.

## Tests
- Backend tests for department validation, trainee lifecycle, and snapshots.
- Frontend tests for drawer forms and milestone timeline.

## Security & Audit
- Council data restricted to council roles; trainees viewable by mentors.
- Charter edits and trainee status changes emit `Audit Event` entries with
  payload details.
- Access logs reviewed quarterly for governance compliance.
