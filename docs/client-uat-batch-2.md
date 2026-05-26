# Client UAT Batch 2

Source received: 2026-05-19

Legend:

- **Solved**: Current implementation already covers the issue.
- **Partially solved**: Current implementation covers part of the issue, but not the full client expectation.
- **Open**: Current implementation does not cover the issue or needs a code change.
- **Needs clarification**: The client note is ambiguous enough that the exact acceptance criteria should be confirmed.

## Payment UAT Issues

| # | Module | Test/use case | Client issue | Status | Implementation notes | Next action |
|---|---|---|---|---|---|---|
| 1 | Payment | Report | Need individual report accessed by Finance and Admin, searchable by member first name. | Solved | Financials now embeds an Individual Payment Report panel that reuses the full individual member report and opens through a payment-report API route. Search still uses the shared member search endpoint, so first name, last name, full name, phone, email, and username all work. | Retest under Reports > Financials by searching a first name and loading the report. |
| 2 | Payment | Add record | Members need to be searched by first name and last name. Only members can make monthly contribution. | Solved | Payment add-record member lookup already supports first/last name. Backend and frontend now reject `CONTRIBUTION` payments unless an active member is linked. | Retest Record payment > Monthly Contribution without selecting a member; it should block. |
| 3 | Payment | Add record | Only members can make monthly payment; non-members should only be donation. | Solved | Non-member payments are now allowed only for `DONATION`. Other service types without a member are rejected server-side and blocked in the record dialog. | Retest Tithe/Contribution with no member; retest General Donation with donor fields. |
| 4 | Payment | Dashboard | Once we delete the user, we do not need to see it in the dashboard. | Solved | Payment list, dashboard recent payments, summaries, and export now exclude ledger rows linked to archived/deleted members. Non-member donations remain visible because they are not deleted-user records. | Retest dashboard and Payments list after archiving/deleting a member. |
| 5 | Payment | Non-members | Under General Donation, instead of member we need donor name. | Solved | Payments now store donor first name, donor last name, and donor email for non-member General Donation entries. The ledger displays the donor name in the member/donor column instead of `Unassigned`. | Retest General Donation without member and confirm donor name is shown. |
| 6 | Payment | Non-members | Donor name can be searched; add donation registration that has first name, last name, amount, and email. | Solved | General Donation record flow now captures first name, last name, email, and amount. The payment search parameter also searches donor first name, donor last name, and donor email. | Retest by recording a donor donation and searching the donor name in Payments. |
| 7 | Payment | Update payment | Once payment is updated for 6 months, Auto Status has to change to Active. | Solved | Membership health now includes completed contribution ledger entries and ignores adjusted originals. Contribution corrections/replacements refresh the linked member status, so a six-month replacement amount updates Auto Status to Active. | Retest correcting a contribution to six months of coverage. |
| 8 | Members/Payment | Finance Admin opens member | Cancel button is not working. | Solved | Member edit footer now behaves as `Cancel / Back`: it discards local edits when a snapshot exists, clears the unsaved state, and navigates back. | Retest from Finance/Admin member edit. |
| 9 | Payment | Report | Need individual report. | Solved | Duplicate of item #1. The individual report is now directly available from Reports > Financials. | Retest with item #1. |

## Notes

- Payment/donation modeling gaps are now covered by donor identity fields on General Donation payments.
- Member search by first/last name remains handled by the shared member search API.
- Individual reports are now surfaced in the Financials/Payment report area as requested.
