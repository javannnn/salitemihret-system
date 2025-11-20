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
| Member core fields | `Member` model (`server/app/models/member.py`) | Authoritative schema covering identity, contact, contribution settings, audit metadata. |
| Household relations | `Household`, `Spouse`, `Child` models | Household link stored via `household_id`; spouse/child tables keep family data normalized and selectable (no generic free text). |
| Status timeline | `MemberAudit` model | Audit deltas + automated suggestions feed the drawer; includes approver + payload snapshots. |
| Contribution streak metadata | Computed | Stored on member + audit tables for suggestions. |

## Controlled Inputs & UI Patterns
- **Language & Marital Status**: Segmented controls with flag or status iconography replace dropdowns so clerks can commit without scanning long menus.
- **Contact Preference**: Required single-select chip (Phone, SMS, Email, WhatsApp, Signal) plus optional “Also allow” pill list keeps automation aligned with member consent.
- **Address Builder**: Cascading comboboxes (Country → Region → City) backed by lookup tables eliminate typo’d geography entries. Only street line and postal code remain free text.
- **Father Confessor Selector**: Searchable combobox bound to the `Priest` model replaces the yes/no toggle. Inline “Quick add priest” modal keeps registrars in flow.
- **Contribution Method & Exceptions**: Button group for payment method with a vertical radio list for hardship exceptions (LowIncome, Senior, Student, Other). Selecting “Other” reveals a 140-character explanation field.
- **Tags & Ministries**: Tokenized multi-select restricted to predefined options; Admin/PR can add options from the modal, while clerks can only assign existing chips.
- **Status & Reason Wizard**: Two-step drawer (status chip → reason chip) with generated copy eliminates free-form reason text.

## User Flows
1. **List → Drawer → Actions**
   - Members list supports filters by status, household, and language.
   - Selecting a row opens drawer with tabs: Overview, Household, Status History,
     Activity (audit events), Sponsorships.
   - Actions: Edit profile, Archive (soft delete), Start Sponsorship, View
     Suggestions.
   - Entering edit mode launches a guided form broken into Identity, Contact,
     Household, Spiritual Support, and Contributions sections that rely on the
     controlled inputs above.
2. **Import Stepper**
   - Upload template → Map headers → Validate preview (openpyxl) → Submit job →
     Review results with download links.
   - Error CSV link displayed in final step and via notification badge.
   - Validation now enforces lookup values (language, region, city, marital
     status) and highlights mismatches inline with “Replace with …” actions.
3. **Status Suggestion Review**
   - Drawer surfaces suggested statuses from automated jobs; PR Admin can accept,
     reject, or defer.
4. **Quick Actions Bar**
   - Floating toolbar exposes Assign Father Confessor, Set Household, Start
     Sponsorship, and Send Message. Each modal relies on select/pill inputs
     (no multi-line free text) to keep cross-module data normalized.

## API Endpoints
- `GET /members` – list with filters, sorting, pagination, search chips.
- `POST /members` – create member (spouse/children/household handled inline, all lookup fields validated).
- `GET /members/{id}` – detail view powering drawer/editor.
- `PUT /members/{id}` – update profile with the same schema as create.
- `POST /members/{id}/archive` & `/restore` – soft delete + recovery (Admin/PR).
- `POST /members/{id}/contributions` – log contribution payment with controlled methods/exceptions.
- `GET /members/duplicates` – duplicates check for intake guardrails.
- `POST /members/import/preview` + `POST /members/import` – CSV preview + import flows powering the wizard.
- `GET /members/files/{id}` / `POST /members/files/{id}` – avatar download/upload endpoints.

## Validation Rules
- Mandatory fields: member ID, first/last name, gender, preferred language.
- Birth date must precede current date; members under 16 require guardian link.
- Status change cannot backdate earlier than existing latest entry.
- Import dedupe rules enforce unique `member_id` or combination
  (`first_name`, `last_name`, `birth_date`).
- Contact preference must be selected; reminder automation pauses until a valid
  channel exists (then respects the single-select + optional secondary chips).
- Country/region/city IDs must map to lookup tables; clerks cannot type ad-hoc
  values during either import or inline edits.
- Tags and ministries are assign-only for Clerks; Admin/PR manage vocabularies
  so analytics stay consistent.

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
- **Day 2**: Scaffold SQLAlchemy models (`server/app/models/member.py`,
  `household.py`, `member_status_history.py`) with validations and fixtures;
  create React list/drawer components in `frontend/src/features/membership/`.
- **Day 3**: Deliver import endpoints in `server/app/routers/members_bulk.py`,
  background job helpers in `server/app/services/members_import.py`, and the
  React import stepper at
  `frontend/src/features/membership/MemberImportStepper.tsx`.
- **Day 3**: Implement automated status suggestion jobs in
  `server/app/services/child_promotion.py` + scheduler wiring; extend drawer UI
  for reviewing suggestions with audit event wiring.
