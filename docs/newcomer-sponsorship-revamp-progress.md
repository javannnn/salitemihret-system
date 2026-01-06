# Newcomer Settlement and Sponsorship Revamp Progress

## Phase Checklist

- [x] Phase 1: Backend model + migration updates (case-centric)
- [x] Phase 2: Backend API updates (filters, timeline, notes, metrics)
- [x] Phase 3: Frontend rebuild (cases + wizard + profiles)
- [ ] Phase 4: QA

## Current Notes

- Status: Core backend + frontend revamp complete; QA blocked by missing pytest tooling.
- Backend updates:
  - County is now free-text on newcomers; county reference data endpoints removed.
  - Added migration to backfill county text from legacy counties and drop the counties table.
  - Added sponsorship notes table + timeline, sponsor context endpoint, and case metrics.
  - Added newcomer metrics endpoint, timeline aggregation, assignment/sponsorship audit events, and inactive notes.
  - Removed payment aggregation fields from sponsorship responses.
  - Added migration to introduce `newcomers.county` free-text column.
- Frontend updates:
  - Case-centric sponsorship list + wizard + case profile page with timeline and notes.
  - Newcomer list + wizard + full profile page with timeline and tabs.
  - Removed Counties reference data UI; county is free-text input + filter.
  - Sponsorship report updated to case-based metrics (no payment aggregation).
  - Sponsor search now reads `/members` results correctly (items list).
  - Vite proxy now auto-detects backend port (8001/8000) and API base defaults to `/api`.
  - Budget month/year/slots inputs converted to selects in the sponsorship wizard.
  - API capability detection added to avoid missing `/staff` and sponsor-context calls on older backends, with submit fallback.
- Tests:
  - Installed pip + requirements and ran `python3 -m pytest` in `server/`.
  - Tests failed under Python 3.10 because `datetime.UTC` is missing; project expects Python 3.11.
  - Pending: rerun tests under Python 3.11.

## Next Steps

- Install Python tooling (pip/pytest) and run backend test suite.
- Verify DB migrations with `alembic upgrade head` in a configured environment.
