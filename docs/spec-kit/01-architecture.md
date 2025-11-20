# Architecture

## System Overview
SaliteMihret now runs as a two-tier web application: a FastAPI backend
(`server/app/main.py`) backed by PostgreSQL and a React 18 admin client built
with Vite. SQLAlchemy models and Alembic migrations own the domain schema, while
APScheduler jobs handle background automations (child promotions, reminders,
license health checks). The backend is packaged as a uvicorn application managed
by a systemd service (`salitemihret-backend` in staging/prod,
`salitemihret-dev-backend` on the integration host). Nginx fronts the API and
serves the built SPA from `/var/www/salitemihret`, proxying `/api` to the uvicorn
process on `127.0.0.1:8000`.

### Repository Layout
- `server/` – FastAPI app, SQLAlchemy models, Alembic migrations, APScheduler jobs
- `frontend/` – React + Vite client (TanStack Query, Tailwind, shadcn/ui)
- `docs/`, `specs/` – Spec-Kit source, progress logs, QA guides
- `apps/` – Archived Frappe code kept only for historical reference (do not edit)

## Front-End Architecture
- **Framework**: React 18 with TypeScript 5, bundled via Vite for fast dev loops.
- **Styling**: Tailwind CSS tokens layered with shadcn/ui primitives; the
  Neo-Lumina palette lives in `frontend/src/styles/theme.ts`.
- **State/Data**: TanStack Query handles server state (members, sponsorships,
  payments, media, councils) with suspenseful loading and retry logic. Form
  schemas use Zod mirrored from the FastAPI Pydantic models.
- **Routing**: React Router (data routers) with nested layouts for the global
  shell, module spaces, and drawer-based detail panes.
- **Internationalization**: i18next with English/Amharic namespaces; locale
  switching aligns with each member’s `preferred_language`.
- **Motion**: Framer Motion drives drawer/dial transitions and respects reduced
  motion settings.
- **Error & Telemetry**: Sentry browser SDK sends exception traces plus the
  backend `trace_id` for correlation.

## Back-End Architecture
- **Framework**: FastAPI + uvicorn with typed routers under `server/app/routers`.
- **Database**: PostgreSQL 15 (SQLAlchemy models in `server/app/models`). Alembic
  migrations live under `server/alembic/versions`.
- **Auth**: JWT (`/auth/login`) backed by `users` + `roles` tables. FastAPI
  dependencies enforce personas (`require_roles`).
- **Services**: Modules for members, sponsorships, newcomers, priests, payments,
  children promotion, and licensing. Shared helpers live under `app/services`.
- **Background Jobs**: APScheduler in-process jobs kick off child promotion
  digests and finance reminders on startup (falls back to a no-op scheduler if
  APScheduler isn’t installed).
- **Static & Uploads**: `uploads/` directory mounted under `/static` for avatar
  and CSV artifacts. Object storage integration (MinIO/S3) is provided via the
  upload adapters in `app/services/files`.
- **Observability**: Structured JSON logging via `logging.config`, trace IDs on
  every response header, and optional OpenTelemetry capture.

## API Surface
All endpoints live under `/api` on Nginx and `/` on uvicorn. Key routes:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Returns JWT (`access_token`) for subsequent Bearer auth. |
| GET | `/auth/whoami` | Current user profile + role list. |
| GET/POST/PUT | `/members` | List/create/update members with filter, pagination, chip inputs. |
| GET | `/members/{id}` | Detailed member profile with household + finance context. |
| POST | `/members/{id}/archive` | Soft-delete member (Admin/PR only). |
| POST | `/members/{id}/contributions` | Append contribution payment history. |
| GET/POST | `/members/import/*` | Upload/preview/import CSVs (streaming responses). |
| GET/POST | `/members/files/*` | Avatar upload + download (signed URLs). |
| GET/POST | `/sponsorships` | Manage sponsorship pledges, reminders, beneficiary links. |
| GET/POST | `/newcomers` | Intake pipeline and conversion to members. |
| GET/POST | `/priests` | Father confessor directory powering controlled selects. |
| GET | `/children/eligible` | Child promotion feed powering daily notifications. |
| GET/POST | `/payments` | Member contribution ledger + exports. |
| GET | `/license/status` | System license check consumed by the middleware guard. |

Swagger/OpenAPI docs are auto-generated at `/docs` and `/openapi.json`.

## Authentication & Authorization
- **Login**: `POST /auth/login` accepts email/password, validates via Passlib,
  and returns a short-lived JWT signed with `settings.JWT_SECRET`.
- **Session Handling**: Frontend stores the token in memory/localStorage and
  sends `Authorization: Bearer <token>` on every request.
- **Roles**: `users_roles` join table; tokens embed `roles` claim. Dependency
  `require_roles` enforces endpoints at runtime.
- **2FA**: Planned TOTP enforcement for Finance/Admin personas (tracked in
  roadmap).
- **License Gate**: Middleware checks the local license file and blocks requests
  until activation completes (`/license/activate`).

## Infrastructure & Runtime
- **Reverse Proxy**: Nginx terminates TLS, serves the built SPA, and proxies
  `/api` to uvicorn on localhost port 8000.
- **Systemd Service**: `salitemihret-backend.service` activates the FastAPI app
  inside `/opt/salitemihret/app/server/.venv` with `uvicorn app.main:app`.
  Local parity uses `salitemihret-dev-backend`. Restart commands are documented
  in `docs/deploy-pipeline.md`.
- **Databases**: PostgreSQL runs as a managed service (RDS / self-hosted). Local
  dev uses `postgresql://postgres:postgres@localhost:5432/saliteone`.
- **Caches & Queues**: Redis optional; currently used for rate-limits and future
  background workers (flagged in roadmap).
- **File Storage**: Uploads stored on disk plus optional MinIO/S3 sync for
  backups/export artifacts.
- **Secrets**: Managed through `.env` locally and systemd EnvironmentFiles in
  staging/prod. GitHub Actions inject secrets during CI deploy stages.

## Environments
| Environment | Purpose | Data | Deployment |
|-------------|---------|------|------------|
| Local | Developer sandbox (`make dev`, Vite `pnpm dev`). | Demo seed + sanitized fixtures. | Run uvicorn locally or reuse the dev systemd service. |
| Integration (dev host) | Always-on shared environment mirroring prod topology. | Demo dataset w/ scrubbed PII. | GitHub Actions deploy to `salitemihret-dev-backend` + Nginx. |
| Staging | Client-visible QA + UAT. | Nightly anonymized snapshot from prod. | GitHub Actions -> SSH runner, Alembic upgrade, systemd restart. |
| Production | Live system for parish operations. | Authoritative records. | Manual approval in pipeline, zero-downtime Alembic migration, rolling restart. |

## Dependencies & Integrations
- SMTP relay for notifications (SES/Postfix depending on env).
- Sentry (frontend + backend) for error telemetry.
- Let's Encrypt ACME for TLS certificates, auto-renewed via cron/systemd timers.
- Optional MinIO/S3 for CSV exports, avatars, and audit evidence.
- APScheduler + cron for recurring membership reminders and data hygiene.

## Deployment Workflow
1. CI (GitHub Actions) runs `pnpm test`, `pnpm build`, `pytest`, and `alembic upgrade --sql` dry runs.
2. On success, artifacts are pushed; server deploy runs `git pull`, `pip install -r requirements.txt`, `alembic upgrade head`, and rebuilds the frontend.
3. Restart systemd service: `sudo systemctl restart salitemihret-backend`.
4. Rsync the Vite build to `/var/www/salitemihret/` and reload Nginx.
5. Run smoke tests (`/health`, `/auth/login`, `/members?page=1`) and UI spot checks.

## Disaster Recovery & Backups
- PostgreSQL uses daily base backups + WAL archiving (RPO ≤ 1 hour).
- Uploaded files synced nightly to object storage (versioned bucket, 30-day retention).
- Environment secrets stored in Bitwarden vault + infra repo (Ansible Vault) for recovery.
- Runbooks define RTO ≤ 4 hours. Quarterly DR drills cover DB restore, Alembic
  replays, and service reconfiguration.
