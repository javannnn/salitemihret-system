# UX Patterns & Design Notes

## Visual System
- Uses the Neo-Lumina language from `docs/spec-kit/02-ux-principles.md`: deep indigo + warm accent gradients, glow on active nav, and glassy cards. Typography mixes display serif with an Inter-style body; light/dark themes maintain AA contrast.
- Active states use subtle shadows and gradients; badges and chips carry status color cues (e.g., payment status, member status).

## Layout & Motion
- Standard shell: sticky top bar + collapsible sidebar + content cards. Drawers slide from the right (filters, modals), backdrops blur the background.
- Framer Motion drives sidebar width animation, nav hover/active effects, and page transitions (~200ms). Reduced-motion users see fades instead of slides.
- Dashboard background uses soft gradient blobs for depth without sacrificing readability.

## Data Entry & Validation
- Forms use uppercase helper labels, concise helper text, and inline validation (e.g., password mismatch on onboard). Toasts back responses from API calls.
- Controlled chips/selects for statuses, programs, reminder channels, payment methods, and exception reasons keep free text to a minimum (notes/justifications only).
- Permission-aware editing: read-only banners (payments), hidden nav for unauthorized modules, bulk controls disabled when forbidden.

## Lists, Drawers, and Wizards
- List → menu pattern with row-level actions (Members) and modals/drawers (Father Confessor assignment, household/spouse drawers).
- Filter drawers provide structured selects plus Clear all/Apply; quick filter chips remain inline on list pages.
- Wizards power imports (members), sponsorship creation, and school enrollment/payment flows; steppers enforce required fields and show confirmation toasts.

## Import/Export & Reporting
- Members: CSV export honors filters or selected IDs; import wizard reports inserted/updated/failed counts and links to backend error CSV.
- Payments: report export respects active filters; per-row exports in Members via row menu. Abenet tuition report exports via the Schools workspace.
- Reports favor CSV for speed and compatibility; download helpers create Blob URLs client-side.

## Feedback & Support
- Toasts provide success/error messaging; destructive actions use confirm dialogs (archiving).
- Session-expiry overlay uses shield iconography and warm copy; license banner intent colors adapt to state (error/warning/info) with refresh/install buttons.
- Skeleton placeholders render while tables load; empty states use friendly copy with calls to action.

## Persistence & State
- Theme and sidebar collapse persist to `localStorage`; member list state persists via query params.
- Global search communicates role-based restrictions; quick actions hide when permissions are missing.
- Avatar initials derive from name/username to keep identity visible even without profile photos.
