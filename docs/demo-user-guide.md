# SaliteMihret Demo Guide

Welcome to the hosted demonstration of the SaliteMihret membership platform. This document walks you through the key features available in the demo build, explains the sample accounts, and highlights tips for navigating the UI efficiently.

---

## 1. Demo Access

| Role              | Email                     | Password  | Highlights                                                                 |
|-------------------|---------------------------|-----------|----------------------------------------------------------------------------|
| Super Admin       | `superadmin@example.com`  | Demo123!  | Full access to every feature, including finance and permissions.           |
| PR Admin          | `pradmin@example.com`     | Demo123!  | End-to-end member management with household and spiritual controls.        |
| Registrar         | `registrar@example.com`   | Demo123!  | Create/update members, manage personal details, upload avatars.            |
| Clerk             | `clerk@example.com`       | Demo123!  | Data-entry for contact info; read-only finance/spiritual fields.           |
| Finance Admin     | `finance@example.com`     | Demo123!  | Contribution and payment history tools; limited personal data editing.     |

> **Tip:** The login screen lists the accounts above. Use different roles in separate browser sessions to see how the UI adapts to permissions.

---

## 2. Application Layout

- **Top bar** – Theme toggle (light/dark), quick access to profile, and global navigation.
- **Left navigation** – Primary modules (Dashboard, Members). Additional links appear based on role.
- **Main canvas** – React-based pages with subtle motion/blur effects; all pages support dark mode.
- **Toasts** – Non-blocking notifications appear bottom-right; they auto-dismiss or can be closed manually.

> Hold `Shift` while clicking links to open them in a new tab without losing context.

---

## 3. Dashboard Overview

- **Quick actions** – Cards for “Invite member”, “Import CSV”, or “View reports” (context-sensitive).
- **Membership stats** – Active vs. archived counts, new members this month, upcoming birthdays.
- **Contribution snapshot** – Aggregate amount paid vs. outstanding, exception flags, last 5 payments.
- **Financial snapshot** – Finance/Admin roles see a charted card with grand total, top service types, and a sparkline of recent totals (read-only banner for other roles).
- **Next steps** – Shortcut cards to the Members list, Import wizard, and Promotions drawer.

> Use this page to confirm that data synced correctly after migrations or imports.

---

## 4. Members List

### 4.1 Search & Filters

- **Search bar** – Matches first/middle/last name, username, email, phone, and district.
- **Sort** – Choose by last updated, created date, or alphabetical (first/last name).
- **Quick filters** – Toggle buttons for `Archived`, `Active`, `Has children`, `Missing phone`, `New this month`.
- **Filter drawer** – Click *Filters* → refine by status, gender, district, tags, ministries.
- **URL persistence** – Search, filters, and pagination sync to the query string (bookmark/share the link).

### 4.2 Table Essentials

- Rows are clickable; hitting `Enter` opens the member detail view.
- Bulk selection (checkbox column) unlocks:
  - Assign Father Confessor (roles with spiritual edit rights)
  - Set household (coming soon)
  - Export selected members (CSV)
  - Archive selected members (Admin/PR Admin)
- **Actions menu** (`⋮` on each row):
  - View profile
  - Assign father confessor
  - Export CSV (single member)
  - Archive member (with confirmation prompt)

### 4.3 Member Snapshot

- Primary column shows avatar/initials, names, username.
- Status + marital status badges.
- Family column highlights household size override, father confessor assignment.
- Giving column uses colored chips:
  - Tithe chip (emerald)
  - Contribution chip (sky blue) with currency amount and exception label if applicable.

> **Tip:** Hover anywhere on a row to preview the quick actions before clicking.

### 4.4 Quick Add Button

- Hover the circular “+” icon in the Members header to animate the control; click to open the floating quick-add dialog without leaving the list.
- Only the mandatory fields (first name, last name, phone, status) are shown in this modal. Use **View full form** to jump into the complete editor if you need additional fields.
- The modal stays centered over a dimmed backdrop so you can capture new contacts quickly and return to the same scroll position.

---

## 5. Member Detail

### 5.1 Layout

- **Sticky header** – Member name, status dropdown, avatar, quick action buttons (Archive, Delete, Save, Save & Close).
- **Tabs** – Profile, Contact & Address, Household & Family, Faith, Giving, Tags & Ministries, Audit.
- **Right sidebar** – Profile snapshot plus contribution summary and quick metrics.

### 5.2 Profile Tab Highlights

- Upload avatar (drag-drop or click). Larger images auto-crop to square; audit trail records changes.
- Personal info: names, baptismal name, gender, DOB, join date.
- Contact panel for email, phone, addresses.
- Household selector: choose existing, clear, or create inline.

### 5.3 Household & Family

- Spouse block auto-appears when marital status = Married (required fields enforced).
- Children listed as compact cards with chips for age, gender, notes.
- Add Child button opens a side drawer; children auto-sort by age.
- **Promotion cues** – For children close to 18, badges appear with “Promote to member” button.

### 5.4 Faith Tab

- Father confessor toggle, remote search, and inline creation (Admin/PR Admin).
- Assign/unassign notes recorded in audit log.

### 5.5 Giving Tab

- Contribution method (cash, direct deposit, e-transfer, credit).
- Membership contribution amount enforced at **75 CAD** unless a hardship exception is selected (`LowIncome`, `Senior`, `Student`, `Other`).
- Exception selector automatically enables manual amount entry.
- Contribution history table (Finance/Admin):
  - Displays ledger payments (same data as the Payments module) with date, service type, amount, method, status, and memo.
  - Inline form reuses the Payments options (service type dropdown, method select, memo) and writes directly to the shared ledger.
  - “View payment timeline” button jumps straight to the Finance module’s member timeline for deeper investigation.

### 5.6 Audit Tab

- Chronological timeline of changes (field, before/after, actor, timestamp).
- Avatar updates, CSV imports, contribution adjustments, household changes all log entries.
- Use filters at the top to search for a specific field change.

> **Keyboard tip:** `Ctrl+S` (Windows/Linux) or `Cmd+S` (macOS) triggers the Save action when focused on form fields.

---

## 6. CSV Import & Export

- **Export CSV** (Admin/PR Admin):
  - Button in Members list → *Actions* dropdown.
  - Respects current filters; optional `ids` query parameter when triggered per member.
  - Columns include household, tags, ministries, spouse/children details, contribution amount, exceptions.

- **Import CSV**:
  - Accessible via Members list → *Actions* → *Import CSV*.
  - Drag CSV file or click to browse; wizard auto-detects headers.
  - Field mapping screen lets you align columns manually.
  - Preview shows normalized rows; click *Import* to run.
  - Completion summary: inserted/updated/failed counts with per-row error messages.

> The importer auto-creates households, tags, ministries, father confessors, and enforces mandatory contribution unless a valid exception is provided.

---

- _Payments ledger_ – New module for Finance/Admin roles; review contributions and corrections.

---

## 7. Payments Ledger (Finance/Admin)

- **Access** – Only `FinanceAdmin` and `Admin` see the Payments nav entry. `OfficeAdmin` can view/read-only inside the module, while other roles consume payment info via the Members detail page.
- **Filters** – Service type, member ID, method, status, start/end date. Use *Reset filters* to return to defaults.
- **Summary cards** – Totals per service type for the selected date range, plus a grand total chip.
- **Ledger table** – Posted timestamp, member profile snippet (clickable), service label + description, method, amount, memo, correction badge.
- **Status & due chips** – Color-coded badges indicate `Pending`, `Completed`, or `Overdue`; due dates display alongside the badge (overdue dates render in red).
- **Export report** – The *Export report* button downloads a CSV that honors the current filters (Finance/Admin). Office Admins can also download for read-only review.
- **Record payment** – Opens dialog to enter amount, service type, optional member (smart search + manual ID), method, memo, due date, and status override.
- **Corrections** – Finance/Admin can submit a correction reason; the system creates a reversing entry.
- **Member timeline** – Click any linked member to open an interactive, modern timeline showing each payment card with status chips, due dates, method, and notes. If the member was deleted or the payment is now unassigned, the page still renders the legacy ledger entries and clearly labels the record as archived/unlinked.
- **Daily close** – Finance/Admin users can lock a business day (via the Payments → “Close day” actions or API) to prevent late entries; the system auto-locks the previous day at 02:05 UTC. Unlocking requires a justification and logs the actor/reason.

> Office Admins see a “Read-only access” banner in this module. All ledger entries are append-only; corrections never overwrite the original row.

### 7.1 Linking Payments to Members

- Start typing at least two characters (“Find member”) to auto-suggest existing members by name/email/phone; selecting a result fills the member ID automatically.
- Need to paste an ID manually? Use the “Member ID (manual entry)” field—useful when reconciling batch spreadsheets.
- The selected member chip shows the current link and lets you clear it in one click.

### 7.2 Timeline View

- From the ledger, click a member’s name to open the payment timeline page.
- The header surfaces member contact info plus status totals (Completed/Pending/Overdue) and a shortcut to the full member profile.
- Each payment renders as a card on the vertical timeline with amount, service, method, due date, memo, and status badge.

---

## 7. Permissions Matrix (Quick Reference)

| Feature                                    | Admin | PR Admin | Registrar | Clerk | Finance Admin |
|--------------------------------------------|:-----:|:--------:|:---------:|:-----:|:-------------:|
| View members                               | ✅    | ✅       | ✅        | ✅    | ✅            |
| Create/update personal info                | ✅    | ✅       | ✅        | ✅*   | ⚪️ (read)     |
| Assign father confessor                    | ✅    | ✅       | ✅        | ⚪️   | ⚪️            |
| Manage contributions/exceptions/payments   | ✅    | ⚪️       | ⚪️        | ⚪️   | ✅            |
| View payments ledger                       | ✅    | ⚪️       | ⚪️        | ⚪️   | ✅            |
| Record donations/payments                  | ✅    | ⚪️       | ⚪️        | ⚪️   | ✅            |
| Import/Export CSV                          | ✅    | ✅       | ⚪️        | ⚪️   | ✅ (export)   |
| Archive/restore members                    | ✅    | ✅       | ⚪️        | ⚪️   | ⚪️            |
| Audit log access                           | ✅    | ✅       | ✅        | ⚪️   | ✅            |

(*Clerk can edit basic contact fields; deeper edits remain locked.)

---

## 8. Helpful Shortcuts & Tips

- **Dark mode** – Toggle in the top-right; persists via `localStorage`.
- **Session timeout** – If your token expires, you’ll be prompted to log in again. Unsaved changes are flagged before navigating away.
- **Uploads** – Avatar uploads accept PNG, JPG, WEBP; max size 2 MB.
- **Keyboard navigation** – `Tab` between inputs; `Shift + Tab` to reverse. Drawer dialogs close with `Esc`.
- **Quick reset** – Use the *Clear all filters* button when the list feels “stuck” after multiple refinements.

---

## 9. Known Demo Limitations

- Email delivery is disabled; notifications appear in logs only.
- Bulk household reassignment UI (planned) currently shows a “coming soon” toast.
- Promotions digest job logs to the backend; the email digest is stubbed.
- TLS/HTTPS depends on your staging proxy (not enabled in the bare demo build).

---

## 10. Support & Feedback

Questions or feedback during the evaluation? Reach out to the project team with:

- Summary of the action you were taking
- Screenshot or copied toast message
- Timestamp + demo user account

We’ll review requests and update the demo environment as needed.

Enjoy exploring SaliteMihret! 🎉
