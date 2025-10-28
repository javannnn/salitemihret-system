# API Contracts

All API traffic uses JSON over HTTPS with UTF-8 encoding. Clients attach the
Frappe session cookie and CSRF token header `X-Frappe-CSRF-Token` for
state-changing operations. Responses include `trace_id` propagated from the
backend for observability.

## REST Resources
### Members (`/api/resource/Member`)
#### List Members
```
GET /api/resource/Member?fields=["name","member_id","first_name","last_name","status"]&limit_page_length=50&limit_start=0
```
**Query Parameters**
- `status` (optional): filter by latest status.
- `search` (optional): fuzzy search across names, phone, email.

**Response**
```json
{
  "data": [
    {
      "name": "MEM-00001",
      "member_id": "MIH-2024-001",
      "first_name": "Selam",
      "last_name": "Abebe",
      "status": "Active",
      "trace_id": "6f3a1a9d92"
    }
  ],
  "message": null
}
```

#### Create Member
```
POST /api/resource/Member
Content-Type: application/json
X-Frappe-CSRF-Token: <token>
```
```json
{
  "member_id": "MIH-2024-105",
  "first_name": "Michael",
  "last_name": "Bekele",
  "birth_date": "1995-04-12",
  "preferred_language": "am",
  "phone": "+251911000000"
}
```
**Response**: `201 Created` with full record payload.

#### Update Member
```
PUT /api/resource/Member/MEM-00001
```
Body includes fields to update; server returns updated document and emits an
`Audit Event` of type `Manual Entry`.

### Payments (`/api/resource/Payment`)
#### Create Payment or Correction
```
POST /api/resource/Payment
```
```json
{
  "payment_reference": "BANK-2024-993",
  "member": "MEM-00001",
  "payment_date": "2024-12-12",
  "amount": 1500,
  "method": "Transfer",
  "allocation": "General Fund"
}
```

To record a correction:
```json
{
  "payment_reference": "BANK-2024-993-CORR",
  "member": "MEM-00001",
  "payment_date": "2024-12-15",
  "amount": -1500,
  "method": "Adjustment",
  "allocation": "General Fund",
  "correction_of": "PAY-00077",
  "memo": "Duplicate reversal"
}
```
Server validates that `correction_of` exists and amounts reconcile. Correction
creates a new row and an `Audit Event` of type `Payment Corrected`.

### Sponsorships (`/api/resource/Sponsorship`)
- Supports standard list/detail CRUD.
- `GET /api/resource/Sponsorship?filters={"status":"Active"}` returns active
  pledges for dashboards.

### Media Requests (`/api/resource/Media Request`)
- `POST` requires `Media Coordinator` role.
- Transitioning `status` to `Approved` triggers background job to create a
  `Public Post` and log `Media Approved` and `Media Published` audit events.

### Public Feed (`/api/resource/Public Post`)
Read-only list for internal preview. External website uses a separate public API
(`media.public_feed`).

## Whitelisted Methods
### `members.download_template`
- **Method**: `GET /api/method/salitemiret.api.members.download_template`
- **Purpose**: Returns Excel template with required headers for member imports.
- **Response**: Binary XLSX with headers listed in Data Import Export spec. Sets
  `Content-Disposition` for download.

### `members.preview_import`
- **Method**: `POST /api/method/salitemiret.api.members.preview_import`
- **Payload**:
```json
{
  "file_id": "ATT-00045"
}
```
- **Behavior**: Runs server-side validation using `openpyxl`, coerces data, and
  returns a summary without mutating data.
- **Response**:
```json
{
  "summary": {
    "total_rows": 250,
    "valid_rows": 240,
    "errors": [
      {
        "row": 5,
        "column": "phone",
        "message": "Invalid E.164 number"
      }
    ]
  },
  "trace_id": "8c22da23bc"
}
```

### `members.import_members`
- **Method**: `POST /api/method/salitemiret.api.members.import_members`
- **Payload**:
```json
{
  "file_id": "ATT-00045",
  "dry_run": false
}
```
- **Behavior**: Queues a background job (`queue: long`) to process validated
  rows. Returns job ID immediately.
- **Response**:
```json
{
  "job_id": "JOB-2024-1183",
  "message": "Member import enqueued",
  "trace_id": "1bb4a3f0c1"
}
```
- **Job Result**: On completion, job attaches an error CSV (if any) and logs
  `Import Completed` audit event. Front end polls `/api/method/frappe.utils.get_job_status`.

### `members.status_suggestions`
- **Method**: `GET /api/method/salitemiret.api.members.status_suggestions`
- **Parameters**: `member_id` (optional). When omitted, returns batch of pending
  suggestions.
- **Logic**: Evaluates automated rules:
  - Six-month consecutive contribution streak → suggest `Active` or `Sponsor`.
  - Child reaching 18 years → suggest transition to `Adult` status and notifies
    PR.
- **Response**:
```json
{
  "suggestions": [
    {
      "member": "MEM-00001",
      "proposed_status": "Active",
      "reason": "six_month_streak",
      "evidence": {
        "contribution_count": 6,
        "total_amount": 4500
      }
    }
  ],
  "trace_id": "2e9d54aac4"
}
```

### `members.approve_status`
- **Method**: `POST /api/method/salitemiret.api.members.approve_status`
- **Payload**:
```json
{
  "member": "MEM-00001",
  "proposed_status": "Active",
  "suggestion_id": "SUG-2024-55",
  "notes": "PR acknowledgement"
}
```
- **Behavior**: Persists `Member Status History` row, updates `Member.status`,
  emits `Status Approved` audit event, and sends confirmation email to PR team.

### `media.public_feed`
- **Method**: `GET /api/method/salitemiret.api.media.public_feed`
- **Purpose**: Returns published posts for consumption by the external website.
- **Response**:
```json
{
  "posts": [
    {
      "slug": "lent-kes-bereket",
      "title": {
        "en": "Lent Charity Highlights",
        "am": "የጾም ለጋስ ማስታወሻ"
      },
      "published_on": "2024-03-10",
      "excerpt": "Community giving milestones...",
      "hero_image": "https://cdn.salitemihret.org/media/hero123.jpg"
    }
  ],
  "trace_id": "f9fb0bde76"
}
```
- **Caching**: Responses cache for 60 seconds to support CDN distribution.

## Error Handling
- All errors follow `{ "error": { "code": "...", "message": "...", "trace_id": "..." } }`.
- Validation errors return HTTP 422 with field-level details.
- Authorization failures return HTTP 403 and log an `Audit Event`.
- Background job failures attach stack trace to the job and produce an error CSV
  when applicable.

## Pagination & Sorting
- List endpoints accept `limit_start`, `limit_page_length`, and `order_by`.
- Maximum page length is 200. Large exports use background jobs described in the
  Data Import Export specification.

## Rate Limiting
- Per authenticated user: 100 requests/minute for standard endpoints, 10/minute
  for import-related methods.
- Rate limit exceedances return HTTP 429 with `Retry-After` header.
