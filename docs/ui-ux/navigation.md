# UI Navigation Map

## Shell & Global Controls
- React shell lives in `frontend/src/layouts/AppShell.tsx` with a collapsible sidebar and sticky top bar; width persists via `localStorage` key `sidebar_collapsed` and animates with Framer Motion.
- Authenticated routes sit under `ProtectedRoute`; unauthenticated users redirect to `/login`, while invite completion uses `/onboard`.
- Top bar hosts the Beta badge, theme toggle (light/dark via `ThemeContext`), and account avatar menu (My account modal, User management shortcut for super admins, Sign out). Session-expired overlay blocks the UI with reload/login options.
- License status card renders below the bar when data is available, showing state, expiry, customer, refresh action, and install/update CTA for Admin roles.
- Toasts surface bottom-right via `ToastProvider`; route transitions animate for smoother context switches.

## Primary Routes (App.tsx)
- `/dashboard` — landing page with global search, quick actions, member + finance + promotion summaries.
- `/members` — list view with filters, bulk actions, and CSV import/export; `/members/new` for intake; `/members/:id/edit` for full profile.
- `/payments` — ledger with filters, summary, correction dialog, and report export; member timeline at `/payments/members/:memberId`.
- `/sponsorships` — sponsorship + newcomer workspace; visible when the user can view sponsorships or newcomers.
- `/schools` — Sunday School + Abenet workspace; gated by `viewSchools/manageSchools`.
- `/admin/users` and `/admin/users/:id` — super admin only.
- `/account` — account profile surface (also reachable from the avatar menu).
- Auth surfaces: `/login` and `/onboard` (invite token acceptance).

## Sidebar
- Items: Dashboard, Members, Payments, Sponsorships, Schools, User Management (super admin).
- Active item shows an indigo gradient fill, animated left rail, and icon scale; collapsed mode keeps icons centered with an active dot.
- Collapse/expand control in the sidebar header persists between sessions; layout switches between 300px and 92px widths on desktop.

## Top Bar & Overlays
- Theme toggle animates icon swap and respects the current theme context.
- Account avatar shows initials derived from full name/username. Menu: My account (opens modal), User management (super admin), Sign out.
- Account modal overlays the shell with `AccountProfile`; closes via backdrop or Close button.
- License modal (install/update) opens from the banner; session-expired overlay appears when `subscribeSessionExpired` fires and forces reload/login.

## Navigation UX
- URL state persists in the member list (search, filters, sort, page) to support bookmarking/sharing.
- Hover/press states keep large hit targets (buttons ~44px), drawers and modals close on `Esc` and trap focus.
- Global page wrapper animates route changes (opacity + translate) for consistency across modules.
