# Schools Module

## Purpose
Manage catechesis programs including Abenet formation and Sunday School,
tracking enrollments, lessons, mezmur assignments, and age-based transitions.

## Roles & Permissions
- **Sunday School Lead**: Full access to enrollments, lessons, mezmur groups.
- **PR Administrator**: Read-only oversight, receives age-based alerts.
- **Parish Registrar**: View enrollments tied to member records.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Abenet Enrollment | `Abenet Enrollment` DocType | Links member, cohort, mentor.
| Sunday School Enrollment | `Sunday School Enrollment` | Includes guardian, class level, mezmur group.
| Lesson | `Lesson` | Title, level, resources.
| Mezmur | `Mezmur` | Choir metadata and practice schedule.
| Attendance | Child table | Logs per session attendance and notes.

## User Flows
1. **List → Drawer → Actions**
   - Enrollments list filterable by cohort, class level, status.
   - Drawer tabs: Profile, Lessons, Attendance, Notes, Audit.
   - Actions: Update status, Assign mentor, Schedule lesson, Export attendance.
2. **Import Stepper**
   - Sunday School bulk enrollment template (`child_id`, `guardian_id`,
     `class_level`, `mezmur_code`, `enrollment_date`). Validation ensures child
     is under 18; else flagged for PR review.
3. **Promotion Workflow**
   - Year-end promotion wizard updates class levels and expected graduation dates
     in batch, generating audit events.

## API Endpoints
- `GET/POST/PUT /api/resource/Abenet Enrollment`
- `GET/POST/PUT /api/resource/Sunday School Enrollment`
- `GET /api/resource/Lesson`, `GET /api/resource/Mezmur`
- `POST /api/method/salitemiret.api.schools.promote_students`

## Validation Rules
- Students turning 18 within current year flagged; cannot remain in Sunday
  School level. Automation reassigns to adult programs and notifies PR.
- Mezmur assignment requires active choir and available capacity.
- Lessons require level alignment; adult lessons not assignable to youth cohorts.

## Notifications
- Weekly summary of attendance anomalies (absence >3 weeks) to Sunday School
  Lead.
- Child turning 18 notification to PR Administrator with link to member record.
- Promotion completion email summarizing affected students.

## Reports & Exports
- **Attendance Report**: CSV grouped by class level with absence rate.
- **Lesson Coverage**: Tracks completion per cohort.
- **Mezmur Roster**: Exports choir participants and rehearsal schedule.

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

## Implementation Plan
- **Day 6**: Define DocTypes (`apps/salitemiret/doctype/abenet_enrollment/`,
  `sunday_school_enrollment/`, `lesson/`, `mezmur/`) with validations for age,
  capacity, and curriculum alignment.
- **Day 6**: Implement promotion, attendance, and notification endpoints in
  `apps/salitemiret/api/schools.py`, plus child-turns-18 automation job in
  `apps/salitemiret/background_jobs/age_transitions.py`.
- **Day 6**: Build React enrollment dashboards, attendance forms, and promotion
  wizard under `frontend/src/features/schools/`, integrating TanStack Query and
  translation strings.
