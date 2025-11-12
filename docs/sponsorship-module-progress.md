# Sponsorship & Newcomer Progress

## Build Checklist

- [x] Sponsorship/Newcomer data model + Alembic migration (`newcomers`, `sponsorships` tables with enums).
- [x] REST APIs with RBAC (`/sponsorships`, `/newcomers`, reminders, conversion).
- [x] Service layer rules (pledge math, payment aggregation, newcomer conversion syncing beneficiaries).
- [x] React workspace for sponsorship board + newcomer pipeline.
- [x] Demo seeds & regression tests (pytest) covering the flow.

## Notes

- **Access Control**: SponsorshipCommittee/Admin manage records; Finance/OA/PR have read access. Newcomer actions follow PR/Registrar leadership.
- **Business Logic**: Sponsor must be active; rejects capture reason; reminder timestamps stored per frequency; newcomer conversion auto-links pending sponsorships.
- **UI**: `/sponsorships` page surfaces pledge health, reminders, slot usage, newcomer kanban, and creation modals with role-aware affordances.
- **Data**: Seeds now include sample newcomers + sponsorship pledges so demo builds showcase the third pillar alongside Membership + Payments.
- **Testing**: `pytest` covers the end-to-end flow (create newcomer → sponsorship → conversion) with permission checks; frontend validated via Vite build.
