# Membership Module – QA Checklist

This checklist captures the regression pass completed for Phase 5 (QA & polish). Use it as the baseline for future smoke tests before cutting a release or deploying to the client server.

---

## 1. Environment

- **Backend**: `salitemihret-dev-backend` systemd service (FastAPI + Uvicorn) running on `http://127.0.0.1:8000`.
- **Frontend (dev)**: Vite dev server at `http://localhost:5173` with `VITE_API_BASE=http://localhost:8000`.
- **Frontend (parity)**: Built assets served via Nginx with `/api` proxy to `127.0.0.1:8000`.
- **Demo credentials**: `superadmin@example.com`, `pradmin@example.com`, `finance@example.com`, etc. (all `Demo123!`).

---

## 2. Automated / Scripted Checks

| Area                     | Command                                                                                                  | Expected Result                                    |
|--------------------------|-----------------------------------------------------------------------------------------------------------|-----------------------------------------------------|
| Backend health           | `curl -s http://127.0.0.1:8000/health`                                                                   | `{"status":"ok"}`                                   |
| Auth login               | `curl -s -X POST /auth/login …`                                                                           | `200` + JWT token                                   |
| Members list             | `curl -s -H "Authorization: Bearer TOKEN" /members`                                                       | JSON list honoring pagination                       |
| CSV export               | `curl -s -H "Authorization: Bearer TOKEN" "/members/export.csv?status=Active" | head`                        | CSV header + sample rows                            |
| CSV import               | `curl -s -X POST /members/import -F "file=@members_sample.csv;type=text/csv"`                            | `{"inserted":…,"updated":…}`                        |
| Avatar upload            | `curl -s -X POST /members/{id}/avatar -F "file=@tiny.png"`                                               | JSON confirming avatar URL                          |
| Audit feed               | `curl -s /members/{id}/audit`                                                                             | JSON array of audit entries                         |
| Contribution history     | `curl -s /members/{id}/contributions`                                                                     | JSON array (empty/non-empty)                        |
| Contribution payment add | `curl -s -X POST /members/{id}/contributions -d '{"amount":75,"paid_at":"YYYY-MM-DD"}'` (Finance/Admin) | `201` + payment record                              |
| Payments list            | `curl -s -H "Authorization: Bearer TOKEN" "/payments?page=1"`                                             | JSON list with service_type/member details          |
| Payments report export   | `curl -s -H "Authorization: Bearer TOKEN" "/payments/export.csv?status=Pending" | head`                    | CSV header with member/service columns              |
| Close previous day       | `curl -s -X POST /payments/locks -H "Authorization: Bearer TOKEN" -H 'Content-Type: application/json' -d '{}'` | JSON lock object showing `locked=true`               |
| Unlock day               | `curl -s -X POST /payments/locks/2025-11-09/unlock -H "Authorization: Bearer TOKEN" -H 'Content-Type: application/json' -d '{"reason":"Need adjustments"}'` | Returns unlocked row (if previously locked) |

---

## 3. Frontend Smoke (Dev + Parity Builds)

1. **Login** – Verify Super Admin, PR Admin, Finance Admin, and Registrar logins; ensure role-based UI (actions, tabs) renders correctly.
2. **Members list** – Search, quick filters (Active, Archived, Has children, Missing phone, New this month), sort toggle, filter drawer.
3. **Actions dropdown** – Export CSV, Import CSV; confirm menu doesn’t collapse unexpectedly.
4. **Quick add member** – Hover animated `+` button → fill required fields → ensure record opens in full editor; test “View full form” link.
5. **Bulk actions** – Multi-select rows; assign father confessor, export selected, archive selected (with confirmation).
6. **Member detail** – Tabs load; edit flows respect permissions (Clerk vs Registrar vs Finance). Contribution exception logic enforces 75 CAD rule.
7. **Contribution history** – Record payment via Finance Admin; verify table updates immediately.
8. **Audit tab** – Confirm recent changes recorded (avatar change, contribution update, import).
9. **Import wizard** – Upload sample CSV, map headers, preview, import, review summary toast.
10. **Dark mode toggle** – Switch themes; verify persistence and readability.
11. **Payments ledger** – Login as Finance Admin; verify summary cards, status/due badges, export report, member auto-suggest (select + clear), record payment/correction. Login as Office Admin to confirm read-only banner and hidden Record button.
12. **Member payment timeline** – From the ledger, open a member link; confirm the timeline shows chronological cards, status chips, due dates, memo, and shortcut to the full member profile.
13. **Daily close** – Lock yesterday via `/payments/locks`, verify ledger prevents new payments dated that day, unlock with a justification, and ensure creation works again.

---

## 4. Regression Notes

- Contribution enforcement now blocks `pays_contribution=false` and non-standard amounts without exceptions (both API and UI).
- Actions dropdown uses outside-click handling to avoid premature closure (fix verified).
- Quick-create modal restricts to required fields and guides users toward the full form when needed.
- Demo data refreshed via `app.scripts.seed_demo`; includes contribution payment seed records for Finance role testing.

---

## 5. Outstanding Follow-ups

- Integrate backend automated tests (`pytest`) for contribution endpoints when CI is available.
- Expand curl script coverage to include promotions endpoints once the next module begins.

This checklist should be rerun (or selectively sampled) before each deployment. Update it with new cases as the product evolves.
