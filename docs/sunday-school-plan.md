# Sunday School Module Plan (BRD v2.1 Alignment)

## Scope & Objectives
- Manage Sunday School participants (Child, Youth, Adult) linked to core members.
- Capture contribution intent (yes/no), monthly amount, payment method.
- Integrate with Payments module for service type `SUNDAY_SCHOOL` and expose last payment dates to Reports.
- Content workflows (Mezmur, Lessons, Kine Tebeb) with father approval before website publishing.
- Roles: Sunday School Admin (full control), Office Administrator (read-only), Fathers (approval).

## Functional Areas
### 1. Participants Management
- Fields: member username, FN/LN, gender, DOB, category, membership date, phone, email.
- Actions: list, filter (category, pays contribution, last payment window), create/edit, detail drawer.
- Link to payments history filtered by Sunday School service type.

### 2. Contribution & Payments
- Question: pays contribution? (Yes/No)
- If yes: amount + method (Cash/Direct Deposit/e-transfer/Credit).
- Sync with Payments module: create `SundaySchool` service type, endpoints for last payment, report hook.
- Dashboard KPIs pulling last 30-day income, paying vs non-paying breakdown.

### 3. Content Publishing
- Mezmur: title, category, content, status (Draft/Pending/Approved/Rejected), approval metadata.
- Education lessons: audience level, content, same approval workflow.
- Art/Kine Tebeb: student info + file upload + approval.
- Fathers review queue, only approved items flagged for website.

## Architecture / Data Model
- `SundaySchoolEnrollment` (existing table) extended with contribution fields.
- New tables: `sunday_school_contribution` (amount, method), `sunday_school_content` (type enum, fields, status, approval metadata).
- Payment service type: ensure `SundaySchool` exists via `ensure_default_service_types`.
- Reports view linking enrollment to payments (SQL view or service call).

## API Work
1. `/schools/sunday-school` (existing list) – expand payload to include contribution + last payment metadata.
2. POST/PUT Sunday enrollment – handle contribution info, set default dashboard fields.
3. `/schools/sunday-school/payments/summary` – aggregated stats for dashboard.
4. `/schools/sunday-school/content/*` – CRUD + approval endpoints for Mezmur, Lessons, Kine Tebeb.
5. `/reports/sunday-school` – expose FN/LN + last payment date for reporting module.

## Frontend Work
- Schools workspace tabs (Abenet/Sunday School) – Sunday School tab hosts dashboard + participants list.
- New pages/components:
  - `SundaySchoolDashboard` – KPIs, charts.
  - `SundaySchoolParticipants` – table, filters, drawer.
  - `SundaySchoolContent` – tabs for Mezmur, Lessons, Art with approval actions.
- Payment integration: call payments endpoints to show last payment date, button linking to Payments module filter.
- Approval workflow UI: status badges, “Send for approval”, “Approve/Reject” actions (role-gated).

## Permissions
- Extend RBAC map: `manageSundaySchool`, `viewSundaySchool`, `approveSundayContent` (fathers).
- Tie ProtectedRoute entries to these permissions.

## Implementation Milestones
1. **Foundation**: add payment service type, extend SundaySchoolEnrollment schema & API.
2. **Participants UI**: list/filter/drawer with contribution fields; integrate last payment call.
3. **Dashboard**: KPIs + charts consuming new `/payments` summaries.
4. **Content module**: backend models + approval endpoints, frontend management screens.
5. **Website publishing**: expose approved content to public site or export feed.

## Open Questions
- Confirm final set of payment methods (match ALLOWED_CONTRIBUTION_METHODS?).
- File storage for Kine Tebeb docs (S3/minio?).
- Are fathers a new role or reuse existing `Priest` accounts for approvals?

## Next Steps
- Lock down payment service type name & amounts.
- Design participant detail drawer layout.
- Define content approval UX mocks.
- Schedule backend migrations for contribution fields + content tables.
