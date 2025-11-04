# Module Spec — Membership

## Overview
- Maintain authoritative member records, household relationships, and automated pastoral insights for contribution streaks and age milestones. *(BRD §Membership)*
- Support registrar-driven imports, PR approvals, and downstream module integrations (sponsorship, payments, volunteers). *(BRD §Membership)*

## Data Model
- Member core fields captured for bilingual profiles, including demographic, contact, and pastoral notes. *(BRD §Membership Fields)*
- Household relationships allow linking spouses/children and propagating contact updates. *(BRD §Household Relations)*
- Status history tracks changes with approvals and suggestion metadata. *(BRD §Status Timeline)*
- Contribution streak metadata stored for automated pastoral nudges. *(BRD §Contribution Streaks)*

## Business Rules
- Mandatory data: member ID/username, first name, last name, gender, preferred language. *(BRD §Membership Rules)*
- Birth date must precede current date; members under 16 require guardian linkage. *(BRD §Membership Rules)*
- Status changes cannot backdate prior to latest entry; approvals generate audit records. *(BRD §Status Management)*
- Archive (soft delete) prevents new payments but preserves ledger references. *(BRD §Membership Archive)*
- Contribution streak job notifies PR Admin after six consecutive month contributions. *(BRD §Contribution Streaks)*
- Turning-18 automation queues reminder to transition from child programs. *(BRD §Age Milestones)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| POST | `/auth/login` | Authenticate user, return JWT tokens | Public |
| GET | `/auth/whoami` | Return session user + roles | Authenticated |
| GET | `/members` | List members with filters + pagination | OfficeAdmin (RO), PublicRelations |
| POST | `/members` | Create member | PublicRelations |
| GET | `/members/{member_id}` | Retrieve member detail | OfficeAdmin (RO), PublicRelations |
| PUT | `/members/{member_id}` | Update member | PublicRelations |
| DELETE | `/members/{member_id}` | Soft delete member + queue admin email | PublicRelations |

## UAT Checklist
1. Registrar imports 500 members with <2 % validation errors and can download error CSV. *(BRD §Membership Import)*
2. PR Admin approves six-month contribution streak suggestion and audit event recorded with trace ID. *(BRD §Contribution Streaks)*  
3. Turning-18 automation generates notification within one hour of milestone. *(BRD §Age Milestones)*  
4. Office Admin views member roster read-only; PR Admin edits and archives records. *(BRD §Roles & Permissions)*  
5. Soft delete queues admin email stub and hides member from default list views. *(BRD §Membership Archive)*
