# Schools Module

## Purpose
Manage catechesis programs including Abenet formation and Sunday School,
tracking enrollments, lessons, mezmur assignments, and age-based transitions.

## Roles & Permissions
- **School Admin**: Full CRUD on Sunday School + Abenet enrollments, attendance, and tuition.
- **Office Administrator**: Read-only access for oversight and reporting.
- **Admin**: Superuser fallback for escalations.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Sunday School Enrollment | `SundaySchoolEnrollment` | Member + guardian, class level, mezmur assignment, promotion metadata.
| Sunday School Attendance | `SundaySchoolAttendance` | Lesson date, status, note, recorded_by.
| Lesson Library | `Lesson` | Coded lessons tagged by level (Sunday School vs Abenet) and duration.
| Mezmur Groups | `Mezmur` | Choir group metadata incl. rehearsal day + capacity.
| Abenet Enrollment | `AbenetEnrollment` | Parent member, optional `children.id`, child names, birth date, service_stage, monthly_amount, last_payment timestamp.
| Tuition Link | `AbenetEnrollmentPayment` | Join table that maps `payments.id` rows (service type `AbenetSchool`) to enrollments for invoices + receipts.

## User Flows
1. **Sunday School workspace**
   - List filters for class level + status with search on child name.
   - Row drawer shows guardian, mezmur assignment, attendance history, and notes.
   - Actions include inline edits, attendance logging (chips for Present/Absent/Excused), and batch promotion wizard that advances selected enrollments to the next level.
2. **Abenet enrollment flow** *(Work Item #6)*
   - School Admin selects a parent by username search. Existing children render as radio chips; a “new child” toggle collects first/last name + DOB.
   - Service stage (Alphabet/Reading/ForDeacons) and enrollment date are controlled inputs; notes are the only optional textarea.
   - Saving creates the enrollment **and** a pending tuition invoice (`payments` row) using the fixed monthly amount from settings.
   - The list view shows child, parent, service stage, monthly fee, and last payment timestamp with quick filters and a payment action button.
3. **Tuition recording + reporting**
   - Payment modal only asks for method (Cash/Debit/Credit/E-Transfer/Cheque) and optional memo; amount is locked to the configured fee.
   - Recording a payment flips the pending invoice to Completed (or creates a new payment if none exists) and updates the linked enrollment + report feed.
   - `/schools/abenet/report` powers the BRD-required roster showing child name, parent, service stage, and last payment date with CSV/export hooks handled by the reporting module.

## API Endpoints
- `GET /schools/lessons` – list lessons filtered by level.
- `GET /schools/mezmur` – mezmur group catalog.
- `GET/POST/PUT /schools/sunday-school` – Sunday School enrollment CRUD.
- `POST /schools/sunday-school/attendance` – record attendance entry.
- `POST /schools/sunday-school/promotions` – batch promotion.
- `GET/POST/PUT /schools/abenet` – Abenet enrollment list + CRUD.
- `POST /schools/abenet/{id}/payments` – record tuition payment (fixed amount, method chips).
- `GET /schools/abenet/report` – BRD §2.2.9.4 report (child, parent, service stage, last payment).
- `GET /schools/meta` – returns monthly amount, allowed service stages/statuses, and allowed payment methods for the UI.

## Validation Rules
- Sunday School enrollments require child members under 19; guardian optional but must reference another member if provided.
- Mezmur assignments require active groups (capacity respected at the UI layer).
- Abenet enrollment requires an active parent member; new children enforce first/last name + DOB, existing children must belong to that parent.
- Tuition payments must use the configured `AbenetSchool` payment service type, approved payment methods, and the fixed monthly amount from settings; API rejects overrides.
- Search filters normalize to lower-case so child/parent names and usernames can be combined in queries.

## Notifications
- Weekly summary of attendance anomalies (absence >3 weeks) to Sunday School
  Lead.
- Child turning 18 notification to PR Administrator with link to member record.
- Promotion completion email summarizing affected students.

## Reports & Exports
- **Abenet Tuition Report** (`GET /schools/abenet/report`): Fulfills BRD 2.2.9.4 with child, parent, service stage, and last payment date. Export handled by reports module.
- **Sunday School Attendance CSV**: Filterable by class level/date range for council review.
- **Mezmur roster**: Choir membership export for rehearsal planning.

## Edge Cases
- Guardian no longer active member: system prompts for reassignment.
- Students without mezmur group flagged for follow-up.
- Duplicate enrollments prevented within same cohort.

## Acceptance Criteria (Spec IDs)
- `SCH-AC-01`: Lead enrolls student, assigns mezmur, and record appears under
  class dashboard.
- `SCH-AC-02`: Child turning 18 triggers PR notification and removal from youth
  roster within 1 hour.
- `SCH-AC-03`: Attendance export completes < 90 seconds and reflects latest logs.

## Tests
- Backend tests for promotion service, age validation, and mezmur capacity
  enforcement.
- Frontend tests for drawer display, attendance input, and promotion wizard.
- Integration test verifying notifications on age threshold.

## Security & Audit
- Enrollment data accessible only to education roles and PR Admin.
- Promotion and status changes emit `Audit Event` entries with before/after
  snapshot.
- Attendance edits logged with actor and timestamp.

- **Day 6**: Define SQLAlchemy models + Alembic migration (`server/app/models/schools.py`, `server/alembic/versions/9f33…`) covering lessons, mezmur, Sunday School + Abenet enrollments, attendance, and the tuition link table. Guard Postgres enums for existing databases.
- **Day 6**: Implement services/routers in FastAPI (`server/app/services/schools.py`, `server/app/routers/schools.py`) for Sunday School CRUD, promotions, attendance, Abenet enrollment/payment workflows, and the `/schools/meta` + `/schools/abenet/report` endpoints.
- **Day 6**: Ship the React workspace (`frontend/src/pages/Schools/index.tsx`) with controlled selects, parent/child pickers, attendance logging, tuition modal (fixed amount, payment chips), list filters, and report table. API bindings live in `frontend/src/lib/api.ts`.
