# Data Import & Export

## Import Pipelines
All imports run through the guided stepper and background jobs to protect system
performance. Templates are provided via `members.download_template` and related
export tools.

### Member Import
- **Template Format**: Excel (.xlsx) with UTF-8 encoding.
- **Required Headers (ordered)**:
  1. `member_id`
  2. `first_name`
  3. `last_name`
  4. `first_name_am`
  5. `last_name_am`
  6. `birth_date`
  7. `gender`
  8. `marital_status`
  9. `phone`
  10. `email`
  11. `address_line1`
  12. `city`
  13. `state_province`
  14. `postal_code`
  15. `country`
  16. `preferred_language`
  17. `household_code`
  18. `relationship`
  19. `status`
  20. `join_date`

- **Optional Headers**: `baptism_date`, `notes`.
- **Coercions**:
  - Dates parsed using ISO `YYYY-MM-DD`. Ethiopian calendar inputs accepted when
    suffixed with `EC` (e.g., `2016-05-10 EC`).
  - Phone numbers normalized to E.164. Local numbers auto-prepend +251.
  - Gender, marital status, relationship, status validated against enumerations.
- **Deduplication Rules**:
  - Detect duplicates on (`member_id`) or (`first_name`, `last_name`, `birth_date`).
  - When duplicate found and `status` differs, a warning entry created; record is
    skipped unless `Override Duplicate` column is set to `TRUE`.
  - Household codes create or join `Family Member` entries automatically.
- **Validation**:
  - Server-side validation implemented via `openpyxl`. Errors aggregated with
    row, column, and message.
  - Critical errors (invalid date, missing required field) block import.
  - Warnings (duplicate detection, missing optional fields) recorded for review.
- **Background Job**:
  - Enqueued under `members.import_members` with metadata about uploader role.
  - Job processes rows in batches of 200 to avoid lock contention.
  - Error CSV generated with headers: `row`, `column`, `message`, `raw_value`.
  - Job logs `Import Started` and `Import Completed` audit events.

### Payment Import
- Headers: `payment_reference`, `member_id`, `payment_date`, `amount`, `method`,
  `allocation`, `memo`.
- Deduplication on `payment_reference`. Duplicate imports create an error entry.
- Negative amounts allowed only when `method=Adjustment`.

### Sponsorship Import
- Headers: `sponsorship_id`, `member_id`, `beneficiary_name`, `program`,
  `monthly_amount`, `start_date`, `end_date`, `status`.
- Validates sponsor membership status (must be Active or Sponsor).

## Exports
- All list views provide CSV export via background job to avoid timeouts.
- Exported files include header row translations (English/Amharic) in first two
  rows.
- Sensitive exports (PII) require acknowledgement dialog and log `Manual Entry`
  audit event.
- Export job payload:
```json
{
  "doctype": "Member",
  "filters": {"status": "Active"},
  "format": "csv"
}
```
- Job stores result in S3-compatible storage with signed URL valid for 24 hours.

## Error Handling & Notifications
- Import failure triggers email to uploader with summary counts and link to
  error CSV.
- Notification includes `trace_id` and audit event reference.
- Admin dashboard displays recent import history with status and completion
  times.

## Data Quality Guardrails
- Weekly scheduled job checks for orphaned `Family Member` records and missing
  preferred language fields.
- Contribution streak job recalculates using payment data to validate status
  suggestions.
- When a child linked to Sunday School enrollment turns 18, background job moves
  record to adult program queue and notifies PR.

## Manual Adjustments
- Corrections performed through UI create new records rather than altering
  original imports. `correction_of` ensures lineage.
- Audit Event payload includes `correction_reason` and `previous_values`.

## Documentation
- Import guides stored in `docs/imports/`. Each guide includes screenshot of
  stepper stages, sample files, and troubleshooting FAQ.
