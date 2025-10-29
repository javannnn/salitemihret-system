# Data Model — Core Plan

## Overview

| Entity | Purpose | Primary Indexes |
|--------|---------|-----------------|
| Role | Canonical system and sub-admin roles | `name` (PK) |
| Role Permission | DocType-level privilege matrix per role | Unique (`role`, `doctype`) |
| Audit Event | Immutable audit trail for semantic actions | (`doctype`, `docname`, `created_at`), `created_at` |
| Member | Core person record powering workflows | Unique `member_code`, (`status`, `parish_unit`), (`last_payment_on`) |
| Member Family Link | Family/guardian relationships | Unique (`member`, `relative`) |
| Member Import Batch | Bulk import lifecycle tracking | `status`, `uploaded_on` |
| Payment Entry | Immutable ledger entries | (`member`, `posted_on`), (`payment_type`, `posted_on`), unique `ledger_hash` |
| Payment Correction | Append-only correction approvals | `payment_entry`, (`approval_status`, `created_at`) |
| Sponsorship | Sponsor-to-beneficiary pledges | `sponsor_member`, (`status`, `next_reminder_on`) |
| Newcomer | Settlement and conversion pipeline | `conversion_status`, `assigned_to`, `follow_up_on` |
| School Enrollment | Sunday School enrollment lifecycle | (`student`, `status`), (`program`, `term`) |
| Class Roster | Instructional group metadata | (`program`, `level`, `term`), `leader` |
| Volunteer | Volunteer roster metadata | `group_name`, (`status`, `group_name`) |
| Volunteer Log | Service activity tracking | (`volunteer`, `service_date`), (`service_date`, `activity_type`) |
| Media Request | Media approval workflow | `status`, `submitted_on` |
| Council | Governance structures | `department`, `status` |
| Council Term | Council term lifecycle | (`council`, `term_start`), `term_end` |
| Report Definition | Reporting catalog entries | `domain`, `schedule_cron` |
| Notification Digest | Scheduled digest definitions | (`digest_type`, `target_role`), `schedule_cron` |

## Entity Details

### Role
- **Fields**: `name` (PK), `description`, `is_system`, `priority`
- **Relationships**: One-to-many with Role Permission (`role`)
- **Validation**: `name` unique; `is_system` roles cannot be archived
- **State Transitions**: Active ↔ Archived (non-system roles)
- **Indexes**: Primary key `name`

### Role Permission
- **Fields**: `name` (PK), `role` (FK), `doctype`, `read`, `write`, `create`, `delete`, `submit`, `cancel`
- **Relationships**: Belongs to Role
- **Validation**: At least one permission flag true; deny-by-default when absent
- **State Transitions**: Configuration-only
- **Indexes**: Unique composite (`role`, `doctype`)

### Audit Event
- **Fields**: `name` (PK), `doctype`, `docname`, `actor`, `action`, `payload`, `ip_address`, `created_at`
- **Relationships**: References any DocType via `doctype`/`docname`
- **Validation**: Immutable payload JSON; `actor` required
- **State Transitions**: Append-only
- **Indexes**: Composite (`doctype`, `docname`, `created_at`), secondary on `created_at`

### Member
- **Fields**: `name` (PK), `full_name`, `member_code`, `status`, `suggested_status`, `status_reason`, `import_batch`, `birth_date`, `gender`, `phone`, `email`, `address`, `parish_unit`, `joined_on`, `last_payment_on`
- **Relationships**: Many-to-many via Member Family Link; one-to-many with Payment Entry; optional Sponsorship links
- **Validation**: `member_code` required/unique; status transitions gated by PR approval
- **State Transitions**: Draft → Active → Suspended → Archived; suggestions promoted post-approval
- **Indexes**: Unique `member_code`; composite (`status`, `parish_unit`); single `last_payment_on`

### Member Family Link
- **Fields**: `name` (PK), `member` (FK), `relative` (FK), `relationship`, `is_guardian`
- **Relationships**: Bi-directional Member associations
- **Validation**: Prevent reciprocal duplicates; guardian requires adult relative flag
- **State Transitions**: Active ↔ Archived
- **Indexes**: Unique composite (`member`, `relative`)

### Member Import Batch
- **Fields**: `name` (PK), `uploaded_by`, `uploaded_on`, `file_path`, `processed_on`, `status`, `error_csv`, `row_count`, `success_count`, `failure_count`
- **Relationships**: One-to-many with Member through `import_batch`
- **Validation**: Error CSV mandatory when failures exist; status controlled by background job
- **State Transitions**: Uploaded → Processing → Completed | Failed | Cancelled
- **Indexes**: Single on `status`; single on `uploaded_on`

### Payment Entry
- **Fields**: `name` (PK), `member` (FK), `payment_type`, `amount`, `currency`, `source`, `reference_no`, `posted_on`, `received_on`, `ledger_hash`, `created_by`, `created_at`
- **Relationships**: One-to-many with Payment Correction; belongs to Member
- **Validation**: Immutable after creation; `ledger_hash` chained for tamper detection
- **State Transitions**: Posted only (no updates)
- **Indexes**: Composite (`member`, `posted_on`); composite (`payment_type`, `posted_on`); unique `ledger_hash`

### Payment Correction
- **Fields**: `name` (PK), `payment_entry` (FK), `correction_type`, `delta_amount`, `reason`, `approval_status`, `approved_by`, `approved_on`, `audit_reference`
- **Relationships**: Belongs to Payment Entry; pushes Audit Event
- **Validation**: Delta non-zero; workflow Pending → Approved/Rejected; approval requires role-based permission
- **State Transitions**: Draft → Pending Approval → Approved | Rejected
- **Indexes**: Single on `payment_entry`; composite (`approval_status`, `created_at`)

### Sponsorship
- **Fields**: `name` (PK), `sponsor_member` (FK), `beneficiary_member` (FK), `pledge_amount`, `currency`, `frequency`, `budget_code`, `start_date`, `end_date`, `status`, `reminder_frequency`, `next_reminder_on`
- **Relationships**: Links sponsor and beneficiary Members; ties to Newcomer after conversion
- **Validation**: Active sponsorship requires future `next_reminder_on`; frequency enumerations enforced
- **State Transitions**: Draft → Active → Paused → Completed → Archived
- **Indexes**: Single on `sponsor_member`; composite (`status`, `next_reminder_on`)

### Newcomer
- **Fields**: `name` (PK), `full_name`, `arrival_date`, `sponsor_candidate` (FK Member), `conversion_status`, `assigned_to`, `follow_up_on`, `notes`
- **Relationships**: Optional Sponsorship link; assigned to admin user
- **Validation**: Conversion requires sponsor or reason; follow-up date required while in Integration
- **State Transitions**: Registered → In Integration → Converted | Dropped
- **Indexes**: Singles on `conversion_status`, `assigned_to`, `follow_up_on`

### School Enrollment
- **Fields**: `name` (PK), `student` (FK Member), `program`, `class_level`, `term`, `status`, `fee_amount`, `fee_due_on`, `last_paid_on`, `promotion_candidate`
- **Relationships**: Belongs to Class Roster; interacts with Payment Entry for billing
- **Validation**: `fee_due_on` required for billing; promotion requires Active state
- **State Transitions**: Applied → Enrolled → Graduated | Withdrawn
- **Indexes**: Composite (`student`, `status`); composite (`program`, `term`)

### Class Roster
- **Fields**: `name` (PK), `program`, `level`, `term`, `leader` (FK Volunteer), `capacity`, `schedule`, `location`
- **Relationships**: One-to-many with School Enrollment
- **Validation**: Capacity ≥ enrolled count; leader must have Volunteer privileges
- **State Transitions**: Planned → Active → Completed → Archived
- **Indexes**: Composite (`program`, `level`, `term`); single on `leader`

### Volunteer
- **Fields**: `name` (PK), `member` (FK), `group_name`, `role`, `status`, `joined_on`, `contact_phone`, `notes`
- **Relationships**: One-to-many with Volunteer Log
- **Validation**: Member link required unless external flag; inactivity digest uses `status`
- **State Transitions**: Applicant → Active → On Hold → Inactive
- **Indexes**: Single on `group_name`; composite (`status`, `group_name`)

### Volunteer Log
- **Fields**: `name` (PK), `volunteer` (FK), `service_date`, `hours_served`, `activity_type`, `location`, `notes`, `logged_by`
- **Relationships**: Belongs to Volunteer
- **Validation**: `hours_served` > 0; prevent duplicates per volunteer/service_date slot
- **State Transitions**: Draft → Submitted → Amended (new copy)
- **Indexes**: Composite (`volunteer`, `service_date`); composite (`service_date`, `activity_type`)

### Media Request
- **Fields**: `name` (PK), `submitted_by` (FK Member), `title`, `description`, `asset_path`, `status`, `decision_reason`, `approved_by`, `approved_on`, `publish_target`, `published_on`
- **Relationships**: Links to public feed publishing pipeline; triggers notifications
- **Validation**: Approved requests require asset; rejection needs `decision_reason`
- **State Transitions**: Submitted → In Review → Approved → Published | Rejected
- **Indexes**: Single on `status`; single on `submitted_on`

### Council
- **Fields**: `name` (PK), `department`, `description`, `chair` (FK Member), `status`, `established_on`
- **Relationships**: One-to-many with Council Term
- **Validation**: Chair must hold Council permissions; status drives dashboard visibility
- **State Transitions**: Forming → Active → Suspended → Disbanded
- **Indexes**: Singles on `department`, `status`

### Council Term
- **Fields**: `name` (PK), `council` (FK), `term_start`, `term_end`, `trainee_count`, `focus_area`, `reports_path`
- **Relationships**: Belongs to Council
- **Validation**: `term_end` > `term_start`; `reports_path` required before completion
- **State Transitions**: Planned → In Progress → Completed → Archived
- **Indexes**: Composite (`council`, `term_start`); single on `term_end`

### Report Definition
- **Fields**: `name` (PK), `domain`, `description`, `filters_schema`, `schedule_cron`, `owner`, `last_run_on`
- **Relationships**: Consumed by reporting engine and scheduler jobs
- **Validation**: Cron expression validated; `filters_schema` JSON schema enforced
- **State Transitions**: Draft → Active → Paused → Retired
- **Indexes**: Singles on `domain` and `schedule_cron`

### Notification Digest
- **Fields**: `name` (PK), `digest_type`, `target_role`, `schedule_cron`, `payload_template`, `last_sent_on`
- **Relationships**: Feeds background jobs for reminders/digests
- **Validation**: Valid cron required; digest type enumerated (volunteer inactivity, newcomer follow-up, sponsorship reminders)
- **State Transitions**: Draft → Active → Paused → Archived
- **Indexes**: Composite (`digest_type`, `target_role`); single on `schedule_cron`
