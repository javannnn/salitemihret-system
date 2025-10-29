# Membership Module

## Purpose
Maintain authoritative member records, household relationships, status history,
and automated pastoral insights such as contribution streak recognition and age-
based milestones.

## Roles & Permissions
- **Parish Registrar**: Create, edit, archive members; manage households; import
  data; view audit logs.
- **PR Administrator**: Approve status changes, review suggestions, view
  sensitive pastoral notes.
- **Finance Clerk**: Read-only access to member contact and sponsorship summary.
- **Volunteer Coordinator / Media Coordinator**: Read-only limited fields for
  assignments.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Member core fields | `Member` DocType | See domain model for full schema. |
| Household relations | `Family Member` | Auto-generated during import or UI updates. |
| Status timeline | `Member Status History` | Latest entry linked on member document. |
| Contribution streak metadata | Computed | Stored in `Member.status_suggestion_cache`. |

## User Flows
1. **List → Drawer → Actions**
   - Members list supports filters by status, household, and language.
   - Selecting a row opens drawer with tabs: Overview, Household, Status History,
     Activity (audit events), Sponsorships.
   - Actions: Edit profile, Archive (soft delete), Start Sponsorship, View
     Suggestions.
2. **Import Stepper**
   - Upload template → Map headers → Validate preview (openpyxl) → Submit job →
     Review results with download links.
   - Error CSV link displayed in final step and via notification badge.
3. **Status Suggestion Review**
   - Drawer surfaces suggested statuses from automated jobs; PR Admin can accept,
     reject, or defer.

## API Endpoints
- `GET/POST/PUT /api/resource/Member`
- `members.download_template`, `members.preview_import`, `members.import_members`
- `members.status_suggestions`, `members.approve_status`

## Validation Rules
- Mandatory fields: member ID, first/last name, gender, preferred language.
- Birth date must precede current date; members under 16 require guardian link.
- Status change cannot backdate earlier than existing latest entry.
- Import dedupe rules enforce unique `member_id` or combination
  (`first_name`, `last_name`, `birth_date`).

## Notifications
- Contribution streak job sends PR Admin notification when six consecutive month
  contributions detected (links to suggestion in drawer).
- Hourly job detects members whose 18th birthday occurred; alerts PR Admin to
  transition them from child programs.
- Import completion emails include counts and error CSV signed URL.

## Reports & Exports
- **Active Membership Roster**: Filters by status, language, cohort.
- **Household Directory**: Groups by `household_code`.
- **Status Change Log**: Lists approvals with approver, reason, and audit event
  reference.

## Edge Cases
- Members converted from `Newcomer` retain original intake record; duplicates
  flagged for registrar review.
- Archive action prevents new payments but retains history.
- Name collisions handled via suffix appended to `member_id` during import.

## Acceptance Criteria (Spec IDs)
- `MEM-AC-01`: Registrar imports 500 members with <2% validation errors and
  retrieves error CSV for corrections.
- `MEM-AC-02`: PR Admin approves six-month streak suggestion and audit event is
  recorded with trace ID.
- `MEM-AC-03`: Turning-18 automation creates notification and pending status
  update within one hour of birthday.

## Tests
- Frontend unit tests for drawer components, import stepper validation, and
  status suggestion cards.
- Backend tests for import preview, dedupe logic, suggestion generation, and
  approval workflow.
- Authorization tests ensuring only PR Admin can approve status.

## Security & Audit
- Sensitive fields (address, pastoral notes) restricted to Registrar/PR Admin.
- Every import, suggestion, and approval emits `Audit Event` with payload storing
  evidence and uploader information.
- Access logs reviewed monthly to detect unusual member lookups.

## Implementation Plan
- **Day 2**: Scaffold `apps/salitemiret/doctype/member/`, `family_member/`, and
  `member_status_history/` DocTypes with validations and fixtures; create React
  list/drawer components in `frontend/src/features/membership/`.
- **Day 3**: Deliver import endpoints in
  `apps/salitemiret/api/members_import.py`, background job handlers in
  `apps/salitemiret/background_jobs/imports.py`, and the React import stepper at
  `frontend/src/features/membership/MemberImportStepper.tsx`.
- **Day 3**: Implement automated status suggestion jobs in
  `apps/salitemiret/background_jobs/status_rules.py` plus drawer UI for reviewing
  suggestions with audit event wiring.
