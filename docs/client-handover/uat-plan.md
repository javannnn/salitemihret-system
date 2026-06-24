# UAT Plan

Document owner: Project Delivery Team  
Client owner: SaliteMihret appointed UAT lead  
Environment: Staging  
Status: Ready for client execution and sign-off  
Version: 1.0

## 1. Purpose
User Acceptance Testing confirms that the SaliteMihret System satisfies the agreed business needs, workflows, roles, reporting requirements, bilingual usage expectations, and administrative controls before production go-live. UAT is client-led with delivery team support.

## 2. Scope
UAT covers the system modules and navigation implemented for Phase 1:

| Module | Route or Area | BRD / Spec Reference |
| --- | --- | --- |
| Dashboard | `/dashboard` | Core plan, reporting, module summaries |
| Membership | `/members`, `/members/new`, `/members/:id/edit` | `specs/membership.md` |
| Payments | `/payments`, `/payments/members/:memberId` | `specs/payments.md` |
| Newcomers / Settlement | `/newcomers`, `/newcomers/:id` | `specs/newcomers.md` |
| Sponsorship | `/sponsorships`, `/sponsorships/:id` | `specs/sponsorships.md` |
| Schools / Sunday School / Abenet | `/schools` | `specs/schools.md` |
| Volunteer Management | `/volunteers` | `specs/volunteers.md` |
| Parish Councils | `/parish-councils` | `specs/councils.md` |
| Reports | `/admin/reports` | `specs/reports.md` |
| User and Admin Management | `/admin/users`, `/admin/users/:id`, `/admin/users/roles`, `/admin/email`, `/account` | `specs/user-management.md` |
| Bilingual Features | English/Amharic labels, data fields, exports | Spec Kit i18n and accessibility |
| Public Website | Public-facing bilingual website features | Reported as completed; source not present in this environment |

## 3. Out of Scope for This UAT
- New feature requests outside the agreed BRD scope.
- Production credential disclosure.
- External payment gateway integrations unless separately contracted.
- Website source-code review in this environment.

## 4. Proposed UAT Schedule
| Activity | Owner | Target Date | Output |
| --- | --- | --- | --- |
| UAT kickoff | Client UAT Lead + Delivery Team | TBD | Confirm testers, access, schedule |
| Test account validation | Delivery Team | TBD | UAT account matrix approved |
| Module walkthrough | Delivery Team | TBD | Testers oriented |
| Module testing | Client testers | TBD | Completed test cases |
| Defect triage | Joint | Daily during UAT | Updated issue log |
| Retesting | Client testers | TBD | Retest results recorded |
| Module sign-off | Client module owners | TBD | Signed module sheets |
| Final UAT sign-off | Client sponsor | TBD | Go-live approval input |

## 5. Roles and Responsibilities
| Role | Responsibility |
| --- | --- |
| Client Sponsor | Final acceptance, go-live approval, priority decisions |
| UAT Lead | Coordinates testers, schedule, sign-off, and defect triage |
| Module Testers | Execute test cases and record pass/fail evidence |
| Super Admin Tester | Validates users, roles, permissions, reports, email administration |
| Finance Tester | Validates payment handling, corrections, exports, reconciliation |
| PR / Office Tester | Validates membership, newcomers, communication, data quality |
| Sponsorship Tester | Validates sponsorship cases, pledges, budgets, follow-ups |
| School Tester | Validates Sunday School and Abenet workflows |
| Volunteer Tester | Validates groups, rosters, and service logs |
| Council Tester | Validates parish council records and governance reporting |
| Delivery Team | Supports environment, issue fixing, retesting, and documentation |

## 6. Entry Criteria
- Staging environment is deployed and available.
- UAT users and roles are created.
- Test data is available or imported.
- UAT checklist has been shared with testers.
- Known limitations have been disclosed before UAT.
- Client has confirmed module owners.

## 7. Exit Criteria
UAT is complete when:

- All critical and high-severity issues are resolved or formally accepted as deferred by the client.
- Each in-scope module has a completed UAT sign-off sheet.
- UAT results report is approved by the client UAT Lead.
- Go-live approval form is signed.
- Deployment plan and rollback plan are accepted.

## 8. Acceptance Criteria
The client accepts each module when:

- The agreed business workflow can be completed by the assigned role.
- Role permissions prevent unauthorized access.
- Required data fields, validations, and audit behavior work as expected.
- Reports and exports reconcile with sample records.
- English/Amharic usage is acceptable for the intended users.
- Any open issues are documented with agreed severity, owner, and disposition.

## 9. Defect Severity
| Severity | Definition | UAT Exit Impact |
| --- | --- | --- |
| Critical | Blocks core business operation, causes data loss, or exposes sensitive data | Must be fixed before go-live |
| High | Major workflow cannot be completed by the intended role | Must be fixed or formally deferred |
| Medium | Workflow has a workaround or limited operational impact | May go live with approved action plan |
| Low | Cosmetic, wording, minor usability issue | May go live with backlog item |

## 10. Evidence Required
Each executed test case should include tester name, date, pass/fail, notes, screenshots if needed, and issue ID if failed.
