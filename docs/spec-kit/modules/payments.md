# Payments Module

## Purpose
Record member contributions, sponsorship remittances, and adjustments while
maintaining immutable audit trails suitable for financial reconciliation.

## Roles & Permissions
- **Finance Clerk**: Create payments, submit corrections, export ledgers.
- **Parish Registrar**: Read-only access for pastoral insights.
- **Council Secretary**: Read-only for governance review.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Payment details | `Payment` DocType | Includes reference, amount, allocation, method.
| Correction linkage | `correction_of` | Points to original payment when adjustments made.
| Audit info | `created_by_import`, `audit_event` | Tracks origin and audit reference.

## User Flows
1. **List → Drawer → Actions**
   - Filter by allocation, date range, correction status.
   - Drawer shows payment metadata, linked member, sponsorship info, and audit
     history.
   - Actions: Create correction, Download receipt, View audit event.
2. **Manual Entry**
   - Form ensures reference uniqueness, currency formatting, and status updates
     to related sponsorships.
3. **Correction Workflow**
   - "Create Correction" action opens modal requiring reason and amount. System
     creates new payment row with `method=Adjustment`, negative amount, and sets
     `correction_of`. Original record remains immutable.

## API Endpoints
- `GET/POST/PUT /api/resource/Payment`
- Reports via `/api/method/salitemiret.api.payments.export_ledger`

## Validation Rules
- `payment_reference` unique across all entries.
- Corrections cannot exceed original amount in absolute value and must occur
  within 60 days of original payment unless Council Secretary overrides.
- Allocation must match allowed list; sponsorship allocations require existing
  sponsorship.

## Notifications
- Correction creation triggers email to Finance Clerk group and PR Admin.
- Daily digest summarizes payments entered in last 24 hours.

## Reports & Exports
- **Ledger Export**: CSV with fields: reference, member, amount, method,
  allocation, correction_of, created_by_import, trace_id.
- **Allocation Summary**: Aggregates totals per fund per month.

## Edge Cases
- Imported payments lacking member ID flagged with error and skipped.
- Duplicate references from import produce error CSV entries.
- Reversal of correction requires new entry referencing the correction payment
  (never edits existing rows).

## Acceptance Criteria (Spec IDs)
- `PAY-AC-01`: Finance Clerk records payment and sees ledger update immediately.
- `PAY-AC-02`: Correction workflow produces new row with `correction_of` link
  and audit event `Payment Corrected`.
- `PAY-AC-03`: Ledger export completes under 2 minutes for 10k rows.

## Tests
- Backend tests for reference uniqueness, correction logic, and audit event
  payload.
- Frontend tests for drawer display, correction modal validation, and receipt
  download.
- Integration tests for import pipeline with negative adjustments.

## Security & Audit
- Payment data restricted to Finance and Council roles.
- Every insert/update triggers `Audit Event` with `trace_id`.
- Corrections require justification captured in audit payload.

## Implementation Plan
- **Day 4**: Implement `apps/salitemiret/doctype/payment/` DocType with
  correction validation and unique reference constraints; add fixtures for
  allocation options.
- **Day 4**: Expose payment APIs in `apps/salitemiret/api/payments.py`,
  including correction workflow and ledger export, plus pytest coverage under
  `apps/salitemiret/tests/payments/`.
- **Day 4**: Build React payments table, drawer, and correction modal in
  `frontend/src/features/payments/`, wiring TanStack Query caches and audit
  surfaces.
