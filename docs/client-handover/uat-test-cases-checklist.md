# UAT Test Cases and Checklist

Document status: Client execution checklist  
Version: 1.0

## Test Result Legend
Pass = works as expected  
Fail = does not meet expected result  
Pending = not yet tested  
Blocked = cannot test due to dependency  
N/A = not applicable by client decision

## 1. Dashboard
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| DASH-01 | Cross-module overview | Log in and open Dashboard | General authorized user | Dashboard loads with allowed module summaries only | Pending | |
| DASH-02 | Quick actions | Use a dashboard quick action for a permitted module | Module user | User is routed to the correct workflow | Pending | |
| DASH-03 | Permission filtering | Log in as restricted role | Restricted user | Restricted modules are hidden or inaccessible | Pending | |

## 2. User Management and Admin Management
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| UMS-01 | User onboarding | Create or invite a user with multiple roles | Super Admin | User is created and role assignments are saved | Pending | |
| UMS-02 | Role matrix | Update module permissions for a role | Super Admin | Sidebar and access controls reflect permissions | Pending | |
| UMS-03 | User lifecycle | Suspend a user | Super Admin | Suspended user cannot log in | Pending | |
| UMS-04 | Password reset | Generate password reset or temporary credential | Super Admin | Reset is recorded and user can complete access flow | Pending | |
| UMS-05 | Audit trail | Review user activity and role changes | Super Admin | Actor, action, timestamp, and changed values are visible | Pending | |
| UMS-06 | Email administration | Open admin email client and verify available mail actions | Super Admin | Email area loads and respects admin access | Pending | |
| UMS-07 | Account profile | User opens My Account and updates allowed profile fields | Authenticated user | Account profile saves without exposing restricted controls | Pending | |

## 3. Membership
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| MEM-01 | Member roster | Open Members list, search, filter, sort, and paginate | Office Admin / PR Admin | Roster displays accurate records and preserves filter state | Pending | |
| MEM-02 | Member creation | Create a new bilingual member profile | PR Admin | Required fields validate and profile is saved | Pending | |
| MEM-03 | Member editing | Edit contact, preferred language, marital status, and ministry tags | PR Admin | Structured fields save and display consistently | Pending | |
| MEM-04 | Household links | Link spouse, child, or household relationship | PR Admin | Relationship appears on related records | Pending | |
| MEM-05 | Import | Import member CSV/spreadsheet sample | PR Admin | Valid rows import and invalid rows produce error feedback | Pending | |
| MEM-06 | Archive | Archive or soft-delete a member | PR Admin | Member is hidden from default lists but history remains | Pending | |
| MEM-07 | Permissions | Office Admin attempts edit-only action | Office Admin | Edit is blocked if role is read-only | Pending | |
| MEM-08 | Age and status rules | Verify child/turning-18 or status suggestion workflow | PR Admin | Reminder or status workflow is recorded | Pending | |

## 4. Payment Handling
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PAY-01 | Ledger entry | Record contribution, tithe, service, school fee, or sponsorship payment | Finance Admin | Payment posts to immutable ledger | Pending | |
| PAY-02 | Member timeline | Open member payment timeline | Finance Admin | Member-specific payment history is displayed | Pending | |
| PAY-03 | Correction workflow | Create a correction for an existing payment | Finance Admin | Original remains unchanged and correction is linked | Pending | |
| PAY-04 | Reconciliation | Filter by date, type, member, and method | Finance Admin | Totals match displayed records | Pending | |
| PAY-05 | Export | Export payment report | Finance Admin | Export matches filters and totals | Pending | |
| PAY-06 | Access control | Non-finance user attempts ledger action | Non-finance user | Restricted action is blocked | Pending | |

## 5. Sponsorship
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SPN-01 | Sponsorship dashboard | Open Sponsorships workspace | Sponsorship Committee / PR | KPIs, list, filters, and actions load | Pending | |
| SPN-02 | Create pledge | Create sponsorship for member or newcomer beneficiary | Sponsorship Committee | Pledge saves with sponsor, beneficiary, frequency, and status | Pending | |
| SPN-03 | Budget capacity | Enter budget month/year and capacity | Sponsorship Committee | Capacity rules prevent invalid overuse | Pending | |
| SPN-04 | Payment health | Review sponsor payment health | Sponsorship Committee | Health information is visible and affects approval workflow | Pending | |
| SPN-05 | Status transition | Move Draft to Active, Suspended, or Completed | Sponsorship Committee | Transition requires reason and is audited | Pending | |
| SPN-06 | Reminder | Trigger or review reminder schedule | Sponsorship Committee | Reminder is logged with owner/channel | Pending | |
| SPN-07 | Export/report | Export sponsorship report | Sponsorship Committee | Export includes sponsor contact and outstanding balances | Pending | |

## 6. Newcomers / Settlement
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| NEW-01 | Intake | Create newcomer intake record | PR Admin | Required contact, visit, language, and owner fields save | Pending | |
| NEW-02 | Follow-up | Add follow-up note and next action | PR Admin / Sponsorship | Follow-up appears in profile history | Pending | |
| NEW-03 | Sensitive notes | Restricted user attempts sensitive note action | Office Admin | Unauthorized access is blocked | Pending | |
| NEW-04 | Conversion | Convert newcomer to member | PR Admin | Member is created/linked and newcomer marked converted | Pending | |
| NEW-05 | Sponsorship link | Link newcomer with sponsorship case | Sponsorship Committee | Sponsorship and newcomer records show relationship | Pending | |

## 7. Reports
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| RPT-01 | Report access | Open Reports area | Authorized report user | Only permitted reports are visible | Pending | |
| RPT-02 | Membership report | Run membership report | PR / Admin | Report completes and matches roster data | Pending | |
| RPT-03 | Payment report | Run finance report | Finance Admin | Report reconciles with payment ledger | Pending | |
| RPT-04 | Sponsorship report | Run sponsorship report | Sponsorship Committee | Pledges, balances, and status counts match source data | Pending | |
| RPT-05 | Export | Export CSV/PDF/XLSX where available | Authorized report user | Export downloads and respects filters/localization | Pending | |

## 8. Volunteer Management
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| VOL-01 | Group management | Create or update volunteer group | Volunteer Coordinator | Group is saved with lead/contact information | Pending | |
| VOL-02 | Roster | Add active member to volunteer roster | Volunteer Coordinator | Member appears in group roster | Pending | |
| VOL-03 | Service logging | Log service hours or service record | Coordinator | Service is recorded and visible in dashboard | Pending | |
| VOL-04 | Inactive member rule | Attempt to assign archived member | Volunteer Coordinator | Assignment is blocked | Pending | |
| VOL-05 | Dashboard | Filter by group and review totals | Volunteer Coordinator | Totals match records | Pending | |

## 9. Media
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| MED-01 | Request creation | Submit media request with attachment | Staff / Media Admin | Request is captured with Pending status | Pending | |
| MED-02 | Approval | Approve media request | Media Admin / Kahen | Public post/feed entry is created or updated | Pending | |
| MED-03 | Rejection | Reject request with reason | Media Admin / Kahen | Reason is required and requester is notified | Pending | |
| MED-04 | Attachment security | Open attachment URL after allowed access | Media Admin | Signed/controlled access works as expected | Pending | |
| MED-05 | Public feed | Review public-facing approved content | Public / PR | Approved items display in correct order | Pending | |

## 10. Schools / Sunday School / Abenet
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SCH-01 | Enrollment | Enroll active member in Sunday School or Abenet | School Admin | Enrollment saves for correct academic year/cohort | Pending | |
| SCH-02 | Fee reminders | Configure or review fee plan/reminder | School Admin | Reminder schedule is recorded | Pending | |
| SCH-03 | Attendance | Record class attendance | Coordinator | Attendance totals update | Pending | |
| SCH-04 | Lesson completion | Mark lesson/mezmur completion | School Admin | Completion is recorded for cohort/member | Pending | |
| SCH-05 | Promotion | Promote student after requirements met | School Admin | Promotion validates completion and approval | Pending | |
| SCH-06 | Permissions | Coordinator views assigned cohort only | Coordinator | Unauthorized cohorts are hidden | Pending | |

## 11. Parish Councils
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| COU-01 | Council setup | Create council or department | Council Secretary / Admin | Council record saves with term and lead | Pending | |
| COU-02 | Trainee assignment | Add trainee and mentor | Council Secretary | Active assignment appears in council profile | Pending | |
| COU-03 | Overlap validation | Assign trainee to overlapping council term | Council Secretary | Validation prevents conflict | Pending | |
| COU-04 | Minutes | Add meeting minutes and follow-ups | Council Secretary | Minutes and follow-ups are saved | Pending | |
| COU-05 | Quarterly report | Generate quarterly governance report | Council Secretary | Report summarizes trainees, actions, and audit items | Pending | |

## 12. Bilingual Website Features
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| WEB-01 | Website completion | Review public website home page | Client Reviewer | Website is available and aligned with parish identity | Pending | Source not present in this environment |
| WEB-02 | Bilingual content | Switch between English and Amharic content | Public user | Language content is readable and navigation remains usable | Pending | |
| WEB-03 | Public posts/media | Review published public content | Public user | Approved content appears without admin-only data | Pending | |
| WEB-04 | Mobile responsiveness | Open website on mobile viewport | Public user | Layout is readable and usable | Pending | |
| WEB-05 | Contact and information | Verify service times/contact/public parish information | Public user | Published information is accurate | Pending | |

## 13. Bilingual Admin Features
| ID | BRD / Scope Item | Test Case | Role | Expected Result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| I18N-01 | Bilingual member fields | Enter English and Amharic names/notes where applicable | PR Admin | Text saves and displays correctly | Pending | |
| I18N-02 | Localized exports | Export report containing bilingual names | Authorized user | Export preserves characters and formatting | Pending | |
| I18N-03 | UI usability | Review labels and user instructions with client users | Client tester | Language is acceptable for operational use | Pending | |
