# Client UAT Batch 3 - Newcomer and Sponsorship

Reviewed against the current code before applying changes. Statuses below reflect what was changed in this pass versus what was already implemented.

## Newcomer

| UAT item | Status | Annotation |
| --- | --- | --- |
| Need delete button | Done | Added Admin-only delete endpoint and delete buttons on the newcomer list/profile. Linked sponsorships are unlinked before the mistaken newcomer record is removed. |
| Arrival date is missing | Clarified / improved | Arrival date already existed in create/edit/profile. Added it to the newcomer list table so it is visible in the main workspace. |
| Country of origin | Already implemented | Country of origin already existed in intake, edit, profile, and reports. |
| Add Temporary/Current to Address, City, Province, Postal Code | Done | Intake and edit now explicitly separate Temporary and Current address fields. Current address fields now save. |
| Does not save after adding interaction and changing status | Done | Add Interaction now includes an optional status update, so the note and status change are saved together. |
| Add sponsored by linked with membership | Already implemented | Sponsored by already searches active existing members and stores the member link/name. |
| Need Delete and Edit button | Done | Edit details already existed on profile. Added delete. |
| Need individual report | Done | Added an Individual Newcomer Report panel in Admin Reports using existing profile, timeline, interaction, and address APIs, with JSON download. |

## Sponsorship

| UAT item | Status | Annotation |
| --- | --- | --- |
| Search bar only searches beneficiary; enable member names | Done | Backend search now checks co-sponsor member names, beneficiary member names, external names, and linked newcomer names. |
| Rename Father of repentance to Father of Confession | Done | Updated sponsorship wizard/profile labels. |
| Rename Beneficiary into Co-sponsor | Done as label-only | Interpreted as a UI wording request. Visible Sponsorship copy now uses Co-sponsor for the member sponsor and Immigrant for the person receiving support. Backend/internal `beneficiary_*` field names remain unchanged to avoid a risky data-model rename. |
| Last sponsored by should show name not date | Done | Co-sponsor context now returns and displays the last sponsored person/name instead of only the date. |
| Sponsorship frequency: add last five years options | Done | Added 1 year through 5 years frequency options. |
| No way to reverse/delete after completed | Done | Completed cases can now be reversed to Active or deleted. Draft/Rejected/Completed cases can be deleted. |
| Rename Budget to Allocated sponsor | Done | Main budget/allocation labels were changed to Allocated Sponsor wording. |
| Replace Suspend with Decline | Done | UI labels now show Decline/Declined while keeping the existing backend status value for compatibility. |
| Dashboard under Immigrant, remove parentheses | Done | Sponsorship list immigrant names no longer append `(Newcomer)`, `(Member)`, or `(External)`. |
| Delete button if created by mistake | Done | Added sponsorship delete endpoint and list delete action for Draft, Rejected, and Completed cases. |
| Finance Admin cannot add/select budget slot | Done | FinanceAdmin can now manage allocated sponsor rounds through the API and UI. |
| Rename External or member to Member | Done | Wizard card now reads Member. |
| Unable to update Draft | Verified / preserved | Draft update flow already used update endpoint then optional submit transition. No regression found; kept flow intact. |
| Reject reason required; Case summary under reject | Done | Reject reason was already required for rejected last status and status rejection. The sponsorship wizard now places Case summary / notes directly under the reject reason when the last sponsored status is Rejected. |
| Rename Payment information to Bond | Done | Sponsorship wizard/profile/report labels now use Bond. |
| Last sponsored date auto-filled | Already implemented | Backend derives it from previous sponsorship history when the user leaves the field blank. |
| New sponsorship case fields not needed | Annotate in response | Program, pledge channel, motivation, amount, and dates were not removed because backend/reporting currently uses them and amount/start date are required to create a valid case. Removing them needs a specific product decision and report/API impact check. |
| Need co-sponsor contact email and phone | Done | Co-sponsor context now returns and displays member phone/email. |
| Beneficiary FN/LN mandatory and date when adding case | Done | Manual external immigrant entry now uses required First name and Last name fields, stores the combined name for the existing backend model, and validates that the sponsorship start date is present before saving. Existing newcomer/member selections already carry first/last names from their linked records. |
| Do not link existing newcomer | Annotate in response | Existing newcomer link is still present because sponsorship/newcomer integration depends on it for shared profile, timeline, reporting, and sponsor sync. Removing it would break the current workflow and needs product confirmation before implementation. |
| Need Volunteer row | Already implemented | Volunteer services already exist in the sponsorship wizard and case context. |
| Need individual report | Done | Added Individual Sponsorship Report panel in Admin Reports with case detail, timeline, notes, allocation summary, and JSON download. |

## User Management

| UAT item | Status | Annotation |
| --- | --- | --- |
| Only members can be an admin | Done | Creating a new user/admin now requires selecting an existing member in the UI and API. Unlinked admin creation is rejected with a clear validation message. |
| Adding new admin: make search by FN and LN | Done | Member search for user creation now supports first name, last name, full name, reversed full name, email, and phone. |
| Add removed button; once user deleted, do not stay there | Done | The detail page now uses Remove wording, sends the existing soft-delete request, then returns to the User Management list. Removed users are hidden from the normal list and available through the Deleted status filter for audit/restore. |

## Reports

| UAT item | Status | Annotation |
| --- | --- | --- |
| Reports for each module using the requested columns | Done | Admin Reports now keeps the existing rich reports and adds the client report fields to individual member/payment/sponsorship report output. Newcomer and Parish Council already expose the requested fields in their report panels. |
| Membership report fields | Done | Individual member reports include FN, LN, membership date, spouse name, children names, and children birth years in `client_report_fields.membership`. |
| Payments report fields | Done | Individual payment/member reports include FN, LN, amount, payment date, email, searchable member selection, and year summaries in `client_report_fields.payments` / `client_report_fields.payment_years`. |
| Newcomer report fields | Done | Individual newcomer report panel shows FN/LN, number of family, service, arrival date, sponsored by, and origin country. |
| Sponsorship report fields | Done | Individual member report output now includes sponsorship report fields: FN/LN, membership date, at least three years of payment summaries, volunteer date/service rows from sponsorship volunteer services, last sponsored date, number sponsored, and last sponsor status. |
| Parish Council report fields | Existing coverage | Parish Council reports include lead first/last name, email, phone, trainee first/last name, training date range, and status. |
