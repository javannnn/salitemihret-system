---
description: "Task list template for feature implementation"
---

# Tasks: Core Plan

**Input**: Design documents from `/specs/001-core-plan/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Follow the constitution mandate for testing-first delivery—write failing tests before coding and keep them green thereafter.

**Organization**: Tasks are grouped by user story so each increment is independently implementable and testable.

**Branch Naming**: Use `feat/SPEC-<ID>-<slug>` for each spec deliverable (e.g., `feat/SPEC-AUTH-001-rbac-baseline`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Backend (Frappe): `server/apps/salitemihret/`
- Frontend (React admin): `web/src/`
- Contracts: `contracts/`
- Tests: `server/apps/salitemihret/tests/`, `web/src/**/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish project scaffolding, baseline tooling, and shared understanding before implementation.
**Spec Alignment**: Prerequisite groundwork for SPEC-AUTH-001 onward.

- [ ] T001 Compile DocType schema checklist from `docs/spec-kit/03-domain-model.md` into `server/docs/doctype-schema.md`
- [ ] T002 Record audit event model and RBAC matrix decisions in `docs/security/rbac-matrix.md`
- [ ] T003 Scaffold Frappe bench application `salitemihret` under `server/apps/salitemihret/hooks.py`
- [ ] T004 Initialize Python tooling and dependencies for the Frappe app in `server/pyproject.toml`
- [ ] T005 Initialize React admin workspace with required libraries in `web/package.json`
- [ ] T006 Author local developer bootstrap instructions in `docs/setup/local-development.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before any user story work can begin.
**Spec Alignment**: Enables execution of all SPEC-* deliverables.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T007 Create shared environment template at `.env.example`
- [ ] T008 Configure bench site defaults for MariaDB, S3, and queues in `server/sites/common_site_config.json`
- [ ] T009 Define background worker queues in `server/apps/salitemihret/config/queues.py`
- [ ] T010 Implement structured logging defaults in `server/apps/salitemihret/config/logging.py`
- [ ] T011 Establish REST client wrapper and TanStack Query provider in `web/src/lib/apiClient.ts`

**Checkpoint**: Foundation ready—user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - SPEC-AUTH-001 & SPEC-AUTH-002 Secure RBAC & Audit Trail (Priority: P1) 🎯 MVP

**Spec Coverage**: SPEC-AUTH-001 Harden RBAC permissions; SPEC-AUTH-002 Implement audit event ingestion pipeline.  
**Suggested Branches**: `feat/SPEC-AUTH-001-rbac-baseline`, `feat/SPEC-AUTH-002-audit-events`.

**Goal**: Deliver authenticated access with deny-by-default RBAC and immutable audit trails for all privileged actions.

**Independent Test**: Verify login, role-restricted navigation, and audit event capture without downstream modules.

### Tests for User Story 1 (MANDATORY) ⚠️

- [ ] T012 [P] [US1] Add RBAC integration tests covering role guards in `server/apps/salitemihret/tests/integration/test_auth_rbac.py` for SPEC-AUTH-001
- [ ] T013 [P] [US1] Add audit event contract tests in `server/apps/salitemihret/tests/contract/test_audit_events.py` for SPEC-AUTH-002

### Implementation for User Story 1

- [ ] T014 [P] [US1] Create Role DocType definition in `server/apps/salitemihret/doctype/role/role.json` for SPEC-AUTH-001
- [ ] T015 [P] [US1] Create Role Permission DocType in `server/apps/salitemihret/doctype/role_permission/role_permission.json` for SPEC-AUTH-001
- [ ] T016 [P] [US1] Create Audit Event DocType in `server/apps/salitemihret/doctype/audit_event/audit_event.json` for SPEC-AUTH-002
- [ ] T017 [US1] Implement RBAC policy utilities in `server/apps/salitemihret/auth/rbac.py` for SPEC-AUTH-001
- [ ] T018 [US1] Implement audit logging service in `server/apps/salitemihret/audit/logger.py` for SPEC-AUTH-002
- [ ] T019 [US1] Expose authentication and session APIs in `server/apps/salitemihret/api/auth.py` for SPEC-AUTH-001
- [ ] T020 [US1] Configure audit hooks in `server/apps/salitemihret/hooks.py` for SPEC-AUTH-002
- [ ] T021 [P] [US1] Build login and role guard components in `web/src/features/auth/AuthGate.tsx` for SPEC-AUTH-001
- [ ] T022 [US1] Wire admin shell navigation with RBAC in `web/src/layouts/AdminShell.tsx` for SPEC-AUTH-001

**Checkpoint**: User Story 1 is independently testable with enforced RBAC and audit trails.

---

## Phase 4: User Story 2 - SPEC-MBR-001 & SPEC-MBR-002 Member Lifecycle Management (Priority: P1)

**Spec Coverage**: SPEC-MBR-001 Member import workflow; SPEC-MBR-002 Automated status suggestions and PR approvals.  
**Suggested Branches**: `feat/SPEC-MBR-001-import-pipeline`, `feat/SPEC-MBR-002-status-suggestion`.

**Goal**: Manage member records, imports, family links, and status approvals for PR teams.

**Independent Test**: Run import stepper, validate family linking, and approve status suggestions without dependencies on later stories.

### Tests for User Story 2 (MANDATORY) ⚠️

- [ ] T023 [P] [US2] Add member import integration tests in `server/apps/salitemihret/tests/integration/test_member_import.py` for SPEC-MBR-001
- [ ] T024 [P] [US2] Add member UI import stepper tests in `web/src/features/members/__tests__/ImportStepper.test.tsx` for SPEC-MBR-001

### Implementation for User Story 2

- [ ] T025 [P] [US2] Create Member DocType definition in `server/apps/salitemihret/doctype/member/member.json` for SPEC-MBR-001
- [ ] T026 [P] [US2] Create Family Link DocType in `server/apps/salitemihret/doctype/member_family/member_family.json` for SPEC-MBR-001 and SPEC-MBR-002
- [ ] T027 [US2] Implement import pipeline service in `server/apps/salitemihret/members/import_service.py` for SPEC-MBR-001
- [ ] T028 [US2] Implement status suggestion logic in `server/apps/salitemihret/members/status_rules.py` for SPEC-MBR-002
- [ ] T029 [US2] Expose member APIs in `server/apps/salitemihret/api/members.py` for SPEC-MBR-001 and SPEC-MBR-002
- [ ] T030 [P] [US2] Build member management dashboard in `web/src/features/members/MemberDashboard.tsx` for SPEC-MBR-001
- [ ] T031 [P] [US2] Build import stepper UI in `web/src/features/members/ImportStepper.tsx` for SPEC-MBR-001
- [ ] T032 [US2] Build status approval panel in `web/src/features/members/StatusApprovalPanel.tsx` for SPEC-MBR-002

**Checkpoint**: Member lifecycle flows operate end-to-end and pass independent tests.

---

## Phase 5: User Story 3 - SPEC-PAY-001 Payments Ledger & Corrections (Priority: P1)

**Spec Coverage**: SPEC-PAY-001 Immutable payment ledger with correction workflow.  
**Suggested Branch**: `feat/SPEC-PAY-001-ledger`.

**Goal**: Provide an immutable ledger for contributions with a correction workflow and audit visibility.

**Independent Test**: Record payments, trigger corrections, and review ledger audit without upstream dependencies.

### Tests for User Story 3 (MANDATORY) ⚠️

- [ ] T033 [P] [US3] Add ledger invariant unit tests in `server/apps/salitemihret/tests/unit/test_payment_ledger.py` for SPEC-PAY-001
- [ ] T034 [P] [US3] Add correction flow UI tests in `web/src/features/payments/__tests__/CorrectionFlow.test.tsx` for SPEC-PAY-001

### Implementation for User Story 3

- [ ] T035 [P] [US3] Create Payment Entry DocType in `server/apps/salitemihret/doctype/payment_entry/payment_entry.json` for SPEC-PAY-001
- [ ] T036 [P] [US3] Create Payment Correction DocType in `server/apps/salitemihret/doctype/payment_correction/payment_correction.json` for SPEC-PAY-001
- [ ] T037 [US3] Implement ledger service enforcing immutability in `server/apps/salitemihret/payments/ledger_service.py` for SPEC-PAY-001
- [ ] T038 [US3] Implement correction workflow service in `server/apps/salitemihret/payments/correction_service.py` for SPEC-PAY-001
- [ ] T039 [US3] Expose payments APIs in `server/apps/salitemihret/api/payments.py` for SPEC-PAY-001
- [ ] T040 [US3] Register ledger audit hooks in `server/apps/salitemihret/hooks/payment_hooks.py` for SPEC-PAY-001
- [ ] T041 [P] [US3] Build payments ledger UI in `web/src/features/payments/PaymentsLedgerPage.tsx` for SPEC-PAY-001
- [ ] T042 [US3] Build correction workflow UI in `web/src/features/payments/CorrectionDialog.tsx` for SPEC-PAY-001

**Checkpoint**: Payments ledger runs independently with correction and audit support.

---

## Phase 6: User Story 4 - SPEC-SPN-001 & SPEC-NEW-001 Sponsorship & Newcomer Flow (Priority: P2)

**Spec Coverage**: SPEC-SPN-001 Pledge adjustment workflow and reminders; SPEC-NEW-001 Newcomer conversion and follow-up digests.  
**Suggested Branches**: `feat/SPEC-SPN-001-pledge-adjust`, `feat/SPEC-NEW-001-conversion`.

**Goal**: Track sponsorship pledges, manage newcomer settlement, and automate reminders.

**Independent Test**: Capture pledges, convert newcomers, and verify reminder scheduling without relying on later stories.

### Tests for User Story 4 (MANDATORY) ⚠️

- [ ] T043 [P] [US4] Add sponsorship integration tests in `server/apps/salitemihret/tests/integration/test_sponsorship.py` for SPEC-SPN-001
- [ ] T044 [P] [US4] Add newcomer flow UI tests in `web/src/features/sponsorship/__tests__/NewcomerFlow.test.tsx` for SPEC-NEW-001

### Implementation for User Story 4

- [ ] T045 [P] [US4] Create Sponsorship DocType in `server/apps/salitemihret/doctype/sponsorship/sponsorship.json` for SPEC-SPN-001
- [ ] T046 [P] [US4] Create Newcomer DocType in `server/apps/salitemihret/doctype/newcomer/newcomer.json` for SPEC-NEW-001
- [ ] T047 [US4] Implement pledge service with frequency handling in `server/apps/salitemihret/sponsorship/pledge_service.py` for SPEC-SPN-001
- [ ] T048 [US4] Implement newcomer conversion jobs in `server/apps/salitemihret/sponsorship/newcomer_jobs.py` for SPEC-NEW-001
- [ ] T049 [US4] Expose sponsorship APIs in `server/apps/salitemihret/api/sponsorship.py` for SPEC-SPN-001 and SPEC-NEW-001
- [ ] T050 [P] [US4] Build sponsorship board UI in `web/src/features/sponsorship/SponsorshipBoard.tsx` for SPEC-SPN-001
- [ ] T051 [US4] Build newcomer pipeline UI in `web/src/features/sponsorship/NewcomerPipeline.tsx` for SPEC-NEW-001

**Checkpoint**: Sponsorship and newcomer flows complete with reminders and UI.

---

## Phase 7: User Story 5 - SPEC-SCH-001 School Enrollment & Billing (Priority: P2)

**Spec Coverage**: SPEC-SCH-001 Sunday School enrollment and promotion automation.  
**Suggested Branch**: `feat/SPEC-SCH-001-enrollment`.

**Goal**: Manage Sunday School enrollments, class rosters, and monthly billing reminders.

**Independent Test**: Enroll students, manage rosters, and verify billing notifications without cross-module dependencies.

### Tests for User Story 5 (MANDATORY) ⚠️

- [ ] T052 [P] [US5] Add school enrollment integration tests in `server/apps/salitemihret/tests/integration/test_school_enrollment.py` for SPEC-SCH-001
- [ ] T053 [P] [US5] Add promotion helper UI tests in `web/src/features/schools/__tests__/PromotionHelpers.test.tsx` for SPEC-SCH-001

### Implementation for User Story 5

- [ ] T054 [P] [US5] Create School Enrollment DocType in `server/apps/salitemihret/doctype/school_enrollment/school_enrollment.json` for SPEC-SCH-001
- [ ] T055 [P] [US5] Create Class Roster DocType in `server/apps/salitemihret/doctype/class_roster/class_roster.json` for SPEC-SCH-001
- [ ] T056 [US5] Implement enrollment service in `server/apps/salitemihret/schools/enrollment_service.py` for SPEC-SCH-001
- [ ] T057 [US5] Implement monthly fee reminder jobs in `server/apps/salitemihret/schools/billing_jobs.py` for SPEC-SCH-001
- [ ] T058 [US5] Expose schools APIs in `server/apps/salitemihret/api/schools.py` for SPEC-SCH-001
- [ ] T059 [P] [US5] Build school enrollment UI in `web/src/features/schools/EnrollmentPage.tsx` for SPEC-SCH-001
- [ ] T060 [US5] Build roster management UI in `web/src/features/schools/RosterManager.tsx` for SPEC-SCH-001

**Checkpoint**: School enrollment, rosters, and billing reminders operate independently.

---

## Phase 8: User Story 6 - SPEC-VOL-001 Volunteer Rosters & Logs (Priority: P2)

**Spec Coverage**: SPEC-VOL-001 Volunteer service logging and inactivity digest.  
**Suggested Branch**: `feat/SPEC-VOL-001-service-log`.

**Goal**: Coordinate volunteer groups, maintain rosters, and record service logs with inactivity digests.

**Independent Test**: Schedule rosters, log service, and generate inactivity digests without other story dependencies.

### Tests for User Story 6 (MANDATORY) ⚠️

- [ ] T061 [P] [US6] Add volunteer log integration tests in `server/apps/salitemihret/tests/integration/test_volunteer_logs.py` for SPEC-VOL-001
- [ ] T062 [P] [US6] Add volunteer roster UI tests in `web/src/features/volunteers/__tests__/RosterBoard.test.tsx` for SPEC-VOL-001

### Implementation for User Story 6

- [ ] T063 [P] [US6] Create Volunteer DocType in `server/apps/salitemihret/doctype/volunteer/volunteer.json` for SPEC-VOL-001
- [ ] T064 [P] [US6] Create Volunteer Log DocType in `server/apps/salitemihret/doctype/volunteer_log/volunteer_log.json` for SPEC-VOL-001
- [ ] T065 [US6] Implement roster service in `server/apps/salitemihret/volunteers/roster_service.py` for SPEC-VOL-001
- [ ] T066 [US6] Implement inactivity digest jobs in `server/apps/salitemihret/volunteers/digest_job.py` for SPEC-VOL-001
- [ ] T067 [US6] Expose volunteer APIs in `server/apps/salitemihret/api/volunteers.py` for SPEC-VOL-001
- [ ] T068 [P] [US6] Build volunteer roster UI in `web/src/features/volunteers/RosterBoard.tsx` for SPEC-VOL-001
- [ ] T069 [US6] Build service logging UI in `web/src/features/volunteers/ServiceLogForm.tsx` for SPEC-VOL-001

**Checkpoint**: Volunteer coordination runs independently with digests and UI coverage.

---

## Phase 9: User Story 7 - SPEC-MED-001 Media Approvals Pipeline (Priority: P3)

**Spec Coverage**: SPEC-MED-001 Media request approval to public publication flow.  
**Suggested Branch**: `feat/SPEC-MED-001-publication`.

**Goal**: Manage media requests through approval workflows and publish approved items to the public feed.

**Independent Test**: Submit requests, approve/reject them, and push approved content to the feed without other modules.

### Tests for User Story 7 (MANDATORY) ⚠️

- [ ] T070 [P] [US7] Add media request contract tests in `server/apps/salitemihret/tests/contract/test_media_requests.py` for SPEC-MED-001
- [ ] T071 [P] [US7] Add media approval UI tests in `web/src/features/media/__tests__/MediaApprovalFlow.test.tsx` for SPEC-MED-001

### Implementation for User Story 7

- [ ] T072 [P] [US7] Create Media Request DocType in `server/apps/salitemihret/doctype/media_request/media_request.json` for SPEC-MED-001
- [ ] T073 [US7] Implement media approval service in `server/apps/salitemihret/media/approval_service.py` for SPEC-MED-001
- [ ] T074 [US7] Implement public feed publisher in `server/apps/salitemihret/media/public_feed.py` for SPEC-MED-001
- [ ] T075 [US7] Expose media APIs in `server/apps/salitemihret/api/media.py` for SPEC-MED-001
- [ ] T076 [P] [US7] Build media approval queue UI in `web/src/features/media/ApprovalQueue.tsx` for SPEC-MED-001
- [ ] T077 [US7] Build public feed admin UI in `web/src/features/media/PublicFeedPanel.tsx` for SPEC-MED-001

**Checkpoint**: Media approvals and publishing operate independently.

---

## Phase 10: User Story 8 - SPEC-COU-001 Councils Governance (Priority: P3)

**Spec Coverage**: SPEC-COU-001 Council department governance dashboard.  
**Suggested Branch**: `feat/SPEC-COU-001-dashboard`.

**Goal**: Track councils, trainees, and terms with governance dashboards.

**Independent Test**: Create councils, assign trainees, and review dashboards without other modules.

### Tests for User Story 8 (MANDATORY) ⚠️

- [ ] T078 [P] [US8] Add council lifecycle integration tests in `server/apps/salitemihret/tests/integration/test_councils.py` for SPEC-COU-001
- [ ] T079 [P] [US8] Add council dashboard UI tests in `web/src/features/councils/__tests__/CouncilDashboard.test.tsx` for SPEC-COU-001

### Implementation for User Story 8

- [ ] T080 [P] [US8] Create Council DocType in `server/apps/salitemihret/doctype/council/council.json` for SPEC-COU-001
- [ ] T081 [P] [US8] Create Council Term DocType in `server/apps/salitemihret/doctype/council_term/council_term.json` for SPEC-COU-001
- [ ] T082 [US8] Implement governance service in `server/apps/salitemihret/councils/governance_service.py` for SPEC-COU-001
- [ ] T083 [US8] Expose councils APIs in `server/apps/salitemihret/api/councils.py` for SPEC-COU-001
- [ ] T084 [US8] Build council dashboard UI in `web/src/features/councils/CouncilDashboard.tsx` for SPEC-COU-001

**Checkpoint**: Councils governance stands alone with dashboards and APIs.

---

## Phase 11: User Story 9 - SPEC-REP-001 Operational Reporting Dashboards (Priority: P3)

**Spec Coverage**: SPEC-REP-001 Report execution engine and scheduling.  
**Suggested Branch**: `feat/SPEC-REP-001-reporting`.

**Goal**: Deliver cross-module reporting APIs and dashboards for operational insights.

**Independent Test**: Fetch reporting datasets and render dashboards without needing polish tasks.

### Tests for User Story 9 (MANDATORY) ⚠️

- [ ] T085 [P] [US9] Add reporting API contract tests in `server/apps/salitemihret/tests/contract/test_reports_api.py` for SPEC-REP-001
- [ ] T086 [P] [US9] Add dashboard UI tests in `web/src/features/reports/__tests__/DashboardView.test.tsx` for SPEC-REP-001

### Implementation for User Story 9

- [ ] T087 [P] [US9] Define reporting source configuration in `server/apps/salitemihret/reports/config/report_sources.yaml` for SPEC-REP-001
- [ ] T088 [US9] Implement reporting engine service in `server/apps/salitemihret/reports/report_engine.py` for SPEC-REP-001
- [ ] T089 [US9] Implement scheduled reporting jobs in `server/apps/salitemihret/reports/scheduler.py` for SPEC-REP-001
- [ ] T090 [US9] Expose reporting APIs in `server/apps/salitemihret/api/reports.py` for SPEC-REP-001
- [ ] T091 [P] [US9] Build reports dashboard UI in `web/src/features/reports/ReportsDashboard.tsx` for SPEC-REP-001
- [ ] T092 [US9] Build cross-module filter bar in `web/src/features/reports/FilterBar.tsx` for SPEC-REP-001

**Checkpoint**: Reporting dashboards and APIs operate independently and satisfy spec expectations.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Spec Coverage**: SPEC-OPS-001 Observability and backup hardening; SPEC-UX-001 Localization and accessibility compliance.  
**Suggested Branches**: `feat/SPEC-OPS-001-hardening`, `feat/SPEC-UX-001-a11y-i18n`.

- [ ] T093 [P] Instrument tracing and metrics exporters in `server/apps/salitemihret/observability/tracing.py` for SPEC-OPS-001
- [ ] T094 Harden automated backups in `server/scripts/backup_plan.sh` for SPEC-OPS-001
- [ ] T095 [P] Finalize Amharic translations in `web/src/i18n/locales/am.json` for SPEC-UX-001
- [ ] T096 Conduct accessibility audit checklist in `web/src/features/__a11y__/audit.md` for SPEC-UX-001
- [ ] T097 Update runbook documentation in `docs/operations/runbook.md` for SPEC-OPS-001 and SPEC-UX-001
- [ ] T098 [P] Validate developer quickstart flow in `docs/setup/quickstart.md` for SPEC-OPS-001 and SPEC-UX-001

---

## Dependencies & Execution Order

**Phase Dependencies**
- Setup (Phase 1) → prerequisite for Foundational work (enables SPEC-AUTH-001 onward).
- Foundational (Phase 2) → prerequisite for all spec deliverables (SPEC-AUTH-001 through SPEC-REP-001).
- User Stories (Phases 3–11) → execute in priority order (P1 → P2 → P3) once Phase 2 completes.
- Polish (Phase 12) → begins after desired user stories are code-complete; covers SPEC-OPS-001 and SPEC-UX-001.

**User Story Dependencies**
- **US1 (P1)**: SPEC-AUTH-001 / SPEC-AUTH-002, independent once foundational work lands; enables security hooks for later specs.
- **US2 (P1)**: SPEC-MBR-001 / SPEC-MBR-002 depend on US1 RBAC; otherwise standalone.
- **US3 (P1)**: SPEC-PAY-001 depends on US1 audit hooks; independent from US2.
- **US4 (P2)**: SPEC-SPN-001 / SPEC-NEW-001 depend on US1 authentication; optional read-only member data from US2.
- **US5 (P2)**: SPEC-SCH-001 depends on US1 authentication; leverages member data but testable with fixtures.
- **US6 (P2)**: SPEC-VOL-001 depends on US1 authentication; otherwise standalone.
- **US7 (P3)**: SPEC-MED-001 depends on US1; optional member info from US2 mocked for tests.
- **US8 (P3)**: SPEC-COU-001 depends on US1; no other blocking dependencies.
- **US9 (P3)**: SPEC-REP-001 depends on data sources from earlier specs; implement adapters progressively.

**Within Each User Story**
- Write tests (tasks marked as tests) before implementing services/UI.
- Model DocTypes before services.
- Services before API endpoints.
- Backend endpoints before frontend integrations.

---

## Parallel Execution Examples

**SPEC-AUTH-001 / SPEC-AUTH-002**
```bash
run-task T012 &
run-task T014 &
```

**SPEC-MBR-001 / SPEC-MBR-002**
```bash
run-task T023 &
run-task T025 &
run-task T030 &
```

**SPEC-PAY-001**
```bash
run-task T033 &
run-task T035 &
```

**SPEC-SPN-001 / SPEC-NEW-001**
```bash
run-task T043 &
run-task T045 &
```

**SPEC-SCH-001**
```bash
run-task T052 &
run-task T054 &
run-task T059 &
```

**SPEC-VOL-001**
```bash
run-task T061 &
run-task T063 &
```

**SPEC-MED-001**
```bash
run-task T070 &
run-task T072 &
```

**SPEC-COU-001**
```bash
run-task T078 &
run-task T080 &
```

**SPEC-REP-001**
```bash
run-task T085 &
run-task T087 &
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational).
3. Execute Phase 3 (SPEC-AUTH-001 / SPEC-AUTH-002) on branch `feat/SPEC-AUTH-001-rbac-baseline` or `feat/SPEC-AUTH-002-audit-events`.
4. Demonstrate secure access as the initial MVP.

### Incremental Delivery
1. Foundation ready (Phases 1–2).
2. Deliver P1 specs (SPEC-AUTH-001, SPEC-AUTH-002, SPEC-MBR-001, SPEC-MBR-002, SPEC-PAY-001) sequentially, validating after each checkpoint.
3. Layer P2 specs (SPEC-SPN-001, SPEC-NEW-001, SPEC-SCH-001, SPEC-VOL-001), ensuring each passes independent tests before merge.
4. Finish with P3 specs (SPEC-MED-001, SPEC-COU-001, SPEC-REP-001) before entering Polish tasks (SPEC-OPS-001, SPEC-UX-001).

### Parallel Team Strategy
1. Team collaborates on Phases 1–2.
2. After US1 completes, assign:
   - Developer A: SPEC-MBR-001 then SPEC-SCH-001.
   - Developer B: SPEC-MBR-002 then SPEC-SPN-001.
   - Developer C: SPEC-PAY-001 then SPEC-VOL-001.
   - Developer D: SPEC-NEW-001 then SPEC-MED-001 and SPEC-COU-001.
   - Reporting specialist: SPEC-REP-001 with support from earlier specs.
3. Converge on Phase 12 for cross-cutting work and release readiness (SPEC-OPS-001, SPEC-UX-001).

---

## Notes

- Tasks marked [P] are safe to execute in parallel when prerequisites are complete.
- Story labels ([US1]…[US9]) and spec tags ensure traceability to SPEC-* acceptance criteria.
- Maintain testing-first discipline—keep the suite green between tasks.
- Stop at checkpoints to demo or validate increments independently.
