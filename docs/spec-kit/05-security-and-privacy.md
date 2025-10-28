# Security and Privacy

## Access Control
- **Deny-by-default RBAC**: Every DocType requires explicit role permissions for
  read, write, create, submit, and cancel operations. Anonymous access is
  disabled across the site.
- **Role Profiles**: Roles align with personas (Parish Registrar, PR Admin,
  Finance Clerk, Media Coordinator, Sunday School Lead, Volunteer Coordinator,
  Council Secretary). Composite permissions avoid assigning System Manager.
- **Sensitive Fields**: Pastoral notes, PII, and financial data require elevated
  roles and enforce field-level permission restricted to `read` or `write` as
  necessary.
- **Two-factor authentication**: Required for Finance Clerks and PR Admins;
  optional but encouraged for others.

## Authentication & Session Management
- Frappe session cookies flagged `HttpOnly`, `Secure`, `SameSite=Lax`.
- Session inactivity timeout: 8 hours with rolling extension. Forced logout at
  24 hours absolute.
- CSRF tokens checked on all non-GET requests; mismatches return HTTP 403.
- Brute-force protection: 5 failed logins lock the account for 15 minutes and
  trigger an audit event.

## Data Protection
- **PII Handling**: Fields containing names, contact info, household details,
  and pastoral notes are tagged in Frappe to automatically mask in exports unless
  role permits. Sensitive exports require explicit acknowledgement dialogs.
- **Encryption at Rest**: MariaDB tablespaces reside on encrypted disks.
  Passwords and secrets stored via Frappe Password field (AES encrypted).
- **In Transit**: Nginx enforces TLS 1.2+ with HSTS (max-age 31536000, includeSubDomains).

## Logging & Audit
- Every semantic action emits both a Frappe Version entry and a custom
  `Audit Event`. Event payloads include actor, timestamp, and `trace_id`.
- Audit categories cover imports, status decisions, payment corrections, media
  approvals, sponsorship changes, and council updates.
- Logs retain 400 days in centralized storage. Access to audit logs limited to
  Council Secretary and System Operators.

## Rate Limiting & Abuse Prevention
- REST endpoints capped at 100 requests per minute per user.
- Import and status suggestion methods limited to 10 requests per minute.
- Media public feed cached and rate-limited to defend against scraping.
- Background jobs triggered by imports enforce concurrency guard (one active per
  uploader).

## Data Retention & Deletion
- Soft deletes via `is_active` or `active` flag; records remain queryable for
  audit. Hard deletes require Council approval and manual script with full audit
  event.
- Audit logs retained indefinitely. Backups kept for 365 days with monthly
  archives stored offsite.
- Newcomer records archive automatically 12 months after conversion or closure,
  with personal contact details redacted.

## Privacy Compliance
- Administrators must obtain consent before importing PII. Import stepper
  includes explicit confirmation checkbox.
- Email notifications include parish privacy statement and contact for removal.
- Public posts expose only approved content flowing from Media Requests; no PII
  beyond what media team approves.

## Infrastructure Hardening
- Docker images built from minimal base images, scanned for CVEs during CI.
- Nginx security headers: `Content-Security-Policy`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`.
- SSH access to hosts restricted via key-based authentication and audit logging.

## Incident Response
- Security incidents documented in dedicated runbook. Detection events from
  Sentry or anomaly alerts trigger on-call rotation.
- Breach impact assessment completed within 24 hours; affected members notified
  per diocesan policy.
- Audit Event timeline used to reconstruct incident chronology.
