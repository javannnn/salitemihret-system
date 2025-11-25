# User Journeys & Feature Map

## Auth & Session
- `/login` accepts username/password and redirects to `/dashboard` when authenticated.
- `/onboard` (invite acceptance) captures token from query or manual paste, enforces password confirmation, and toasts success/errors before redirecting to login.
- Session expiry triggers the AppShell overlay with Reload or Go to login CTAs; logout is always available from the avatar menu.

## Dashboard (`/dashboard`)
- Global search hits members (deep links to edit), households (links back to members list with filters), admin users (super admin only), and payments (when allowed). Shows idle/loading/restricted/empty/error states.
- Quick actions respect permissions: Add new member, Record a payment, Open sponsorship board, User management.
- Member summary cards display total/active/archived counts, completion %, and status breakdown bars.
- Promotion preview surfaces children approaching promotion with ready/upcoming counts from `getPromotionPreview`.
- Finance summary cards (when `viewPayments`) show totals per service type plus grand total; recent payments list shows latest ledger items with status chips.
- Notification stack mirrors roster/giving/promotion snapshots with timestamps for quick health checks.

## Members (`/members`, `/members/new`, `/members/:id/edit`)
- List page: search box + sort dropdown (updated/created/name), quick filter chips (Archived, Active, Has children, Missing phone, New this month), and filter drawer (status, gender, district, tag, ministry sourced from metadata).
- Actions menu (permissioned): Export CSV (filters or selected IDs), Import CSV wizard, plus Create member button when allowed.
- Bulk bar appears when rows are selected: assign father confessor, set household (drawer), export selected, archive selected (confirm).
- Table columns: Member (avatar/initials, names, username), Status + marital status, Family counts + father confessor indicator, Giving chips (tithe/contribution + amount/exception), Contact, Location, Actions.
- Row menu actions: View profile, Manage household, Manage spouse, Assign father confessor, Export CSV, Archive member (permissioned).
- Pagination + skeleton loaders; read-only/forbidden states surface an access banner with guidance.
- Edit page uses section nav (Identity, Membership, Sunday school, Contact, Household, Giving, Payments, Family, Ministries, Notes), avatar upload, duplicate detection (`findMemberDuplicates`), inline payment entry and history, ministry/tag chips, Sunday School status badges, household + spouse drawers, and audit/payments toasts. Permissions control which sections are editable.

## Payments (`/payments`, `/payments/members/:memberId`)
- Ledger list with filters (reference, service type, member, date range, method, status) and Reset filters.
- Summary row shows totals per service type plus grand total; read-only banner displays when the user lacks manage permissions.
- Actions: Export report (CSV), Record payment dialog (service type, member search/manual ID, amount, method, memo, status/due), correction modal from rows.
- Rows show member snippet, service type, method, amount, status badge, due date/memo; pagination available.
- Member payment timeline route shows per-member vertical timeline with status chips and links back to the profile.

## Sponsorships & Newcomers (`/sponsorships`)
- Workspace gates access via permissions; redirects to `/dashboard` if missing.
- Metrics cards show totals, newcomer counts, reminders, and budget signals from `getSponsorshipMetrics`.
- Filters: search, program/frequency/status chips, reminder channel, volunteer tags; quick reset via Refresh.
- Sponsorship table/drawer covers sponsor identity, Father of Repentance, beneficiary (member or newcomer), payment health, volunteer services, and timeline of notes/events.
- New sponsorship wizard (three steps): Basics (sponsor + beneficiary search including newcomers, father of repentance, amounts, start date), Program & Channels (program, pledge channel, reminder channel, motivation, volunteer services, note templates), Budget & Review (budget month/year/slots, preview + confirm). Save calls `createSponsorship`; reminder action triggers `remindSponsorship`.
- Newcomer board within the page lists statuses (New, InProgress, Sponsored, Converted, Closed), allows inline editing, conversion to member (`convertNewcomer`), and creating newcomers (`createNewcomer`) with phone/email capture.

## Schools (`/schools`)
- Two-tab workspace: Abenet and Sunday School; permissions gate management buttons.
- Abenet tab: filters by service stage/status/search; list shows child/parent, stage, status, last payment; actions to open enrollment modal (parent search + child selection/new child, fixed fields), payment modal (method, memo, amount from meta), and load Abenet tuition report (CSV table via `getAbenetReport`).
- Sunday School tab: filters by category/pays/search; roster shows member/child info, contribution status badge, mezmur assignment; actions to add participant (member search or manual details), log payments (fixed amount/method), and manage attendance/status.
- Content sub-section: create/update Sunday School content (Mezmur/Reflection/Other) with submit/approve/reject workflow; filter by type/status; uses `submitSundaySchoolContent/approve/reject` endpoints.
- Meta fetchers populate payment methods, service stages, and categories; toast feedback on errors.

## Account & Admin
- Account modal and `/account` route render profile form (name, username, password, member link) using `AccountProfile`.
- Admin → User management list/detail pages for super admins; reachable via sidebar or avatar menu (`/admin/users`).
- License banner + modal allow Admins to view state, refresh, and install/update license tokens against backend license endpoints.
