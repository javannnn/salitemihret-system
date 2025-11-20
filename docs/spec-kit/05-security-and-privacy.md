# Security and Privacy

## Access Control
- **Deny-by-default RBAC**: Every FastAPI router uses dependency guards
  (`require_roles`) so only the personas defined in Spec-Kit can reach an
  endpoint. Unauthenticated traffic is limited to `/health`, `/license/status`,
  and `/auth/login`.
- **Role Profiles**: Roles map 1:1 with personas (Parish Registrar, PR
  Administrator, Finance Clerk, Volunteer Coordinator, Council Secretary, Media
  Coordinator). Admins assign roles through the `/users` management CLI; no one
  is granted blanket “superuser” rights outside Infra.
- **Field-Level Controls**: Sensitive columns (pastoral notes, contribution
  exception notes, household contact information) are only returned when the
  requester’s role allows it; serialization schemas omit fields for clerks.
- **Two-Factor Authentication**: TOTP enforcement is required for Finance/Admin
  accounts (stored as encrypted secrets) and optional for other personas.

## Authentication & Session Management
- JWT access tokens issued by `POST /auth/login`, signed with `HS256` and the
  environment-specific `JWT_SECRET`. Default TTL: 60 minutes with sliding
  refresh via silent login.
- Tokens travel in the `Authorization: Bearer` header. No cookies are used for
  API authentication, eliminating CSRF exposure.
- Passwords stored with bcrypt via Passlib (strength 12). Account lockout
  triggers after five failed attempts within 15 minutes.
- The `/auth/whoami` endpoint exposes current user metadata; `require_roles`
  validates the token on every request and enforces license state.

## Data Protection
- **PII Handling**: Columns containing PII are tagged in SQLAlchemy models and
  automatically masked in exports unless the caller holds Finance/Admin/PR
  rights. CSV exports show placeholders (`***`) for restricted fields.
- **Encryption at Rest**: PostgreSQL data volumes use OS-level encryption (LUKS
  locally, encrypted EBS in cloud). Secrets live in systemd EnvironmentFiles or
  GitHub Actions secrets.
- **Encryption in Transit**: Nginx enforces TLS 1.2+ with HSTS
  (`max-age=31536000; includeSubDomains`). Internal service-to-service traffic
  is localhost only (Nginx ↔ uvicorn).

## Logging & Audit
- Every write goes through the audit service (`app/services/audit.py`), which
  diffs the member payload and inserts rows into `member_audit`. Domain events
  (imports, payment corrections, sponsorship status changes) also create
  `audit_events` rows with JSON payloads.
- Structured logs emit JSON with `trace_id`, user id, and request metadata. Logs
  stream to journald/systemd locally and to the centralized log stack in
  staging/prod (Loki/Splunk).
- Retention: 400 days for logs, unlimited for `audit_events`.

## Rate Limiting & Abuse Prevention
- REST endpoints limited to 100 requests/min/token via Nginx `limit_req`. Burst
  requests receive `429` + `Retry-After`.
- Import + bulk endpoints throttle to 5 concurrent jobs per role and enforce a
  queue lock keyed by uploader ID to stop duplicate imports.
- Public media feeds are cached (300 s) and use an IP-based rate limiter to
  deter scraping.

## Data Retention & Deletion
- Soft deletes rely on `deleted_at` or `is_active`; records remain queryable for
  audit. Hard deletes require Council approval plus an Alembic script recorded
  in `audit_events`.
- Backups: Daily physical backups + WAL shipping retained 365 days. Monthly
  snapshots copied to offsite bucket.
- Newcomers auto-archive 12 months post conversion, with phone/email redacted.

## Privacy Compliance
- Import wizard forces an explicit consent checkbox referencing the parish
  privacy statement.
- System emails append the privacy footer + unsubscribe instructions.
- Public posts originate only from approved Media Requests; attachments are
  scrubbed of EXIF data before publishing.

## Infrastructure Hardening
- Ubuntu LTS hosts with unattended upgrades. Only SSH keys are allowed; sudo
  requires membership in the `salitemihret-admin` group and is logged.
- Nginx security headers: `Content-Security-Policy "default-src 'self'"`,
  `X-Frame-Options DENY`, `Referrer-Policy strict-origin-when-cross-origin`,
  `Permissions-Policy` locking down sensors.
- Containers (when used) are built from slim Python images and scanned in CI
  using Trivy.

## Incident Response
- Alerts: Sentry (frontend/backend), Prometheus (CPU/mem), and PostgreSQL WAL lag
  alarms. Paging handled via OpsGenie rotation.
- Severity-1 timeline: acknowledge ≤ 15 minutes, containment ≤ 1 hour, diocesan
  notification per policy, RCA published within 5 days.
- Audit tables + structured logs provide the canonical forensic trail; runbooks
  in `/docs/ops/` describe evidence collection and disclosure steps.
