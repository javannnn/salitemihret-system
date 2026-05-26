# Client UAT Batch 1

Source received: 2026-05-19

Legend:

- **Solved**: Current implementation already covers the issue.
- **Partially solved**: Current implementation covers part of the issue, but not the full client expectation.
- **Open**: Current implementation does not cover the issue or needs a code change.
- **Needs clarification**: The client note is ambiguous enough that the exact acceptance criteria should be confirmed.

## Membership UAT Issues

| # | Module | Test/use case | Client issue | Status | Implementation notes | Next action |
|---|---|---|---|---|---|---|
| 1 | Members | Validate photo upload | Validate photo upload | Needs clarification | Avatar upload endpoint exists and the member edit page opens the avatar editor/upload flow. The note repeats the use case without a specific failure. | Ask client whether this refers to missing upload button, crop flow, permission, or a failed upload case. |
| 2 | Members | Validate photo upload | No specific error message when upload fails because of file size or file type. | Solved | Backend rejects unsupported avatar MIME types with `Invalid avatar file type. Allowed types: PNG, JPEG, WEBP.` and files above 5MB with `File is too large. Maximum allowed size is 5MB.` Frontend maps these into user-friendly toast messages. | No code change required unless client wants different wording or a different size limit. |
| 3 | Members | Validate session | Active session should not expire in 30 minutes; only idle sessions should expire in 30 minutes. Active session should last 5 hours. | Solved | Idle timeout remains 30 minutes using `last_seen` refresh. Active token expiry is now `ACCESS_TOKEN_EXPIRE_MINUTES = 300`, which is 5 hours. | Retest active use beyond 30 minutes and confirm re-login only occurs at idle timeout or 5-hour token expiry. |
| 4 | Members | Extract member information | Child information downloads into one cell instead of separate columns. | Solved | Member CSV export now removes the single `children` cell and emits separate dynamic child columns such as `child_1_first_name`, `child_1_last_name`, and `child_1_birth_date`. | Retest exported sheet with families that have multiple children. |
| 5 | Members | Extract member information | Created/updated last digit contains more than two digits in downloaded user profile. | Solved | Member CSV export now formats datetime values without microseconds using `YYYY-MM-DD HH:MM:SS`. | Retest `created_at` and `updated_at` columns in CSV export. |
| 6 | Members | Edit membership under Sunday School tab | Not redirecting to Open Sunday School workspace. | Solved | Member edit has an `Open Sunday School workspace` action linking to `/schools?tab=sundayschool&search={username}`. The Schools page reads `tab=sundayschool`, switches tabs, applies the search, and clears the query string. | No code change required unless the client is using a different button/path; retest in UAT build. |
| 7 | Members | Tag and Ministry | Need manage edit similar to Household & Faith `Manage father confessors`; can tag/ministry be managed the same way? | Solved | Added tag/ministry management endpoints plus a member-page `Manage tags & ministries` modal for creating, editing, and deleting reusable tags and ministries. Deletion is blocked while an item is assigned to members. | Retest with Admin or PR login from the member edit page. |
| 8 | Members | PR login membership access | When PR logs in, they should see Members and Sponsorship. PR should not see amounts or financial activity. | Solved | PR keeps Members and Sponsorship visibility, but member finance visibility is split out. PR no longer gets member contribution edit permission, contribution fields are blocked server-side, and the member profile hides contribution amounts, giving controls, due/payment widgets, and financial activity for non-finance roles. | Retest with `pradmin@example.com`. |
| 9 | Members | Membership health | Overdue should show only for new users registered within 2 months; users over 3 months should not show overdue. | Solved | The member UI now only shows overdue contribution days for members registered within the last 62 days. Established members no longer display overdue day counts. | Retest a new member and an older existing member side by side. |
| 10 | Members | Membership status | Unable to change user status; when admin changes status, require adding a reason. | Solved | Manual membership status override remains available, and both frontend and backend now require a non-empty override reason when status is changed. | Retest admin status change with and without a reason. |
| 11 | Members | Existing members status | Existing paid members cannot remove days overdue; better to hide this information. | Solved | Existing/established members no longer display overdue day counts in Membership Health or Financial Activity. | Retest paid existing members that previously showed overdue days. |
| 12 | Reports | Individual report | Need individual report. | Solved | Added an individual member report API and Reports UI panel. The report includes member profile, household/family, spouse/children, tags, ministries, Sunday School participation/payments, contribution history, payment records, sponsorships, membership health, and membership events, with JSON download. Finance access is required because the report includes amounts. | Retest from Reports > Member Report with an Admin, Registrar, or Finance role. |

## Notes

- The client is correct on several gaps, but not all. Photo upload validation and Sunday School workspace deep-linking are already handled in the current code.
- Session handling is now aligned with the requested model: 30-minute idle lock and 5-hour active token lifetime.
- Remaining open item is the ambiguous first photo-upload note.
