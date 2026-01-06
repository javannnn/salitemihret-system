# Newcomer Settlement and Sponsorship Revamp Plan (Case-Centric)

## Principles and Non-Negotiables

- Settlement and Sponsorship stay separate modules with independent lifecycles and data models.
- Linking is explicit and referential, not merged. Combined view is UI-only.
- Full audit trail on status changes, reopens, and inactivation. No silent transitions.
- No hard deletes.
- Preserve `apps/` as read-only history.

## Current State Snapshot

- Sponsorship list reads like a sponsor directory with beneficiaries; lacks case-first columns and next-action logic.
- Sponsorship create flow is a 3-step modal but not aligned with the required sponsor/beneficiary/case journey.
- Sponsorship detail is a side drawer without timeline or restricted internal notes.
- Newcomer list lacks the required KPIs, filters, and case-centric table columns.
- Newcomer detail is a side drawer without a unified timeline or tabbed profile sections.
- County reference data endpoints are removed; legacy table cleanup is required to avoid drift.

## Target Scope Summary

### Sponsorship (Case-based)

- One row = one case. Columns: Case ID, Sponsor, Beneficiary, Status, Created, Last Update, Next Action, Actions.
- KPIs: Active Cases, Submitted (Pending Approval), This Month's Executed Sponsorships, Budget Utilization, Optional Suspended.
- Filters: status, beneficiary type, sponsor, county (newcomer), assigned admin, date range.
- New Sponsorship wizard:
  - Step 1: Select Sponsor (active only) + sponsor context panel.
  - Step 2: Select Beneficiary (newcomer link, create newcomer, external/member).
  - Step 3: Case details (summary, frequency free text, start date, budget/capacity, expiry).
  - Step 4: Review + Save Draft or Submit.
- Case profile page:
  - Status-driven primary actions.
  - Sponsor and beneficiary cards.
  - Timeline (created, submitted, approved/rejected, suspended, beneficiary linked/changed, completed).
  - Internal notes (author + admins only; others see restricted placeholders).

### Newcomer Settlement

- KPIs: New, In Progress, Settled, Closed (+ optional Inactive).
- Filters: status, county, assigned to, interpreter required, inactive.
- Table columns: Newcomer ID, Primary contact + family size, County, Status, Assigned to, Sponsored by, Linked sponsorship status, Last interaction, Actions.
- Newcomer wizard:
  - Identity, Contact, Temporary Address + County, Background.
- Newcomer profile:
  - Status-driven primary actions.
  - Timeline combining status changes, assignments, interactions, address changes, inactivate/reactivate, sponsor link.
  - Tabs: Overview, Contacts, Addresses, Background, Interactions, Sponsorship, Promote to Member.
- Status modals:
  - Settled reason (housing/job/both), inactivate reason + notes, reopen reason.

### Linking and Navigation

- Sponsorship <-> Newcomer linking is bidirectional with no duplication.
- County is a free-text field on newcomers; no reference data module.

## Phase Plan

### Phase 1: Backend Model + Migration Updates

- Sponsorship:
  - Allow free-text frequency (replace enum with string).
  - Add sponsorship notes table with restricted visibility.
  - Extend status audit actions to support created and beneficiary change events.
  - Add sponsor context query helpers and case metrics definitions.
- Newcomer:
  - Add inactivation notes field (reason + notes).
  - Add timeline feed endpoint (status audits + interactions + address history).
  - Add list fields for sponsor/assigned names, last interaction, and linked sponsorship status.
- Migrations:
  - Add new tables/columns; update enums safely.
  - Backfill newcomers.county from legacy counties and drop the counties table + county_id.

### Phase 2: Backend API Updates

- Sponsorship:
  - Case list filters: beneficiary type, sponsor, county, assigned admin, created date range.
  - Sponsor context endpoint for wizard (last status/date, 12-mo count, volunteer services, father of repentance).
  - Case timeline endpoint.
  - Notes CRUD with restricted visibility.
  - Update metrics payload for new KPIs.
- Newcomer:
  - Updated list filters (county/assigned/interpreter/inactive).
  - Timeline endpoint.
  - Inactivate endpoint requires notes.

### Phase 3: Frontend Updates

- Sponsorships:
  - Rebuild landing page (KPIs, filters, case table, next action column).
  - New wizard (4 steps) + inline newcomer creation.
  - New case profile page with timeline and notes.
- Newcomers:
  - Rebuild landing page (KPIs, filters, case table).
  - New wizard (4 steps).
  - New profile page with tabs and timeline.
- Navigation:
  - Remove Counties reference data UI and keep county as free text input/filter.

### Phase 4: QA

- Update tests for new payloads, filters, and metrics.
- Add tests for timeline and notes visibility.
- Run backend tests and document results.

## Decisions

- Sponsorship list is case-first; sponsor directory is a separate future view if needed.
- Frequency is free text (admin-defined per case).
- Executed sponsorships metric is based on case status history (Completed in current month).
