# Sponsorships Module

## Purpose
Track parish sponsorship commitments, beneficiary assignments, payment
compliance, and stewardship notes for sponsors.

## Roles & Permissions
- **Finance Clerk**: Full CRUD on sponsorships and pledge adjustments.
- **PR Administrator**: Read access, approve program changes, view notes.
- **Parish Registrar**: View sponsor linkage to member profile.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Sponsorship core | `Sponsorship` DocType | Includes pledge amount, dates, status.
| Beneficiary details | Inline child table | Supports bilingual names.
| Payment aggregation | Computed field | Summarizes contributions tied to pledge.

## User Flows
1. **List → Drawer → Actions**
   - Filter by status, program, amount range.
   - Drawer displays sponsor info, pledge history, recent payments, and notes.
   - Actions: Adjust pledge, Pause/Resume, End sponsorship.
2. **Pledge Adjustment**
   - Adjustment wizard captures new amount/effective date → creates new DocType
     version and audit event.
3. **Import Stepper**
   - Upload template with headers defined in Data Import spec; validation ensures
     sponsor membership is active.

## API Endpoints
- `GET/POST/PUT /api/resource/Sponsorship`
- `GET /api/method/salitemiret.api.sponsorships.summary` (for dashboards)

## Validation Rules
- `monthly_amount` must be positive.
- `end_date` cannot precede `start_date`.
- Sponsor must have status Active or Sponsor; otherwise warning raised.

## Notifications
- Monthly reminder email to sponsors with pledge summary.
- Alert to Finance Clerk when sponsorship expires or lapses.

## Reports & Exports
- **Pledge Fulfillment Report**: compares pledged vs. received amounts.
- **Program Enrollment Report**: sponsorships grouped by program.

## Edge Cases
- Sponsor switching beneficiary mid-term creates new record with original set to
  `Completed`; audit event captures reason.
- Suspended sponsor retains historical payments but hidden from active lists.

## Acceptance Criteria (Spec IDs)
- `SPN-AC-01`: Finance Clerk adjusts pledge and change propagates to dashboards
  within 5 minutes.
- `SPN-AC-02`: Export of active sponsorships completes < 2 minutes with accurate
  totals.
- `SPN-AC-03`: Lapsed sponsorship triggers notification to Finance Clerk.

## Tests
- Backend validation tests for amount/date rules and program transitions.
- Frontend drawer unit tests verifying note rendering and action buttons.
- Integration tests for pledge adjustment workflow.

## Security & Audit
- Finance notes classified as sensitive; hidden from non-finance roles.
- All pledge lifecycle changes emit `Audit Event` with actor and reason.
- Sponsor data included in audit exports for diocesan review.

## Implementation Plan
- **Day 5**: Create `apps/salitemiret/doctype/sponsorship/` DocType, child table
  definitions, and pledge adjustment hooks; add fixtures for default programs.
- **Day 5**: Implement sponsorship APIs (`apps/salitemiret/api/sponsorships.py`)
  for adjustments, exports, and reminders; configure stewardship jobs in
  `apps/salitemiret/background_jobs/stewardship.py`.
- **Day 5**: Build React sponsorship dashboard and drawer components in
  `frontend/src/features/sponsorships/`, including pledge adjustment wizard and
  reporting panels.
