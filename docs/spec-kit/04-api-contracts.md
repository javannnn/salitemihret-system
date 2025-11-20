# API Contracts

All endpoints live under the FastAPI service (default `http://127.0.0.1:8000`,
proxied as `/api` in staging/prod). Requests and responses are JSON (UTF-8) unless
otherwise noted. Clients MUST send:

```
Authorization: Bearer <jwt from /auth/login>
Accept: application/json
Content-Type: application/json
```

Errors follow FastAPI’s default structure:

```json
{
  "detail": "Reason message",
  "code": "optional_machine_code",
  "trace_id": "7c34d7a9f4"
}
```

`trace_id` is added by middleware for observability.

## Authentication
### Login
```
POST /auth/login
Content-Type: application/json
```
```json
{
  "email": "pradmin@example.com",
  "password": "Demo123!"
}
```
**Response** `200 OK`
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### Session Context
```
GET /auth/whoami
Authorization: Bearer <jwt>
```
Returns the authenticated user profile (id, full_name, roles, locale). Used by
the React bootstrap to hydrate RBAC and locale context.

## Members (`/members`)

### List Members
```
GET /members?page=1&page_size=20&status=Active&q=selam&tag=choir
```
**Response**
```json
{
  "data": [
    {
      "id": 42,
      "first_name": "Selam",
      "last_name": "Abebe",
      "username": "selam.abebe",
      "status": "Active",
      "phone": "+14375550123",
      "preferred_language": "am",
      "family_count": 4,
      "has_children": true,
      "tag_ids": [1,3],
      "ministry_ids": [2],
      "created_at": "2025-10-15T18:22:11.203Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 156
  },
  "trace_id": "e503e67997"
}
```

Supported query params: `status`, `gender`, `district`, `tag`, `ministry`,
`has_children`, `missing_phone`, `new_this_month`, `ids`, `sort`, `q`.

### Create Member
```
POST /members
```
```json
{
  "first_name": "Michael",
  "last_name": "Bekele",
  "phone": "+16475550123",
  "email": "michael@example.com",
  "gender": "Male",
  "marital_status": "Married",
  "preferred_language": "en",
  "address_country": "CA",
  "address_region": "ON",
  "address_city": "Toronto",
  "pays_contribution": true,
  "contribution_method": "Direct Deposit",
  "spouse": {
    "first_name": "Abeba",
    "last_name": "Bekele",
    "gender": "Female",
    "country_of_birth": "ET"
  },
  "children": [
    { "first_name": "Sara", "last_name": "Bekele", "gender": "Female", "birth_date": "2012-05-06" }
  ],
  "tag_ids": [1],
  "ministry_ids": [2],
  "father_confessor_id": 3
}
```
**Response** `201 Created`
```json
{
  "id": 87,
  "username": "michael.bekele",
  "family_count": 3,
  "household_id": 55,
  "spouse": { "id": 12, "full_name": "Abeba Bekele", "gender": "Female" },
  "children": [
    { "id": 90, "full_name": "Sara Bekele", "gender": "Female" }
  ],
  "trace_id": "4f889d29f5"
}
```

### Update Member
```
PUT /members/87
```
Partial updates use the same payload schema as create. When a clerk toggles
contribution exceptions, the backend enforces the 75 CAD default unless an
`contribution_exception_reason` is provided.

### Duplicate Check
```
GET /members/duplicates?email=selam@example.com
```
Returns list of potential matches by email/phone/name for intake guardrails.

### Contribution Payments
```
POST /members/87/contributions
```
```json
{
  "amount": 75,
  "currency": "CAD",
  "method": "E-Transfer",
  "note": "March tithe"
}
```
Returns the appended payment record and triggers finance notifications.

## Bulk & Imports (`/members/bulk`, `/members/files`)
- `POST /members/bulk/export.csv` – Streams CSV of selected member IDs or filter.
- `POST /members/bulk/import` – Multipart upload; FastAPI validates using the
  controlled lookup tables and returns a row-by-row report.
- `POST /members/files/avatar` – Uploads profile avatar (`multipart/form-data`)
  and returns the stored path + signed URL.

## Sponsorships (`/sponsorships`)
```
POST /sponsorships
```
```json
{
  "sponsor_member_id": 42,
  "beneficiary_member_id": 77,
  "pledge_amount": 150,
  "pledge_frequency": "Monthly",
  "pledge_channel": "Online portal",
  "reminder_channel": "Email",
  "program": "Education",
  "status": "Active",
  "motivation": "Parish Initiative"
}
```
`GET /sponsorships?status=Active&program=Education` provides paginated pledges
with outstanding balances and reminder cadence metadata. `POST
/sponsorships/{id}/remind` queues a manual reminder aligned with the sponsor’s
contact preferences.

## Payments (`/payments`)
- `GET /payments?page=1&page_size=25&status=Pending&member_id=42`
  returns paginated ledger entries plus a `summary` block (totals, due amounts).
- `POST /payments` records a new payment (Finance/Admin roles only).
- `POST /payments/{id}/correct` creates a correcting entry referencing the
  original payment.
- `GET /payments/export.csv?...` streams a CSV with headers defined in the
  payments router (`payment_id`, `posted_at`, etc.).
- `POST /payments/day-lock` allows Finance to lock a day’s ledger; unlock
  requests capture reason + approvals.

## Newcomers & Children
- `GET /newcomers` / `POST /newcomers` for intake records and follow-up queue.
- `POST /newcomers/{id}/convert` promotes a newcomer to a member while migrating
  linked sponsorships.
- `GET /children/eligible?days=7` returns children turning 18 within the window;
  `POST /children/{id}/promote` finalizes the transition.

## Priests & Reference Data
- `GET /priests?q=haymanot` – Search father-confessor directory.
- `POST /priests` – Inline creation from the membership form (Admin/PR only).
- Reference tables (tags, ministries, payment service types) expose read-only
  list endpoints consumed by dropdowns.

## License Service
- `GET /license/status` – Returns current license state (used by middleware).
- `POST /license/activate` – Accepts signed payload, only accessible to Admin.

## File & Export Formats
- CSV exports use UTF‑8 with LF endings. Dates follow ISO 8601.
- Binary downloads (avatar, import template) set `Content-Disposition` for
  direct browser download.
- Streaming responses chunk data to avoid large memory usage; clients should
  expect `Transfer-Encoding: chunked`.

## Rate Limiting & Timeouts
- Nginx enforces a 60-second proxy timeout; long-running jobs (imports) return
  immediately with a report payload and continue server-side.
- System default limit: 100 requests/min per token (burst 50). 429 responses
  include `Retry-After` headers.
