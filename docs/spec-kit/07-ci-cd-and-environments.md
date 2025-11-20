# CI/CD and Environments

## Repository Structure
```
/
├── server/                 # FastAPI app, SQLAlchemy models, Alembic migrations
├── frontend/               # React + Vite client
├── docs/, specs/           # Product documentation & progress logs
├── scripts/                # Deployment helpers
└── apps/                   # Legacy Frappe artifacts (archived, read-only)
```
Commits must keep both the backend (`server/`) and frontend (`frontend/`)
buildable. Shared DTOs are defined in Pydantic schemas and mirrored in
TypeScript via handcrafted types.

## Git Workflow
- Default branch: `deploy/stmary-staging` (mirrors client integration branch).
- Feature branches follow `/speckit` naming (`###-short-description`).
- Conventional Commits drive changelog entries and release tags.
- Pull requests require passing CI, reviewer sign-off, and constitution checklist
  confirmation.

## GitHub Actions Pipeline
1. **Lint & Test**: `pnpm lint`, `pnpm test`, `pytest`, and `ruff check`.
2. **Build Artifacts**: `pnpm build` (Vite) and `uv pip install -r requirements.txt`
   followed by `pytest --maxfail=1`. Alembic `upgrade --sql` dry run validates
   migrations. Produces Docker images for backend/frontend when requested.
3. **Security Scans**: `npm audit --production`, `pip-audit`, Trivy on the built
   backend image.
4. **Coverage Upload**: Reports to Codecov.
5. **Deploy Staging**: Tags `staging-*` trigger SSH deploy to the integration
   host. Workflow runs Alembic, restarts `salitemihret-dev-backend`, builds the
   frontend, and reloads Nginx.
6. **Deploy Production**: Tags `prod-*` require manual approval + release notes.
   After Alembic + frontend build succeed, the workflow restarts
   `salitemihret-backend` and pushes static assets.

## Secrets Management
- GitHub environment secrets store `DATABASE_URL`, `JWT_SECRET`, `SMTP_*`,
  `SENTRY_DSN`, license keys, and MinIO credentials.
- Self-hosted environments store secrets in systemd EnvironmentFiles owned by
  the `salitemihret` user.
- Secrets rotate quarterly or immediately after security events; versions
  tracked in the ops runbook.

## Environment Configuration
| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `DATABASE_URL` | `postgresql+psycopg2://postgres:postgres@localhost:5432/saliteone` | Managed Postgres (stg) | Managed Postgres (prod) |
| `JWT_SECRET` | `.env` file | systemd env file | systemd env file |
| `VITE_API_BASE` | `http://localhost:8000` (dev) | `/api` | `/api` |
| `SENTRY_DSN` | optional | staging DSN | production DSN |
| `SMTP_HOST` | mailhog | SES sandbox | SES production |
| `REDIS_URL` | optional | redis://stg | redis://prod |
| `LICENSE_KEY_PATH` | local `runtime/license.json` | `/etc/salitemihret/license.json` | same |

## Deployment Process
1. Create tag (`staging-YYYYMMDD` or `prod-YYYYMMDD`).
2. GitHub Actions builds, runs tests, and, on success, SSHes into the target
   host.
3. On the host:
   - `git pull`
   - `pip install -r server/requirements.txt`
   - `cd server && alembic upgrade head`
   - `sudo systemctl restart salitemihret-backend` (or `-dev-` for staging)
   - `cd frontend && pnpm install && pnpm build`
   - `sudo rsync -a frontend/dist/ /var/www/salitemihret/ && sudo systemctl reload nginx`
4. Run smoke tests (`/health`, `/auth/login`, `/members?page=1`).
5. Post results to release channel with trace IDs and coverage links.

## Rollback Strategy
- Previous backend/frontend builds are retained (Docker tags + git tags). To
  rollback, checkout last known good tag, rerun Alembic downgrade (if safe), and
  restart the service.
- PostgreSQL PITR: hourly WAL archiving with 7-day retention; nightly full
  snapshots kept 30 days.
- Frontend assets versioned via release directory names; symlink switch reverts
  instantly.

## Backups and Disaster Recovery
- **Database**: `pg_basebackup` nightly + WAL archiving. Restores rehearsed
  quarterly onto staging with validation of login, import, and payments flows.
- **Uploads**: Nightly rsync to object storage (versioned bucket).
- **Config**: systemd unit files and Nginx configs stored in infra repo and
  mirrored to /etc/backup.

## Monitoring Deployment Health
- Automated checklist verifies: healthy `/health`, zero critical Sentry alerts,
  APScheduler running, import wizard smoke test success, and queue depth < 10.
- GitHub Actions posts deployment metadata (commit SHA, migration list, systemd
  status) to the PR or release issue for traceability.
