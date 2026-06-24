# UAT User Accounts and Access Matrix

Document status: Account setup and access control reference  
Environment: Staging  
Version: 1.0

## Account Rules
- UAT users must be created only in the staging environment.
- Passwords must be distributed through the approved secure channel, never in this document.
- Each tester should use their assigned role account and should not share accounts.
- Super Admin should verify role permissions before testing starts.

## Test Accounts
| Account Label | Suggested Email / Username | Role | Primary Modules | Access Level | Assigned Tester | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UAT-SUPER-ADMIN | uat.superadmin@example.com | Super Admin / Admin | All modules, users, roles, email, reports | Full admin | TBD | Pending |
| UAT-FINANCE | uat.finance@example.com | Finance Admin | Payments, finance reports, member lookup | Manage finance | TBD | Pending |
| UAT-PR | uat.pr@example.com | Public Relations | Members, newcomers, reports, public content coordination | Manage assigned modules | TBD | Pending |
| UAT-OFFICE | uat.office@example.com | Office Admin | Members, dashboards, selected read-only records | Read-only or limited manage | TBD | Pending |
| UAT-REGISTRAR | uat.registrar@example.com | Registrar | Member intake/import, household data | Manage membership intake | TBD | Pending |
| UAT-SPONSORSHIP | uat.sponsorship@example.com | Sponsorship Committee | Sponsorships, newcomers, sponsorship reports | Manage sponsorship | TBD | Pending |
| UAT-SCHOOL | uat.school@example.com | School Admin | Schools, Sunday School, Abenet | Manage school records | TBD | Pending |
| UAT-SCHOOL-VIEWER | uat.school.viewer@example.com | Sunday School Viewer | Schools | View assigned school data | TBD | Pending |
| UAT-VOLUNTEER | uat.volunteer@example.com | Volunteer Coordinator | Volunteers, groups, rosters, service logs | Manage volunteers | TBD | Pending |
| UAT-MEDIA | uat.media@example.com | Media Admin / Kahen | Media requests, approvals, public feed | Approve/publish media | TBD | Pending |
| UAT-COUNCIL | uat.council@example.com | Council Secretary | Parish Councils, council reports | Manage council records | TBD | Pending |
| UAT-GENERAL | uat.general@example.com | General User | Account/profile, permitted dashboard items | Limited | TBD | Pending |

## Access Matrix
| Module | Super Admin | Finance Admin | PR Admin | Office Admin | Registrar | Sponsorship | School Admin | Volunteer Coordinator | Media Admin | Council Secretary | General User |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Full | View | View | View | View | View | View | View | View | View | Limited |
| Members | Full | Lookup/View | Manage | View | Manage Intake | Lookup/View | Lookup/View | Lookup/View | Lookup/View | Lookup/View | No/limited |
| Payments | Full | Manage | Limited donations/view if configured | No/limited | No | View sponsorship-related if configured | School-fee view if configured | No | No | No | No |
| Newcomers | Full | No/limited | Manage | No/limited | Intake if configured | Manage/View | No | No | No | No | No |
| Sponsorships | Full | Payment reconciliation view | View/Manage if configured | No/limited | No | Manage | No | No | No | No | No |
| Schools / Sunday School / Abenet | Full | Fee report view if configured | No/limited | No/limited | No | No | Manage | No | No | No | No |
| Volunteers | Full | No | No/limited | No/limited | No | No | No | Manage | No | No | No |
| Parish Councils | Full | No | No/limited | No | No | No | No | No | No | Manage | No |
| Reports | Full | Finance reports | Membership/newcomer reports | Read-only reports | Member import reports | Sponsorship reports | School reports | Volunteer reports | Media reports if configured | Council reports | No/limited |
| User Management | Full | No | No | No | No | No | No | No | No | No | No |
| Role Management | Full | No | No | No | No | No | No | No | No | No | No |
| Email Admin | Full | No | No/limited | No | No | No | No | No | No | No | No |
| Media Approvals | Full | No | Request/View | Request/View | Request/View | Request/View | Request/View | Request/View | Approve/Reject | Request/View | No |
| Public Website Review | Full | Review | Review | Review | Review | Review | Review | Review | Review | Review | Public view |

## Sign-Off
I confirm that the above UAT accounts and access levels are appropriate for testing.

Client UAT Lead: ____________________ Signature: ____________________ Date: __________  
Delivery Team Lead: _________________ Signature: ____________________ Date: __________
