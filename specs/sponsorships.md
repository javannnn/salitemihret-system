# Module Spec — Sponsorships

## Overview
- Track parish sponsorship pledges, monthly balances, and follow-up workflows. *(BRD §Sponsorships)*
- Integrate with newcomers and payments to convert pledges into active contributions. *(BRD §Sponsorship Lifecycle)*

## Data Model
- Sponsorship entity: sponsor_id, beneficiary_member_id, pledge_amount, frequency, start/end dates, status, outstanding_balance. *(BRD §Sponsorship Data)*
- Reminder schedule records last_contacted, next_due, assigned_staff. *(BRD §Reminders)*  
- Documents (agreements) stored with signed URL references. *(BRD §Documentation)*

## Business Rules
- Pledge must reference active member/newcomer; duplicates prevented per sponsor-beneficiary pair. *(BRD §Sponsorship Rules)*
- Outstanding balance auto-updates when payments posted against pledge. *(BRD §Balance Logic)*
- Reminder jobs assign follow-ups and create audit entries. *(BRD §Reminders)*
- Status transitions: Draft → Active → Suspended → Completed; transitions require reason. *(BRD §Status Flow)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/sponsorships` | List pledges with status filters | SponsorshipCommittee, PublicRelations |
| POST | `/sponsorships` | Create pledge | SponsorshipCommittee |
| GET | `/sponsorships/{id}` | Detail view | SponsorshipCommittee |
| PUT | `/sponsorships/{id}` | Update pledge status/details | SponsorshipCommittee |
| POST | `/sponsorships/{id}/remind` | Trigger manual reminder | SponsorshipCommittee |

## UAT Checklist
1. Create pledge for newcomer; after conversion to member, reference updated automatically. *(BRD §Sponsorship Lifecycle)*  
2. Monthly reminder job queues tasks and logs notification. *(BRD §Reminders)*  
3. Payments applied reduce outstanding balance; ledger reconciliation passes. *(BRD §Balance Logic)*  
4. Suspended pledge prevents new reminders until reactivated. *(BRD §Status Flow)*  
5. Export CSV includes sponsor contact info and outstanding balance. *(BRD §Reporting)*
