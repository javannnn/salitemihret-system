# Module Spec — Sponsorships

## Overview
- Track parish sponsorship pledges, monthly balances, and follow-up workflows. *(BRD §Sponsorships)*
- Integrate with newcomers and payments to convert pledges into active contributions. *(BRD §Sponsorship Lifecycle)*

## Data Model
- Sponsorship entity: sponsor_id, beneficiary_member_id, pledge_amount, frequency, start/end dates, status, outstanding_balance. *(BRD §Sponsorship Data)*
- Sponsor profile slice: father_of_repentance_id, last_sponsored_at, volunteer_service tags, payment_health snapshot (current monthly contribution, method, streak color), sponsorship_frequency chip state, last_status, rejection_reason, budget_month/year, total_capacity, used_capacity. *(BRD §Sponsorship v2.1)*
- Reminder schedule records last_contacted, next_due, assigned_staff. *(BRD §Reminders)*  
- Documents (agreements) stored with signed URL references. *(BRD §Documentation)*
- Beneficiary selection now references Member/Newcomer records directly, replacing the prior free-text fields and keeping bilingual names consistent. *(BRD §Sponsorship Data)*
- Pledge program, frequency, channel, and motivation fields read from controlled lookup tables tied to Reference Option DocType. *(BRD §Sponsorship Data)*
- Budget tracker rows store `budget_month`, `budget_year`, `capacity_total`, `capacity_used`, derived `% utilized`, and warning thresholds for dashboard bars. *(BRD §Sponsorship Budget)*

## Controlled Inputs & UI Patterns
| Field/Group | Options | UI Pattern | Notes |
|-------------|---------|-----------|-------|
| Sponsor identity | Member directory | Global search combobox with avatar + status chips | Selecting a member auto-fills FN/LN and locks them (no typos). *(BRD §2.2.7.1)* |
| Father of Repentance | Priests directory | Autocomplete select | Auto-fills + locks if already set on the member profile. *(BRD §2.2.7.2)* |
| Beneficiary | Member search, Newcomer search | Dual-source combobox | Displays member badge, prevents typo’d names, auto-switches to member record once newcomer converts. |
| Program | Education, Nutrition, Healthcare, Housing, Emergency Relief, Special Projects | Select menu with icons | Feeds dashboards and reporting segments. |
| Volunteer service | Holy Day Cleanup, General Service, Meal Support, Other | Chip group with optional free-text | Appears as timeline tags; “Other” reveals a short input. *(BRD §2.2.7.4)* |
| Payment health | Read-only | Card with amount, method, last payment, streak bar | Colors (green/yellow/red) reflect membership contribution consistency. *(BRD §2.2.7.5)* |
| Pledge type | Recurring, One-time | Segmented control | Recurring unlocks frequency chips; One-time hides reminder cadence. |
| Frequency | One-time, Monthly, Quarterly, Yearly | Segmented control with helper copy | Drives next-expected sponsorship + reminder schedule. *(BRD §2.2.7.6)* |
| Reminder channel | Email, SMS, Phone, WhatsApp | Icon chips | Must align with sponsor contact preference to trigger automation. |
| Last sponsorship status | Approved, Rejected | Badge with optional expandable reason | Rejected state enforces a mandatory structured reason. *(BRD §2.2.7.7)* |
| Budget capacity | Month + year + capacity counts | Capacity bar with percentage + warnings | Auto-calculates “X of Y sponsored” and color shifts past thresholds. *(BRD §2.2.7.8-9)* |
| Motivation | Honor/Memorial, Community Outreach, Corporate, Parish Initiative, Other | Modal list with microcopy | Selecting Other prompts a short, structured note (limited to 200 chars). |
| Stewardship notes | Templates: Follow-up, Payment issue, Gratitude, Escalation | Rich-text template picker | Replaces blank textarea with quick-insert blocks and enforces tone. |

## Business Rules
- Pledge must reference active member/newcomer; duplicates prevented per sponsor-beneficiary pair. *(BRD §Sponsorship Rules)*
- Sponsor identity field only accepts Members; FN/LN mirror the membership record and become read-only after selection. *(BRD §2.2.7.1)*
- Father of Repentance mirrors the membership record; discrepancies raise a “Sync in Membership” warning rather than allowing an override. *(BRD §2.2.7.2)*
- Last sponsored date auto-updates whenever a sponsorship event posts; manual edits are blocked and the “days since” badge is derived from this timestamp. *(BRD §2.2.7.3)*
- Volunteer service requires at least one chip (or an explicit “None this time” acknowledgement); chips render chronologically on the sponsor timeline. *(BRD §2.2.7.4)*
- Payment health card pulls membership contribution data; if `pays_contribution` is false or last payment is >60 days, the UI blocks new sponsorship confirmation until a supervisor override is provided. *(BRD §2.2.7.5)*
- Frequency selections dictate reminder cadence and the computed next due date; the API rejects payloads where frequency and reminder schedules conflict. *(BRD §2.2.7.6)*
- Last sponsorship status is mandatory; when “Rejected” is selected the rejection reason text area must be filled before save. *(BRD §2.2.7.7)*
- Budget tracker rows enforce `capacity_total >= capacity_used`; attempts to over-sponsor raise a blocking modal with capacity suggestions. *(BRD §2.2.7.8-9)*
- Outstanding balance auto-updates when payments posted against pledge. *(BRD §Balance Logic)*
- Reminder jobs assign follow-ups and create audit entries. *(BRD §Reminders)*
- Status transitions: Draft → Active → Suspended → Completed; transitions require reason. *(BRD §Status Flow)*
- Beneficiary field requires a directory selection; manual entry is no longer supported to keep downstream ledgers accurate.
- “Other” motivation requires a short note (<=200 chars) and includes reviewer metadata; automation refuses to send acknowledgements without the note.
- Reminder channel defaults to email but will block scheduling if the sponsor opted out of that channel in the membership profile; staff must pick an allowed channel before saving.

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
## UX Layouts
### Sponsorship Dashboard (Page 1)
1. **KPI Row**: Total Active Sponsors, Total Newcomers Sponsored, This Month’s Sponsorships, Budget Utilization %. Each card links into the filtered table view.
2. **Sponsorship Table**: Columns for Sponsor Name, Frequency, Last Sponsorship, Status (traffic-light badges), Next Due Date, Budget Used, Actions. Includes inline alerts (“Budget full”, “Upcoming due”).
3. **Filter Drawer**: Frequency, Status, Sponsor name (typeahead), “Has newcomer?” toggle, Date range chips.

### Sponsorship Detail (Page 2)
1. **Left Sidebar (Sponsor Profile)**: Identity card (avatar, status, Father of Repentance, contact), Payment Health Card (amount, method, last payment, streak color), Volunteer service tags.
2. **Center Timeline**: Chronological cards for each sponsorship event with status badges, rejection reasons, payment links, volunteer notes.
3. **Right Panel (Budget Tracker)**: Month/year selector, “X of Y Sponsored” capacity bar, beneficiary list with quick actions (“Add newcomer”, “Convert newcomer”).

### New Sponsorship Flow (Page 3)
1. Select Sponsor (global search, auto-fill FN/LN + Father of Repentance).
2. Select Beneficiary (member/newcomer combobox).
3. Choose Frequency + Reminder channel (segmented controls).
4. Set Budget Month/Year + capacity.
5. Capture Volunteer Service + Payment health preview.
6. Review + Confirm (shows last sponsored status/reason + alerts).

### Advanced UX Enhancements
1. **Smart Alerts**: “Sponsor hasn’t paid membership for 2 months”, “Budget full”, “Next sponsorship due in 9 days” banners.
2. **Activity Timeline**: Messenger-style cards for actions, payments, notes.
3. **Newcomer Integration**: When a newcomer is marked “Sponsored by X” it auto-appears as the beneficiary candidate.
4. **One-click PDF**: Generate a monthly Sponsorship Report from the dashboard.

## Reports & Exports
- **Pledge Fulfillment Report**: compares pledged vs. received amounts.
- **Program Enrollment Report**: sponsorships grouped by program.
- **Budget Utilization Report**: month/year capacity vs. usage, overspend warnings, exported as PDF for diocesan briefings.

## Edge Cases
- Sponsor switching beneficiary mid-term creates new record with original set to `Completed`; audit event captures reason.
- Suspended sponsor retains historical payments but hidden from active lists.
- If membership removes a Father of Repentance, sponsorship detail shows a “Sync required” banner and the field unlocks until membership is updated.
- Capacity tracker prevents saving when `used_capacity > total_capacity`; staff must adjust totals before logging another sponsorship.
