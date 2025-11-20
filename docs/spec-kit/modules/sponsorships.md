# Sponsorships Module

## Purpose
Track parish sponsorship commitments, beneficiary assignments, payment
compliance, and stewardship notes for sponsors.

## Roles & Permissions
- **Finance Clerk**: Full CRUD on sponsorships and pledge adjustments.
- **PR Administrator**: Read access, approve program changes, view notes.
- **Parish Registrar**: View sponsor linkage to member profile.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Sponsorship core | `server/app/models/sponsorship.py:Sponsorship` | Tracks sponsor member, beneficiary link, newcomer link, pledge amount, frequency, status, structured metadata.
| Beneficiary details | JSON columns on model | Supports bilingual names + newcomer references.
| Payment aggregation | Computed via payments service | Summaries shown in UI drawer/read model.
| Structured selects | `SponsorshipProgram`, `SponsorshipPledgeChannel`, `SponsorshipReminderChannel`, `SponsorshipMotivation`, `SponsorshipNotesTemplate` enums (Pydantic + frontend) | Keep UI chip sets + API validation aligned to eliminate free text.
| Sponsor profile slice | Membership + Sponsorship join | Auto-pulls Father of Repentance, payment health snapshot (amount/method/streak), volunteer service tags, last sponsored date, last status/reason. |
| Budget tracker | `sponsorship_budgets` table | Stores month/year, total capacity, used capacity, computed utilization %, status color thresholds. |

## Controlled Inputs & UI Patterns
- **Sponsor Identity Search**: Global member search with avatars + status chips auto-fills first/last name fields and locks them to the membership record (zero typos).
- **Father of Repentance Select**: Autocomplete fed by the priests directory; if the member already has a Father Confessor the field pre-fills and becomes read-only.
- **Beneficiary Picker**: Dual-source combobox lets staff search members or newcomers by name/ID. Once a newcomer converts, the UI auto-swaps in the member link—no manual typing.
- **Program & Motivation Chips**: Iconic chip sets for program and motivation (Other opens a 200-character justification field).
- **Volunteer Service Chips**: Predefined tags (Holy Day Cleanup, General Service, Meal Support) plus “Other” free-text; rendered as timeline tags under the sponsor profile.
- **Payment Health Card**: Read-only card pulling membership contribution data (amount, method, last payment, streak color) so committees gauge a sponsor’s capacity.
- **Pledge Type + Frequency**: Segmented control (One-time vs Recurring) followed by frequency chips (One-time, Monthly, Quarterly, Yearly) that drive reminder schedules.
- **Reminder Channel Chips**: Icon chips (Email, SMS, Phone, WhatsApp) matched against the sponsor’s allowed contact preference—disallowed channels show a lock.
- **Status Badges**: “Approved” or “Rejected” badges; selecting Rejected reveals a mandatory reason textarea.
- **Budget Capacity Bar**: Month/year selector plus “X of Y sponsored” bar with green/amber/red thresholds so staff see utilization instantly.
- **Stewardship Notes**: Template picker (“Follow-up”, “Payment Issue”, “Gratitude”, “Escalation”) inserts structured paragraphs so the drawer stays consistent and searchable.
- **Adjustment Wizard**: Stepper uses keypad inputs, frequency chips, and a review card; only the templated note field accepts free text.

## User Flows
1. **Dashboard → Table → Filters**
   - KPI row surfaces Total Active Sponsors, Total Newcomers Sponsored, This Month’s Sponsorships, and Budget Utilization %. Each card applies a filter.
   - Table columns show Sponsor, Frequency, Last Sponsorship, Status (traffic lights), Next Due Date, Budget Used, and Actions.
   - Filters live in a drawer (frequency, status, sponsor search, “Has newcomer?”, date range chips).
2. **Detail View**
   - Left sidebar: Sponsor identity, Father of Repentance, contact info, payment health card, volunteer service tags.
   - Center timeline: Cards for each sponsorship event with status badges/reasons, payment hooks, and volunteer notes.
   - Right panel: Budget tracker (month/year selector, capacity bar, beneficiary list with quick “Add newcomer/Sponsor” actions).
3. **New Sponsorship Wizard**
   - Steps: Select Sponsor → Select Beneficiary → Choose Frequency + Reminder channel → Set Budget Month/Year + capacity → Log Volunteer Service → Review & Confirm (shows payment health + alerts such as delinquent contributions or full budget).
4. **Pledge Adjustment**
   - Adjustment wizard captures new amount/effective date → creates a new revision record and audit event.
   - Frequency + reminder chips must be confirmed; wizard previews the cadence and “next expected sponsorship” label.
5. **Import Stepper**
   - Upload template with headers defined in Data Import spec; validation ensures sponsor membership is active.
   - Import enforces lookup-controlled fields (program, frequency, channel); CSVs with unknown options surface inline replacements.

## API Endpoints
- `GET /sponsorships` – paginated list with filters (status, program, sponsor_id, frequency, q).
- `POST /sponsorships` – create sponsorship (structured enums for program/motivation/frequency, lookup-based sponsor + beneficiary selection, template notes).
- `GET /sponsorships/{id}` – fetch single sponsorship with sponsor + beneficiary context.
- `PUT /sponsorships/{id}` – update pledge, status, reminder channel, etc.
- `POST /sponsorships/{id}/remind` – trigger an ad-hoc reminder using the structured channel.

## Validation Rules
- `monthly_amount` must be positive and cannot drop below zero when adjusting pledge history.
- `end_date` cannot precede `start_date`.
- Sponsor must be an active member; identity fields always reference the member directory.
- Father of Repentance pulls from membership; if a conflicting value is submitted the API rejects it and returns a “sync in membership” message.
- Volunteer service requires at least one chip per sponsorship entry (or an explicit “None” chip); “Other” mandates a short free-text label.
- Beneficiary must be a selected Member/Newcomer; the API rejects free-text payloads.
- Reminder channel must align with the sponsor’s allowed contact methods; API returns `422` if a blocked channel is chosen.
- Budget tracker enforces `capacity_total >= capacity_used`; attempts to exceed capacity return a 400 error with guidance.
- Rejected sponsorship status requires a reason before save.

## Notifications
- Monthly reminder email to sponsors with pledge summary.
- Alert to Finance Clerk when sponsorship expires or lapses.
- Reminder engine now checks the structured channel; SMS/WhatsApp pushes are
  queued only when the sponsor explicitly opted in via membership profile.

## Reports & Exports
- **Pledge Fulfillment Report**: compares pledged vs. received amounts.
- **Program Enrollment Report**: sponsorships grouped by program.
- **Budget Utilization Report**: month/year capacity vs. usage with amber/red warnings; exports to PDF for diocesan briefings; ties into the dashboard capacity bar.

## Edge Cases
- Sponsor switching beneficiary mid-term creates new record with original set to `Completed`; audit event captures reason.
- Suspended sponsor retains historical payments but hidden from active lists.
- If the membership record removes a Father of Repentance, the sponsorship detail shows a “Sync required” badge and the field unlocks until the member profile is updated.
- Attempting to log a sponsorship when budget capacity is exceeded blocks the action and suggests increasing the budget row or selecting a different month.

## Acceptance Criteria (Spec IDs)
- `SPN-AC-01`: Finance Clerk adjusts pledge and change propagates to dashboards
  within 5 minutes.
- `SPN-AC-02`: Export of active sponsorships completes < 2 minutes with accurate
  totals.
- `SPN-AC-03`: Lapsed sponsorship triggers notification to Finance Clerk.

## Tests
- Backend validation tests for amount/date rules and program transitions.
- Frontend drawer unit tests verifying note rendering and action buttons.
- Integration tests for pledge adjustment workflow.

## Security & Audit
- Finance notes classified as sensitive; hidden from non-finance roles.
- All pledge lifecycle changes emit `Audit Event` with actor and reason.
- Sponsor data included in audit exports for diocesan review.

- **Day 5**: Extend SQLAlchemy model + Alembic migrations to cover structured enums (program, motivation, pledge/reminder channels, notes templates) and nullable links to members/newcomers.
- **Day 5**: Implement FastAPI router/service in `server/app/routers/sponsorships.py` and `server/app/services/sponsorships.py`, enforcing role matrix, structured validation, and reminder trigger endpoint.
- **Day 5**: Deliver React workspace at `frontend/src/pages/Sponsorships/index.tsx` with chip-driven selects, beneficiary/member comboboxes, newcomer integration, pledge adjustment wizard, and toast-driven reminder actions. Wire to the strongly typed helpers in `frontend/src/lib/api.ts`.
