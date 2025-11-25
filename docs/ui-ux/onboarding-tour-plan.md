# Onboarding Tour Plan

## Goals
- Modern, lightweight guided tour for new users; skippable and shown once by default, with a manual trigger from the avatar menu.
- Highlight navigation and core workflows (dashboard search, members list, member detail, payments, sponsorships, schools) while adapting to the user’s permissions.
- Respect accessibility (keyboard, reduced motion, high contrast) and avoid blocking work; resumable if closed mid-way.

## Trigger & Persistence
- Auto-start after first successful login when no `sm_onboarding_tour_v1` flag exists in `localStorage` (or future user-profile field). Mark as completed when the user finishes or explicitly skips; store last step to resume if interrupted.
- Add an avatar-menu entry (“Show tour”) and optional `?tour=start` query param to force-run for support/testing.
- Never auto-run for roles with zero visible modules; show a friendly message instead with the manual trigger available.

## Implementation Approach (frontend)
- Add a `TourContext` to manage tour state, current step, and persistence; wrap `AppShell` so steps can target shell + child routes.
- Use a guided-tour utility (`react-joyride` or `@reactour/tour`) for spotlight + tooltip styling; theme with existing Tailwind tokens (rounded glass cards, accent gradient primary buttons, subtle drop-shadows). If we avoid dependencies, a custom portal overlay with focus lock + arrow positioning is viable.
- Add stable data attributes/refs on anchors: `data-tour="sidebar"`, `theme-toggle`, `avatar-menu`, `dashboard-search`, `dashboard-quick-actions`, `members-search`, `members-filters`, `members-row-menu`, `payments-summary`, `payments-record`, `sponsorship-wizard`, `schools-tabs`, `schools-enrollment`, `schools-payment`.
- Respect `prefers-reduced-motion` by disabling spotlight movement and using fades; ensure Esc closes the tour and tab order is preserved.

## Step Script (permission-aware)
1. Welcome — explains skip/restart and reduced-motion respect.
2. Sidebar — modules list, collapse toggle, and active-state indicator.
3. Top bar — theme toggle, avatar menu (“Show tour” entry), license banner context.
4. Dashboard — global search scope + permission-aware quick actions.
5. Members list — search, quick filter chips, filter drawer, bulk bar, row action menu; call out import/export when available.
6. Member detail — section nav (identity/contact/household/giving), avatar upload, inline payments/audit cues; mention Save shortcuts.
7. Payments ledger — filters, summary cards, record/correct payment, export report (skip if `viewPayments` is false).
8. Sponsorships board — metrics, wizard steps, reminder action, newcomer lane + convert (skip if access missing).
9. Schools workspace — tab switcher (Abenet/Sunday School), enrollment/payment modals, content approvals (skip if module hidden).
10. Wrap-up — support pointer and how to replay; set completion flag.

## UX Notes
- Keep copy concise with CTA buttons (Back/Next/Skip/End) and a progress indicator (e.g., “Step 3 of 10”).
- Dim background with a blurred mask but trap clicks only near the target; avoid submitting underlying forms.
- Emit lightweight telemetry (or audit events) for start/finish/skip when available to gauge adoption and iterate.
