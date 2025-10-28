<!--
Sync Impact Report
Version change: 0.0.0 → 1.0.0
Modified principles:
- (new) → I. Independent Slice Delivery
- (new) → II. Documented Plan-First Execution
- (new) → III. Test-First Proof
- (new) → IV. Observable Operations Discipline
- (new) → V. Governance Traceability
Added sections:
- Delivery Constraints
- Workflow Enforcement
Removed sections:
- None
Templates requiring updates:
- .specify/templates/plan-template.md ✅ updated
- .specify/templates/spec-template.md ✅ updated
- .specify/templates/tasks-template.md ✅ updated
Follow-up TODOs:
- None
-->

# Salitemihret System Constitution

## Core Principles

### I. Independent Slice Delivery
- Feature specifications MUST decompose scope into independently deliverable user stories with explicit priorities and acceptance scenarios.
- Implementation plans and task lists MUST map every task to a single user story and document any blocking dependencies in Complexity Tracking before execution.
- A user story MUST NOT be marked complete until its acceptance scenarios pass in isolation and the story can ship without additional backlog work.

Rationale: Incremental, isolated delivery is the primary control that keeps the project releasable at all times and aligns with the Spec Kit workflow.

### II. Documented Plan-First Execution
- Research, plan, specification, and task artifacts MUST be completed, have all placeholders removed, and be approved before any repository code is modified.
- The constitution check in `plan.md` MUST record an explicit pass for each principle before Phase 0 proceeds; failing gates REQUIRE a documented waiver linked to remediation tasks.
- Any deviation from approved artifacts MUST trigger an immediate artifact update and reviewer re-approval before further implementation continues.

Rationale: Front-loading decisions in living documents minimizes churn, preserves shared understanding, and enforces traceable approvals.

### III. Test-First Proof
- Tasks for every user story MUST define automated tests that fail before implementation and cover the story's acceptance criteria.
- Contract, integration, and unit tests MUST execute in continuous integration for every merge; unresolved failures block integration.
- Manual verification MAY complement automated coverage but MUST NOT replace it for release qualification.

Rationale: Enforcing failing tests before code guarantees that behaviour is specified, observable, and regressions are caught immediately.

### IV. Observable Operations Discipline
- Each feature MUST document logging, metrics, and alerting expectations in the relevant Spec Kit observability and operations documents before release.
- Implementation tasks MUST include instrumentation updates and validation steps to demonstrate that telemetry can be exercised locally.
- Runbooks and quickstart guides MUST be updated whenever operational behaviour or support procedures change.

Rationale: Reliable production ownership depends on predictable telemetry and documented operator actions.

### V. Governance Traceability
- Every artifact generated from Spec Kit templates MUST retain references to source decisions, including feature identifiers, dates, and owners.
- Placeholder text MAY NOT remain in committed artifacts; missing information requires a tracked TODO with an owner and due date.
- Version history for artifacts, including this constitution, MUST follow semantic versioning and be recorded in change logs or Sync Impact Reports.

Rationale: Traceability ensures stakeholders can audit why changes happened and recover context quickly during reviews or incidents.

## Delivery Constraints

- Phase 0 research MUST confirm the feasibility of each principle for the proposed feature and record risks that require waivers.
- Phase 1 plans MUST lock in repository structure, tooling choices, and compliance checkpoints before coding begins.
- Production changes MUST only deploy after confirming updated runbooks, telemetry dashboards, and rollback procedures.

## Workflow Enforcement

- Spec Kit templates (`spec.md`, `plan.md`, `tasks.md`, checklists) MUST be regenerated or edited to reflect the latest approved decisions before implementation starts.
- Reviews MUST explicitly record constitution compliance; reviewers MUST cite violated principle numbers when requesting changes.
- Continuous integration MUST include constitution linting scripts or manual checklists to fail builds when artifacts fall out of sync.

## Governance

- This constitution supersedes conflicting local practices. Proposed amendments MUST include rationale, impact assessment, and required template updates.
- Amendments require consensus from project maintainers, documentation of the version bump rationale, and regeneration of affected artifacts.
- Annual (or sooner if trigger events occur) compliance reviews MUST audit adherence to every principle and publish findings to the project documentation.
- Semantic versioning applies: MAJOR for incompatible principle changes, MINOR for new principles/sections, PATCH for clarifications. Sync Impact Reports MUST note each change.

**Version**: 1.0.0 | **Ratified**: 2025-10-28 | **Last Amended**: 2025-10-28
