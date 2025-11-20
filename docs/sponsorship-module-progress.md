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
- **Controlled Inputs**: Beneficiary pickers now pull from Member/Newcomer directories (no free text), programs/motivations/frequencies/reminder channels come from lookup tables rendered as chips, and stewardship notes rely on templates rather than blank textareas. Adjustment wizard enforces selections before submitting so exports and reminders stay aligned.
- **Data**: Seeds now include sample newcomers + sponsorship pledges so demo builds showcase the third pillar alongside Membership + Payments.
- **Testing**: `pytest` covers the end-to-end flow (create newcomer → sponsorship → conversion) with permission checks; frontend validated via Vite build.
- **v2.1 Enhancements (in progress)**: Upcoming release adds sponsor identity search with avatars/status chips, Father-of-Repentance sync, payment health cards, volunteer service tags, traffic-light status badges, segmented frequency controls with next-due logic, rejection reason enforcement, and month/year budget capacity bars feeding the sponsorship dashboard/detail/wizard UX described in specs.
