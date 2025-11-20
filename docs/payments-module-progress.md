# Payments Module Progress

## Phase Checklist

- [x] Phase 1 – Data model & migration
- [x] Phase 2 – Services & REST APIs
- [x] Phase 3 – Background jobs & daily close
- [x] Phase 4 – Frontend ledger & correction UI
- [x] Phase 5 – QA & documentation

## Current Notes

- _Status_: Payment service types, ledger tables, and receipt metadata are in place (SQLAlchemy models + Alembic `0007_payments_ledger`). Demo seed now provisions baseline service types and sample payments. FastAPI payments router (list/create/detail/correct/summary/export + `/locks` endpoints) and service layer are live with RBAC enforced (Finance/Admin full control, Office Admin read-only). The CSV export endpoint produces the required report fields (member contact info, service type, method, status, due date). Frontend ledger view now includes filters, summary cards, an export button, animated status chips with due-date highlights, Finance-only record/correction flows, an auto-suggest member picker that links directly to a dedicated payment timeline view for each member, and a Finance-only dashboard card for quick revenue insights.
- _Service type guard_: `payments_service.ensure_default_service_types` now auto-inserts the baseline ledger codes (`CONTRIBUTION`, `TITHE`, `DONATION`, `SCHOOLFEE`, `SPONSORSHIP`) whenever `/payments/service-types` is hit. Finance/Admin UIs no longer render empty dropdowns if the reference table was never seeded, and the demo seed calls the same helper immediately after members are created.
- _Daily close_: Alembic `718d5f0680b9_payment_day_locks` introduces the `payment_day_locks` table. `record_payment` and corrections now enforce locks, Finance/Admin roles can list/lock/unlock via `/payments/locks`, and APScheduler auto-closes the previous day at 02:05 UTC. Notification hooks log lock/unlock actions. Unlocking requires a justification.
- _QA & docs_: `docs/demo-user-guide.md`, `docs/qa-checklist.md`, and `docs/deploy-pipeline.md` now cover the finance snapshot, lock/unlock flows, and new migration. Manual test plan includes member auto-linking, payment timelines, and closing/unlocking days. Email notifications remain stubbed until the mail provider is finalized.

Update this file after each phase with progress, blockers, and test results.
