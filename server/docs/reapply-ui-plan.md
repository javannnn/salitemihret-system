% Reapply Dashboard/UX Work Plan

Last updated: 2025-12-01

## Objective
Reconstruct the previously delivered dashboard and Sunday School experience (smart search, RBAC-aware quick actions, metadata tiles, polished Sunday banner, schema audit fix) without the animated dashboard hero or login redesign.

## Tasks
1. **Audit & checkout baseline**
   * Ensure repository clean (reset untracked files, fetch upstream) to avoid leftover artifacts.
   * Reintroduce `BlurText`/`@motionone/react` only if still needed by login intro; otherwise keep login/login page untouched.
2. **Rebuild dashboard hero/UI**
   * Re-apply the smart global search logic (member/admin/payments) with Stripe stats/notifications and RBAC quick-actions.
   * Restore stats cards, promotions, recent activity, and Sunday School banner from earlier patch.
   * Ensure dashboard uses live API data just like before, including the new status breakdown and payment feed.
3. **Sunday School content/banners**
   * Re-add “Content & Publishing Coming Soon” UI (text + layout) without the original form.
   * Confirm backend schema is patched (audit table migration) so API stops returning 500s.
4. **Login behavior**
   * Revert login page to original simple form with no extra hero or overlay.
   * If a welcome message is required pre-sign-in, implement a minimal animated text but keep the default form unchanged.
5. **Testing & cleanup**
   * Run `pnpm --dir frontend build`, ensure no warnings besides size.
   * Verify Sunday School API flag/backends unaffected.
   * Document changes in progress plan and ensure Stats page references the new behavior.

## Rollout
- Rebase against `main` to avoid conflicts (especially schema migration).
- Validate via dev server and production build.

