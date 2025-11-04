# Module Spec — Payments Ledger

## Overview
- Maintain immutable ledger for all contributions, tithes, school fees, and sponsorship payments. *(BRD §Payments)*
- Support correction workflow without altering original entries; expose reconciliation reports. *(BRD §Ledger Corrections)*

## Data Model
- Payment entity: amount, currency, method, service_type, member_id, household_id, recorded_by, posted_at, correction_of. *(BRD §Payments Data)*
- Correction entity links original and adjusted entries with reason + approver. *(BRD §Ledger Corrections)*
- Receipt metadata (reference number, attachment URL) stored separately to allow reissue. *(BRD §Receipts)*

## Business Rules
- Ledger entries append-only; corrections create new rows referencing `correction_of`. *(BRD §Ledger Corrections)*
- Finance Admin required to approve corrections; audit trail stored per action. *(BRD §Approvals)*
- Payments must reference active service type; rejects inactive mappings. *(BRD §Service Integration)*
- Daily close job locks previous day entries unless Finance Admin unlocks. *(BRD §Daily Close)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/payments` | List ledger entries with filters (date, type, member) | FinanceAdmin |
| POST | `/payments` | Record payment entry | FinanceAdmin, PublicRelations (for donations) |
| GET | `/payments/{id}` | Retrieve payment detail | FinanceAdmin |
| POST | `/payments/{id}/correct` | Submit correction request | FinanceAdmin |
| GET | `/payments/reports/summary` | Provide daily/monthly aggregates | FinanceAdmin |

## UAT Checklist
1. Finance Admin records tithe payment; ledger shows entry with immutable hash. *(BRD §Payments Data)*  
2. Correction flow creates new ledger row, original flagged as corrected; audit event emitted. *(BRD §Ledger Corrections)*  
3. Daily close prevents edits to locked day until unlock performed. *(BRD §Daily Close)*  
4. Summary endpoint reconciles totals with manual spreadsheet sample. *(BRD §Reports)*  
5. Inactive service type blocked with validation message. *(BRD §Service Integration)*
