# Domain Model

## Overview
All business entities are implemented as SQLAlchemy models under
`server/app/models`. Each model inherits from the shared `Base` declarative map
and persists to PostgreSQL tables with explicit timestamps (`created_at`,
`updated_at`, optional `deleted_at`). Soft deletes rely on boolean flags
(`is_active`, `active`) or nullable `deleted_at` columns depending on the entity.

Relationships follow these patterns:
- Member-centric models (`Household`, `MemberStatusHistory`, `Payment`,
  `Sponsorship`) reference `Member` via foreign keys.
- Program enrollment models (`AbenetEnrollment`, `SundaySchoolEnrollment`)
  connect members or newcomers to formation records.
- Media and council models emit audit entries when their status fields change.

Unless noted, strings map to `VARCHAR(255)` and text blocks map to `TEXT`.
Select/enum fields are PostgreSQL ENUMs managed through Alembic migrations.

## Member Management
### Member
| Field | Type | Description |
|-------|------|-------------|
| member_id | Data (unique) | Human-readable identifier (e.g., MIH-2024-001). |
| first_name | Data | Given name. |
| last_name | Data | Family name. |
| first_name_am | Data | Amharic given name. |
| last_name_am | Data | Amharic family name. |
| birth_date | Date | Date of birth. |
| gender | Select | Male, Female, Other/Undisclosed. |
| marital_status | Select | Single, Married, Widowed, Divorced. |
| household_id | Link (Family Member) | Primary family grouping. |
| email | Data | Preferred email (validated). |
| phone | Data | E.164 formatted phone number. |
| address_line1 | Data | Street address. |
| city | Link (Geo City) | Canonical city lookup; enforces consistent spelling and lat/long metadata. |
| state_province | Link (Geo Region) | Province/state selector tied to curated region list. |
| postal_code | Data | Postal code. |
| country | Link (Geo Country) | ISO 3166-1 alpha-2 driven dropdown. |
| contact_preference | Select | Primary channel: Phone, SMS, Email, WhatsApp, Signal. |
| communication_channels | MultiSelect | Secondary opt-ins rendered as pill selectors; stored as CSV. |
| status | Link (Member Status History) | Latest status document. |
| preferred_language | Select | en, am. |
| join_date | Date | Date first registered. |
| baptism_date | Date | Optional sacramental date. |
| notes | Text | Pastoral notes (retrievable via permissions). |
| is_active | Check | Soft delete flag; false hides from lists but retains audit trail. |

**Indexes**: Unique composite on (`member_id`), index on (`last_name`,
`first_name`), index on `phone`.

### Family Member
| Field | Type | Description |
|-------|------|-------------|
| member | Link (Member) | Household member. |
| relationship | Select | Spouse, Child, Parent, Sibling, Guardian, Other. |
| head_of_household | Check | Marks household head. |
| household_code | Data | Shared identifier for grouping. |
| start_date | Date | Relationship start. |
| end_date | Date | Optional end. |

**Indexes**: Composite index on (`household_code`, `member`).

### Member Status History
| Field | Type | Description |
|-------|------|-------------|
| member | Link (Member) | Member reference. |
| status | Select | Prospect, Active, Lapsed, Alumni, Sponsor, Volunteer. |
| effective_date | Date | When the status took effect. |
| reason | Select | Contribution streak, PR follow-up, Administrative, Manual override. |
| notes | Text | Additional context. |
| approved_by | Link (User) | PR administrator who approved. |
| suggestion_source | Data | Rule or job name (e.g., `six_month_streak`). |

**Indexes**: Composite on (`member`, `effective_date DESC`). Latest record is the
active status link.

### Reference Lookups
#### Geo Country
| Field | Type | Description |
|-------|------|-------------|
| code | Data (unique) | ISO 3166-1 alpha-2 code (e.g., `CA`). |
| name | Data | Display label. |
| priority | Int | Sort order so common locales surface first. |

#### Geo Region
| Field | Type | Description |
|-------|------|-------------|
| country | Link (Geo Country) | Owning country. |
| code | Data (unique) | Subdivision code (e.g., `CA-ON`). |
| name | Data | Region/province label. |

#### Geo City
| Field | Type | Description |
|-------|------|-------------|
| region | Link (Geo Region) | Parent subdivision. |
| name | Data | City label. |
| transliterated_name | Data | Optional Amharic/Ge'ez friendly spelling. |

#### Reference Option
| Field | Type | Description |
|-------|------|-------------|
| group | Select | `language`, `marital_status`, `contact_channel`, `pledge_frequency`, `sponsorship_program`, etc. |
| value | Data | Machine value (slug). |
| label | Data | Human label shown in UI. |
| locale | Data | Optional locale to override label rendering. |
| sort_order | Int | Controls pill order. |

## Financials and Sponsorships
### Payment
| Field | Type | Description |
|-------|------|-------------|
| payment_reference | Data (unique) | External reference number. |
| member | Link (Member) | Contributor. |
| payment_date | Date | Recorded date. |
| amount | Currency | Positive amount in ETB. |
| method | Select | Cash, Check, Transfer, Adjustment. |
| allocation | Select | General Fund, Sponsorship, Building Fund, Special Event. |
| correction_of | Link (Payment) | Points to original payment when creating corrections. |
| created_by_import | Check | True if sourced from import job. |
| memo | Text | Finance notes. |

**Indexes**: Unique on `payment_reference`, index on (`member`, `payment_date`).
Corrections insert a new row with `method=Adjustment` and `correction_of` set.

### Sponsorship
| Field | Type | Description |
|-------|------|-------------|
| sponsorship_id | Data (unique) | Generated code. |
| member | Link (Member) | Sponsor. |
| beneficiary_member | Link (Member) | Beneficiary when already an active member. |
| beneficiary_newcomer | Link (Newcomer) | Used until the newcomer converts; auto-updated post-conversion. |
| beneficiary_display_name | Data (read-only) | Auto-derived from linked record to show bilingual name. |
| start_date | Date | Commitment start. |
| end_date | Date | Optional end. |
| monthly_amount | Currency | Pledged monthly contribution. |
| pledge_frequency | Select | Monthly, Quarterly, Semiannual, Annual, One-time. |
| pledge_channel | Select | In person, Online portal, Phone, Event booth. |
| reminder_channel | Select | Email, SMS, Phone, WhatsApp. |
| status | Select | Draft, Active, Paused, Lapsed, Completed. |
| program | Select | Education, Nutrition, Healthcare, Housing, Emergency Relief, Special Projects. |
| motivation | Select | Honor/Memorial, Community Outreach, Corporate, Parish Initiative, Other (requires note). |
| steward_notes | Text | Rich-text journal for stewardship context (templates enforced). |

**Lookups**: All select fields pull from `Reference Option`; reminders honor the sponsor's contact preference before defaulting to email.

**Indexes**: Index on (`member`, `status`).

## Engagement & Formation
### Newcomer
| Field | Type | Description |
|-------|------|-------------|
| newcomer_id | Data (unique) | Temporary ID until membership. |
| first_name | Data | Given name. |
| last_name | Data | Family name. |
| preferred_language | Select | en, am. |
| visit_date | Date | First contact date. |
| referred_by | Data | Referral source. |
| followup_owner | Link (User) | Responsible PR administrator. |
| notes | Text | Intake summary. |
| converted_member | Link (Member) | Set if promoted to member. |

**Indexes**: Index on `visit_date`, composite on (`last_name`, `first_name`).

### Abenet Enrollment
| Field | Type | Description |
|-------|------|-------------|
| member | Link (Member) | Adult formation participant. |
| cohort | Data | Cohort label (e.g., 2025 Lent). |
| enrollment_date | Date | Enrollment date. |
| completion_date | Date | Completion date (optional). |
| status | Select | Enrolled, On Hold, Completed, Withdrawn. |
| mentor | Link (User) | Mentor overseeing. |

**Indexes**: Composite index on (`cohort`, `member`).

### Sunday School Enrollment
| Field | Type | Description |
|-------|------|-------------|
| child | Link (Member) | Student member. |
| guardian | Link (Member) | Responsible adult. |
| class_level | Select | Kindergarten, Primary, Intermediate, Youth. |
| enrollment_date | Date | Start date. |
| expected_graduation | Date | When child advances class. |
| status | Select | Enrolled, Transferred, Completed. |
| mezmur_group | Link (Mezmur) | Choir placement. |

**Indexes**: Composite on (`class_level`, `status`). Age-based automation monitors
`birth_date` and triggers when a child turns 18.

### Lesson
| Field | Type | Description |
|-------|------|-------------|
| lesson_code | Data (unique) | Curriculum identifier. |
| title | Data | Lesson title (two-language fields). |
| description | Text | Outline. |
| level | Select | Sunday School, Abenet, Volunteer. |
| duration_minutes | Int | Planned duration. |
| resources | Child table | Linked resource files. |

**Indexes**: Unique on `lesson_code`.

### Mezmur
| Field | Type | Description |
|-------|------|-------------|
| mezmur_code | Data (unique) | Choir identifier. |
| title | Data | Song title. |
| language | Select | Ge'ez, Amharic, English. |
| category | Select | Liturgy, Youth, Special Event. |
| rehearsal_day | Select | Weekday. |
| conductor | Link (User) | Leader. |

**Indexes**: Index on (`category`, `language`).

## Volunteer Management
### Volunteer Group
| Field | Type | Description |
|-------|------|-------------|
| group_id | Data (unique) | Identifier. |
| name | Data | Group name. |
| ministry_area | Select | Hospitality, Choir, Outreach, Facilities, Media. |
| coordinator | Link (User) | Responsible leader. |
| meeting_schedule | Data | Recurring schedule. |

**Indexes**: Unique on `group_id`.

### Volunteer
| Field | Type | Description |
|-------|------|-------------|
| member | Link (Member) | Volunteer. |
| group | Link (Volunteer Group) | Primary group. |
| joined_on | Date | Participation start. |
| role | Select | Lead, Member, Trainee. |
| status | Select | Active, On Leave, Inactive. |

**Indexes**: Composite on (`group`, `status`).

### Service Log
| Field | Type | Description |
|-------|------|-------------|
| volunteer | Link (Volunteer) | Volunteer performing service. |
| service_date | Date | Date served. |
| hours | Float | Hours contributed. |
| description | Text | Summary of activity. |
| verified_by | Link (User) | Coordinator verifying. |

**Indexes**: Index on (`volunteer`, `service_date`).

## Media & Communications
### Media Request
| Field | Type | Description |
|-------|------|-------------|
| request_id | Data (unique) | Request code. |
| title | Data | Story or announcement title. |
| requester | Link (User) | Submitter. |
| ministry_area | Select | PR, Youth, Outreach, Council. |
| description | Text | Content brief. |
| submission_date | Date | Received date. |
| due_date | Date | Publication target. |
| assets | Table (File) | Attached media. |
| status | Select | Draft, In Review, Approved, Rejected, Published. |
| approved_by | Link (User) | Approver. |
| public_post | Link (Public Post) | Generated website entry (if approved). |

**Indexes**: Index on (`status`, `due_date`). Approval triggers creation of
`Public Post` and audit events.

### Public Post
| Field | Type | Description |
|-------|------|-------------|
| slug | Data (unique) | URL slug. |
| title | Data | Post title. |
| body | Text Editor | Rich content. |
| language | Select | en, am. |
| published_on | Date | Publication date. |
| hero_image | File | Optional hero asset. |
| source_media_request | Link (Media Request) | Origin reference. |
| tags | Table (Tag) | Taxonomy. |

**Indexes**: Unique on `slug`, index on `published_on`.

## Governance & Oversight
### Council Department
| Field | Type | Description |
|-------|------|-------------|
| department_id | Data (unique) | Identifier. |
| name | Data | Department name. |
| chair | Link (User) | Department chair. |
| charter | Text | Mission statement. |
| active | Check | Soft delete flag. |

**Indexes**: Unique on `department_id`.

### Council Trainee
| Field | Type | Description |
|-------|------|-------------|
| trainee_id | Data (unique) | Identifier. |
| member | Link (Member) | Trainee. |
| department | Link (Council Department) | Assigned department. |
| start_date | Date | Program start. |
| expected_completion | Date | Planned graduation. |
| mentor | Link (User) | Mentor. |
| status | Select | Active, Extended, Completed, Withdrawn. |

**Indexes**: Composite on (`department`, `status`).

### Audit Event
| Field | Type | Description |
|-------|------|-------------|
| event_type | Select | Import Started, Import Completed, Status Suggested, Status Approved, Payment Recorded, Payment Corrected, Media Approved, Media Published, Council Update, Manual Entry. |
| source_table | Data | Table/model referenced. |
| source_name | Data | Record name. |
| actor | Link (User) | User who triggered. |
| payload | JSON | Serialized context (diffs, CSV location, trace_id). |
| trace_id | Data | Observability identifier. |
| occurred_on | Datetime | Event timestamp. |

**Indexes**: Composite index on (`source_doctype`, `source_name`, `occurred_on`).

## Soft Delete & Retention Rules
- Models with `is_active` or `active` flags use soft deletes. List queries
  filter out inactive records by default but retain history for compliance.
- `Audit Event` records are immutable and retained indefinitely.
- `Public Post` retains previous versions via the `public_posts_history` table;
  deleting a post requires Council approval and is tracked via audit.

## Relationships Summary
- `Member` 1:N `Family Member`, `Member Status History`, `Payment`, `Sponsorship`,
  `Volunteer`, `Service Log`, `Abenet Enrollment`, `Sunday School Enrollment`.
- `Media Request` 1:1 `Public Post` upon approval.
- `Council Department` 1:N `Council Trainee`.
- `Lesson` and `Mezmur` referenced by enrollments and volunteer training flows.
- `Audit Event` references any entity via `source_table` and `source_name`.

## Denormalized Search Views
Read-optimized SQL views provide aggregated data for dashboards:
- **member_profile_view** – denormalizes member, household, latest status,
  sponsorship count, last payment date.
- **volunteer_engagement_view** – aggregates service hours by month.
- **media_pipeline_view** – tracks request statuses and publication lags.

Views are read-only and refreshed nightly with materialized snapshots for
performance.
