# Payments Module Blueprint

## Overview

Deliver the SPEC-PAY-001 payments ledger: immutable payment records with correction workflow, service-type validation, and finance-ready reporting. Backend work comes first so the React ledger UI can consume stable contracts.

## Feature Catalogue (Work Item #5)

| ID            | Feature                                      | Notes (Spec / BRD)                                   |
|---------------|----------------------------------------------|------------------------------------------------------|
| PAY-1         | Payment ledger entries                       | amount, currency, method, service_type, member, etc. |
| PAY-2         | Correction workflow                          | append-only, `correction_of`, approval, audit trail  |
| PAY-3         | Daily close / lock                           | lock/unlock per Finance Admin                        |
| PAY-4         | Service type registry                        | Active/Inactive map, validation                      |
| PAY-5         | Receipts metadata                            | Ref number + attachment                              |
| PAY-6         | Reports API                                  | daily/monthly summaries                              |
| PAY-7         | Ledger UI + correction dialog                | Finance-facing React pages                           |

## Phasing

### Phase 1 – Data Model & Migration

- Alembic migration introducing tables:
  - `payment_service_types` (code, label, active flag)
  - `payments` (immutable ledger rows)
  - `payment_receipts` (receipt metadata, optional attachment URL)
- SQLAlchemy models + Pydantic schemas for the above.
- Seed script updates to populate baseline service types (Tithe, Contribution, SchoolFee, Sponsorship).

### Phase 2 – Services & APIs

- `app/services/payments.py`:
  - `record_payment` (validates service type, locks)
  - `request_correction` / `apply_correction`
  - Daily close helpers (lock/unlock by day)
- FastAPI router `app/routers/payments.py`:
  - `GET /payments` + filters (date range, type, member, service_type, min/max amount)
  - `POST /payments`
  - `GET /payments/{payment_id}`
  - `POST /payments/{payment_id}/correct`
  - `GET /payments/reports/summary`
  - `GET /payments/export.csv` (Finance/Admin export; Office Admin read-only download)
- RBAC: Finance Admin and Admin have full control; Office Admin is read-only; other roles view payment info only through the Members module.
- Audit logging for every state change.

### Phase 3 – Background Jobs & Daily Close

- Scheduled job (APScheduler) to auto-lock previous day at 02:00 UTC; records status in `payment_day_locks` table or reuses metadata table.
- Admin endpoints/CLI to unlock specific day with justification.
- Notification hooks (log entries for now; email queue later).

### Phase 4 – Frontend Foundations

- API client helpers (`frontend/src/lib/api.ts`) for payments endpoints.
- React pages (scaffolding):
  - `PaymentsLedgerPage` (TanStack table, filters, pagination)
  - `PaymentFormDialog` (for manual entries)
  - `CorrectionDialog` (shows original vs. adjusted amounts, reason)
  - `ReportsSummaryCard`
  - Member-focused timeline view with deep link from the ledger (service + method badges, due dates)
- Add smart member lookup inside the manual payment dialog (search by name/email/phone + manual override).
- Hook up Finance Admin navigation + route guard.

### Phase 5 – QA & Docs

- Integration tests:
  - API contract tests for POST /payments, /correct
  - Ledger immutability unit tests
  - Daily close scenario tests
- Frontend smoke tests (Vitest/RTL) for ledger filters and correction dialog.
- Update `docs/demo-user-guide.md` with finance section.
- Update deployment checklist with new migration.

## Deliverables Checklist

- [x] Alembic migration + models for payment ledger, service types, receipts.
- [x] Seed data for service types.
- [x] FastAPI router + services covering ledger, corrections, reports.
- [x] APScheduler job + lock metadata table.
- [x] React ledger views (initial scaffolding).
- [ ] Tests (pytest + Vitest) covering key workflows.
- [ ] Documentation + QA checklist updates.

## Dependencies / Considerations

- Reuse existing member/household relations for foreign keys.
- File uploads (receipt attachment) can reuse current uploads directory; align with future media module.
- Ensure CORS origins already include client domain (no change expected).
- Watch for concurrency: use transactions when creating corrections + locks.
