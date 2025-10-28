# Newcomers Module

## Purpose
Capture initial contact information for visitors and seekers, coordinate follow-
up assignments, and convert qualified newcomers into full members while
preserving intake history.

## Roles & Permissions
- **Parish Registrar**: Create newcomers, update status, convert to member.
- **PR Administrator**: Assign follow-up owner, monitor conversion pipeline.
- **Volunteer Coordinator**: Read-only access for hospitality volunteers.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Basic identity | `Newcomer` DocType | Mirrors member name fields, bilingual.
| Visit metadata | `visit_date`, `referred_by`, `notes` | Used in conversion analytics.
| Assignment | `followup_owner` | Link to PR Admin or registrar.
| Conversion | `converted_member` | Set when member record created.

## User Flows
1. **List → Drawer → Actions**
   - Kanban view by status (New, In Progress, Converted, Closed).
   - Drawer actions: Assign owner, schedule follow-up, convert to member.
2. **Conversion Flow**
   - Trigger `Convert to Member` action → pre-fills member form → on submit,
     sets `converted_member` and logs audit event.
3. **Import Stepper**
   - Smaller template with headers `first_name`, `last_name`, `visit_date`,
     `preferred_language`, `referred_by`, `notes`.

## API Endpoints
- `GET/POST/PUT /api/resource/Newcomer`
- Conversion uses `/api/method/salitemiret.api.newcomers.convert`

## Validation Rules
- Duplicate detection on (`first_name`, `last_name`, `visit_date`).
- Cannot convert without assigning follow-up owner.
- Conversion requires either phone or email.

## Notifications
- Daily digest to PR Admin summarizing newcomers pending follow-up.
- Immediate email to assigned owner upon creation/update.
- Conversion triggers welcome email template and audit event.

## Reports & Exports
- **Monthly Intake Report**: Counts by referral source and conversion status.
- **Follow-up Aging Report**: Lists newcomers pending action >7 days.

## Edge Cases
- Visitors declining contact flagged as `Closed - No Follow-up` and excluded from
  conversion prompts.
- Duplicate with existing member: `converted_member` populated automatically,
  newcomer closed as `Merged`.

## Acceptance Criteria (Spec IDs)
- `NEW-AC-01`: Registrar converts newcomer to member, capturing audit history and
  linking records.
- `NEW-AC-02`: Daily digest email includes accurate counts and pending owners.
- `NEW-AC-03`: Import stepper prevents duplicates unless override selected.

## Tests
- Backend tests for conversion method, duplicate detection, and notification
  dispatch.
- Frontend tests for Kanban actions and convert modal.

## Security & Audit
- Newcomer PII visible only to registrar and PR Admin roles.
- Every conversion logs `Audit Event` with reference to new member ID.
- Intake notes redacted from exports unless Admin grants permission.
