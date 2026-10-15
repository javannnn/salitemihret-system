# salitemihret-system Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-29

## Active Technologies
- **Backend**: Python 3.11, FastAPI (uvicorn), SQLAlchemy ORM, Alembic migrations, APScheduler jobs, Postgres 15, Redis (optional for caching), S3/MinIO storage (001-core-plan)
- **Frontend**: TypeScript 5.x, React 18 with Vite, TanStack Query, Tailwind CSS, shadcn/ui, i18next, Framer Motion (001-core-plan)
- **Infra**: systemd-managed FastAPI service (`salitemihret-backend`/`salitemihret-dev-backend`), Nginx reverse proxy, GitHub Actions CI, Sentry telemetry (001-core-plan)
- **Legacy**: `apps/` holds historical Frappe artifacts for traceability only—do not modify for active work.

## Project Structure

```text
apps/                        # Archived Frappe code (read-only reference)
docs/, specs/                # Product plans, specs, QA guides
frontend/                    # React + Vite client
server/                      # FastAPI + SQLAlchemy backend
scripts/, deployment assets  # Ops helpers, CI glue
```

## Commands

- Backend dev server: `cd server && make dev` (uvicorn `app.main:app` on http://localhost:8001)
- Seed demo data: `cd server && make seed`
- Reset DB + migrations: `cd server && make resetdb && alembic upgrade head`
- Frontend dev: `cd frontend && pnpm install && pnpm dev`
- System service check: `sudo systemctl status salitemihret-backend` (staging/prod) or `salitemihret-dev-backend` (local parity)

## Code Style

: Follow standard conventions

## Recent Changes
- 001-core-plan: Completed FastAPI + Postgres pivot (backend now lives under `server/` with Alembic/SQLAlchemy stack).
- 001-auth-rbac-baseline: Updated JWT auth + role enforcement via FastAPI dependencies; React client consumes Bearer tokens.
- 001-core-plan: Documented systemd + Nginx deployment workflow for the FastAPI service and Vite build artifacts.


<!-- MANUAL ADDITIONS START -->
## Current Windows development workflow

- This folder is the usable Windows checkout of `javannnn/salitemihret-system`.
  Base new work on `origin/main`; `deploy/stmary-staging` and GitHub's current
  default `001-auth-rbac-baseline` are older. Use `codex/` feature branches.
- Read `docs/deploy-pipeline.md` before deployment work. It records verified
  status and the remaining activation steps; do not claim automation is live
  until an end-to-end deployment passes on the droplet.
- `scripts/dev.ps1 setup` installs dependencies, `frontend` starts Vite,
  `backend` starts FastAPI (requires local PostgreSQL/server/.env), and `check`
  builds the frontend and runs the full isolated backend test suite.
- Use Python 3.11/3.12 and pnpm 10.15.1. The system pnpm/Corepack combination
  currently fails; the helper invokes the pinned pnpm through npx.
- Production host supplied by the user: `deploy@178.128.225.48`
  (`Sealitemariyam`). Verify live paths/config before modifying it. Never
  overwrite production uploads, licenses, environment files, or uncommitted work.
- CI is `.github/workflows/ci.yml`; automatic release deployment is
  `.github/workflows/deploy.yml` and `scripts/deploy-release.sh`. Deployment is
  intentionally disabled until server provisioning and GitHub secrets are done.
<!-- MANUAL ADDITIONS END -->
