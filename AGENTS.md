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
<!-- MANUAL ADDITIONS END -->
