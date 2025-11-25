# Members Module UI Revamp Plan

_Last updated: 2025-11-20_

## Objectives

1. Modernize the member detail experience with a premium SaaS feel (per UX blueprint).
2. Reduce scroll fatigue via section tabs, collapsible cards, and sticky actions.
3. Surface key integrations (Sunday School, Payments, Sponsorships) contextually.
4. Improve avatar management, quick navigation, and KPI visibility.
5. Maintain existing data flows/validators while upgrading presentation.

## Milestones & Tasks

### 1. Architecture & Research
- [ ] Analyze current `Members/Edit.tsx` layout, component dependencies, and side effects.
- [ ] Identify shared UI primitives (Buttons, Cards, Tabs) reusable in the new layout.
- [ ] Confirm permission gating rules (editCore, editFinance, manageSchools, etc.) to keep consistent behavior post-revamp.

### 2. Layout Foundation
- [x] Introduce sticky header (back button, name, status chip, actions) and sticky footer save bar scaffold.
- [x] Create responsive two-column grid (content rail + insights rail) with scroll anchors for each section.
- [x] Implement section tab navigation (desktop pill tabs + mobile segmented control) that scrolls to anchors and highlights active section.

### 3. Section Content Refactor
- **Identity & Membership**
  - [x] Reflow identity inputs into grids; add inline age calculation next to DOB.
  - [x] Align membership status selectors and membership date fields.
- **Sunday School**
  - [x] Render participant table + recent payments inside a dedicated card with quick action (open module).
  - [x] Show contribution stats (counts, status pills).
- **Membership Health**
  - [x] Surface auto/effective status, countdown to next payment, and renewal history.
  - [x] Provide manual override controls restricted to Admin/Finance roles with clear warnings.
- **Contact & Address**
  - [x] Pair address fields (district/street, city/region, postal/country) with consistent spacing.
  - [x] Keep duplicate checks + validation helpers intact.
- **Family**
  - [x] Provide collapsible spouse/children cards; convert children editor to compact grid/table.
  - [x] Inline “Add child”/“Add spouse” CTA buttons.
- **Tags & Ministries**
  - [x] Convert checkbox lists into chip selector grids; ensure search/filter potential for future iteration.
- **Payments & Notes**
  - [x] Move payments timeline + quick ledger form into accordion; keep service type + amount inputs.
  - [x] Keep notes area accessible with consistent height.

### 4. Right-Rail Enhancements
- [x] Compact avatar card (circular preview, initials fallback, upload/remove actions).
- [x] Quick action buttons (Payments, Sponsorships, Schools, Reports) with permission gating.
- [x] Member snapshot KPIs (age, member since, giving status, Sunday School overview).

### 5. Interaction & State Management
- [x] Track `hasUnsavedChanges`; trigger sticky footer status + disable save when necessary.
- [x] Extend `handleSubmit` so the revamped editor supports both edits and brand-new drafts without regressing validation, override, or toast behavior.
- [x] Maintain existing toasts, error handling, and permission-based disablement while layering in the new draft UX.
- [x] Retire the quick-add modal in `Members/List.tsx` and route `/members/new` to the revamped editor in “draft” mode so creation happens in the full UI.

### 6. Documentation & Validation
- [x] Update this plan and `docs/members-module-plan.md` with completed steps (layout shell, section refactors, creation flow).
- [x] Record progress in `docs/members-ui-revamp-progress.md`.
- [x] Run `pnpm build` (frontend) to verify compile success; smoke test key workflows.
- [ ] Capture follow-up tasks (e.g., dedicated components, design tokens) for future iterations.

## Dependencies & Risks
- Component refactor touches `Members/Edit.tsx`; ensure no regressions in linked hooks (permissions, metadata, payments).
- Sticky header/footer must coexist with existing AppShell; verify no overlap with global nav.
- Large diff size: plan incremental commits to avoid merge conflicts with ongoing backend work.

## Rollback Guidance
- Keep all UI revamp work on feature branches (e.g., `feature/members-ui-revamp`). If the redesign needs to be abandoned, run `git checkout main` to return to the stable branch.
- Each milestone should land in a discrete commit. To revert a problematic change use `git revert <commit_sha>` or `git checkout -- frontend/src/pages/Members/Edit.tsx` to restore the latest mainline version of that file.
- Before large edits, tag the current state (`git tag members-ui-pre-revamp`) so you can `git reset --hard members-ui-pre-revamp` if necessary.
- To undo the creation-flow overhaul specifically, revert the commits touching `frontend/src/pages/Members/Edit.tsx`, `frontend/src/pages/Members/List.tsx`, `frontend/src/pages/Members/Create.tsx`, and `frontend/src/App.tsx`. That immediately restores the legacy quick-add modal without disturbing other revamp work.
