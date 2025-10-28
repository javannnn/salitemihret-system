# UX Principles

## Neo-Lumina Design Language
- **Palette**: Deep indigo bases, warm gold accents, and neutral parchment
  surfaces. Use Tailwind tokens `nl-primary`, `nl-accent`, and `nl-surface`.
- **Typography**: Display text uses "DM Serif Display"; body copy uses "Inter".
  Maintain a minimum contrast ratio of 4.5:1 for body text and 3:1 for large
  headings.
- **Iconography**: Feather icons with line weight harmonized to Tailwind spacing.
  Icons communicate state changes (e.g., status approved, pending review).
- **Illumination**: Gradients mimic candlelight cues. Use subtle glow effects to
  highlight active navigation or primary actions.

## Layout Framework
- **Topbar + Sidebar Shell**: Global topbar contains environment indicator,
  search, and quick actions. Sidebar lists primary modules grouped by ministry.
  Sidebar collapses to icon-only view on widths < 1200px.
- **Content Canvas**: Main content area supports list → drawer patterns.
  Persistent filters stay visible on large screens; transform into popover on
  smaller breakpoints.
- **Responsive Behavior**: Maintain minimum touch target of 44px. Drawer width is
  480px on desktop, 100% width on mobile.

## Drawer and Detail Patterns
- **List → Drawer Flow**: Selecting a record opens a right-side drawer with
  summary, tabs for details, activity (audit), and related actions.
- **Action Rail**: Primary actions appear at the top of the drawer; destructive
  variants require secondary confirmation modals.
- **Offline Feedback**: Drawer shows skeleton loaders while TanStack Query fetch
  resolves. Retry CTA surfaces if a request fails.

## Import Stepper Experience
- **Stages**: Upload → Column Mapping → Validation Preview → Submit Job → Results.
- **Guardrails**: Stepper enforces column mapping completion and highlights
  mismatched headers with inline translation helper (Amharic/English).
- **Background Job Feedback**: After submission, the stepper displays job ID,
  polling status, and download links for error CSVs.
- **Accessibility**: Each step includes `aria-describedby` for contextual help
  and keyboard focus automatically moves to the first actionable element.

## Motion Specification
- **Durations**: 120ms for button hover, 200ms for drawer entrance, 300ms for
  page transitions. Use cubic-bezier(0.16, 1, 0.3, 1) easing.
- **Staggered Animations**: List items cascade with 30ms offset to reinforce
  rhythm without overwhelming the user.
- **Reduced Motion**: Respect `prefers-reduced-motion`; switch to opacity fades
  and disable parallax effects.
- **Micro-Interactions**: Use Framer Motion to animate status badges on approval
  or rejection, reinforcing state changes.

## Accessibility & Internationalization
- Provide dual-language copy for headings and key labels through `i18next`
  resource bundles. All copy blocks are authorable in both English and Amharic.
- Date and number inputs support localized formats (Gregorian vs. Ethiopian
  calendar display) with toggles per user preference.
- Form validation errors surface both text and iconophic cues; error summaries
  list items with anchor links.
- Keyboard navigation: ensure tab order flows topbar → sidebar → content. Drawer
  interactions trap focus until closed.
- Use ARIA live regions for import job status updates and success/error toasts.

## Content Authoring Guidelines
- Copy tone is pastoral, warm, and precise. Avoid jargon where a multilingual
  administrator may struggle.
- Empty states include purposeful calls to action and quick links to relevant
  imports or documentation.
- Notifications must include both textual summary and supporting metadata (e.g.,
  member ID, family name).

## Error Handling
- Inline errors emphasize resolution steps rather than blame (e.g., "Upload the
  corrected spreadsheet" vs. "Invalid input").
- For server errors, display `trace_id` and provide link to submit support ticket
  referencing the audit event.
- Support re-openable drawers even after navigation to facilitate copying data.
