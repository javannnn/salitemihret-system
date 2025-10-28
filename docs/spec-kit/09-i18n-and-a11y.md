# Internationalization and Accessibility

## Localization Framework
- **Library**: `i18next` with `react-i18next` integration.
- **Supported Locales**: English (`en`) and Amharic (`am`). Future-proof by
  loading namespaces per module (e.g., `membership`, `payments`).
- **Resource Management**: Translation JSON files stored under
  `frontend/src/locales/<locale>/<namespace>.json`. Keys follow dotted notation.
- **Pluralization**: Use ICU message format via `i18next-icu` to handle Amharic
  plural rules.

## Date and Number Formatting
- Use `Intl.DateTimeFormat` and `Intl.NumberFormat` with locale derived from user
  preferences. Provide fallback to `en` if translation missing.
- Ethiopian calendar display toggle for pastoral reports; default to Gregorian
  for system consistency.
- Currency values always displayed in ETB with `ETB` currency code.

## Content Translation Workflow
- Admin-only translation editor built into system for rapid adjustments.
- New UI copy must be added to both `en` and `am` files before merge. CI fails if
  missing keys between locales.
- Import templates include bilingual column captions in top rows.

## Accessibility Standards
- Follow WCAG 2.1 Level AA guidelines.
- Provide ARIA labels for icon-only buttons in topbar and sidebar.
- Drawer components include `role="dialog"` with descriptive titles and
  `aria-modal="true"`.
- Import stepper announces progress via `aria-live="polite"` region.
- Keyboard focus order: topbar → sidebar → main content → drawer. Prevent focus
  traps by returning focus to triggering element on drawer close.
- Form errors surfaced inline with `aria-describedby`. Summary list at top of the
  form links to each erroneous field.

## Reduced Motion Support
- Detect `prefers-reduced-motion`; disable parallax and reduce animation
  durations to 80ms fades.
- Provide permanent user toggle in profile settings; persists in local storage.

## Color & Contrast
- Neo-Lumina palette tested for minimum contrast ratios. Use `nl-accent-600`
  for primary actions and `nl-surface-100` backgrounds to maintain readability.
- Provide high-contrast theme option toggled in accessibility settings.

## Screen Reader Considerations
- Inject breadcrumbs and page titles with `<h1>` elements to orient users.
- Tables include `<caption>` and `scope="col"` attributes.
- Import error CSV download links include descriptive text (`Download 12-row
  error report`).

## Amharic Input & Fonts
- Support Geez IME by disabling automatic capitalization on inputs flagged
  `lang="am"`.
- Use font stack `"Noto Sans Ethiopic", "Noto Sans", sans-serif`.
- Provide validation to prevent mixing scripts in member IDs.

## Testing
- Run automated Axe checks in CI.
- Manual screen reader testing with NVDA (Windows) and VoiceOver (macOS) twice
  per major release.
- Localization QA checklist ensures key user flows (import, status approval,
  media publishing) operate in both languages.
