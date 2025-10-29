# Data Model — Core Plan

Source of truth: `docs/spec-kit/03-domain-model.md`. All DocTypes live in the `salitemiret` Frappe app and inherit standard Frappe metadata (`name`, `owner`, `creation`, `modified`, `docstatus`). Soft-delete semantics rely on the documented `is_active` / `active` flags.

## Overview

| Entity | Purpose | Key Custom Fields / Notes |
|--------|---------|---------------------------|
| Member | Core person record with bilingual names, status linkage, and household metadata | `member_id`, `first_name`, `last_name`, `first_name_am`, `last_name_am`, `status`, `preferred_language`, `household_id`, `is_active` |
| Family Member | Household relationship record | `member`, `relationship`, `head_of_household`, `household_code` |
| Member Status History | Tracks status suggestions/approvals | `status`, `effective_date`, `reason`, `approved_by`, `suggestion_source` |
| Payment | Immutable ledger entry with correction linkage | `payment_reference`, `member`, `payment_date`, `amount`, `method`, `allocation`, `correction_of`, `created_by_import` |
| Sponsorship | Sponsor commitments | `sponsorship_id`, `member`, `beneficiary_name`, `monthly_amount`, `program`, `status` |
| Newcomer | Settlement pipeline | `newcomer_id`, `first_name`, `last_name`, `preferred_language`, `visit_date`, `followup_owner`, `converted_member` |
| Abenet Enrollment | Adult formation enrollment | `member`, `cohort`, `enrollment_date`, `status`, `mentor` |
| Sunday School Enrollment | Youth enrollment tracking | `child`, `guardian`, `class_level`, `enrollment_date`, `expected_graduation`, `status`, `mezmur_group` |
| Lesson | Curriculum definition | `lesson_code`, bilingual titles, `level`, `duration_minutes` |
| Mezmur | Choir group metadata | `mezmur_code`, `title`, `language`, `category`, `rehearsal_day`, `conductor` |
| Volunteer Group | Ministry grouping | `group_id`, `name`, `ministry_area`, `coordinator`, `meeting_schedule` |
| Volunteer | Volunteer participation record | `member`, `group`, `joined_on`, `role`, `status` |
| Service Log | Logged volunteer service | `volunteer`, `service_date`, `hours`, `description`, `verified_by` |
| Media Request | Media workflow | `request_id`, `title`, `requester`, `ministry_area`, `status`, `public_post` |
| Public Post | Published content generated from media requests | `slug`, `title`, `body`, `language`, `published_on`, `source_media_request` |
| Council Department | Governance departments | `department_id`, `name`, `chair`, `charter`, `active` |
| Council Trainee | Department trainees | `trainee_id`, `member`, `department`, `start_date`, `expected_completion`, `mentor`, `status` |
| Audit Event | Immutable audit log | `event_type`, `source_doctype`, `source_name`, `actor`, `payload`, `trace_id`, `occurred_on` |

## Entity Details

### Member
- **Fields**: `member_id` (unique), English + Amharic names, demographics (birth_date, gender, marital_status), contact info, `household_id`, `preferred_language`, sacramental dates, notes, `is_active`.
- **Relationships**: Linked from Family Member, Member Status History, Payment, Sponsorship, Newcomer (conversion), Volunteer, Service Log, Enrollments.
- **Validation**: `member_id` unique; phone validated (E.164); soft delete toggles `is_active`.
- **Indexes**: Unique `member_id`, composite (`last_name`, `first_name`), index on `phone`.

### Family Member
- **Fields**: `member`, `relationship`, `head_of_household`, `household_code`, `start_date`, `end_date`.
- **Relationships**: References `Member`.
- **Validation**: Prevent duplicate household rows; enforce one head_of_household per `household_code`.
- **Indexes**: Composite (`household_code`, `member`).

### Member Status History
- **Fields**: `member`, `status`, `effective_date`, `reason`, `notes`, `approved_by`, `suggestion_source`.
- **Relationships**: Updates `Member.status`.
- **Validation**: Only the most recent entry may set `member.status`; `approved_by` required for non-automated transitions.
- **Indexes**: Composite (`member`, `effective_date DESC`).

### Payment
- **Fields**: `payment_reference` (unique), `member`, `payment_date`, `amount`, `method`, `allocation`, `correction_of`, `created_by_import`, `memo`.
- **Relationships**: References `Member`; `correction_of` self-links for adjustments.
- **Validation**: Prevent editing existing rows; enforce correction linkage and reconciled amounts.
- **Indexes**: Unique `payment_reference`; composite (`member`, `payment_date`).

### Sponsorship
- **Fields**: `sponsorship_id`, `member` (sponsor), `beneficiary_name`, bilingual notes, `start_date`, `end_date`, `monthly_amount`, `status`, `program`.
- **Relationships**: Links to members and newcomer conversions.
- **Validation**: active status requires ongoing commitment; monthly_amount > 0.
- **Indexes**: Composite (`member`, `status`).

### Newcomer
- **Fields**: `newcomer_id`, bilingual names, `preferred_language`, `visit_date`, `referred_by`, `followup_owner`, `notes`, `converted_member`.
- **Relationships**: Provides source for membership conversion.
- **Validation**: Converted state requires `converted_member`.
- **Indexes**: Index on `visit_date`; composite (`last_name`, `first_name`).

### Abenet Enrollment
- **Fields**: `member`, `cohort`, `enrollment_date`, `completion_date`, `status`, `mentor`.
- **Relationships**: Extends adult formation flows.
- **Validation**: Completed status requires `completion_date`.
- **Indexes**: Composite (`cohort`, `member`).

### Sunday School Enrollment
- **Fields**: `child`, `guardian`, `class_level`, `enrollment_date`, `expected_graduation`, `status`, `mezmur_group`.
- **Relationships**: Connects to Mezmur for choir placement; surfaces in school dashboards.
- **Validation**: Guardian required; status transitions trigger mezmur updates.
- **Indexes**: Composite (`class_level`, `status`).

### Lesson
- **Fields**: `lesson_code` (unique), bilingual titles, `description`, `level`, `duration_minutes`, `resources`.
- **Validation**: `duration_minutes` > 0.
- **Indexes**: Unique `lesson_code`.

### Mezmur
- **Fields**: `mezmur_code`, `title`, `language`, `category`, `rehearsal_day`, `conductor`.
- **Validation**: `rehearsal_day` enumerated; conductor requires Volunteer / User link.
- **Indexes**: Composite (`category`, `language`).

### Volunteer Group
- **Fields**: `group_id`, `name`, `ministry_area`, `coordinator`, `meeting_schedule`.
- **Validation**: `group_id` unique; coordinator must have Volunteer Coordinator role.
- **Indexes**: Unique `group_id`.

### Volunteer
- **Fields**: `member`, `group`, `joined_on`, `role`, `status`.
- **Relationships**: Primary group referencing Volunteer Group.
- **Validation**: One active volunteer record per member/group pair.
- **Indexes**: Composite (`group`, `status`).

### Service Log
- **Fields**: `volunteer`, `service_date`, `hours`, `description`, `verified_by`.
- **Validation**: `hours` > 0; `verified_by` required to mark as complete.
- **Indexes**: Index (`volunteer`, `service_date`).

### Media Request
- **Fields**: `request_id`, `title`, `requester`, `ministry_area`, `description`, `submission_date`, `due_date`, `status`, `approved_by`, `public_post`.
- **Validation**: Status transitions enforce required fields (assets when approving, decision rationale when rejecting).
- **Indexes**: Composite (`status`, `due_date`).

### Public Post
- **Fields**: `slug`, `title`, `body`, `language`, `published_on`, `hero_image`, `source_media_request`, `tags`.
- **Validation**: Unique `slug`; `published_on` set on publish workflow.
- **Indexes**: Unique `slug`; index on `published_on`.

### Council Department
- **Fields**: `department_id`, `name`, `chair`, `charter`, `active`.
- **Validation**: `department_id` unique; `chair` must hold Council role.
- **Indexes**: Unique `department_id`.

### Council Trainee
- **Fields**: `trainee_id`, `member`, `department`, `start_date`, `expected_completion`, `mentor`, `status`.
- **Validation**: Active status requires `mentor`; completion requires `expected_completion`.
- **Indexes**: Composite (`department`, `status`).

### Audit Event
- **Fields**: `event_type`, `source_doctype`, `source_name`, `actor`, `payload`, `trace_id`, `occurred_on`.
- **Validation**: Immutable; `payload` stored as JSON; `trace_id` required for observability correlation.
- **Indexes**: Composite (`source_doctype`, `source_name`, `occurred_on`); index on `trace_id`.
