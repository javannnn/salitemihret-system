# Development and automatic deployment

## Verified setup (2026-10-15)

Repository: `javannnn/salitemihret-system`. Default and deployment branch: `main`. Work in this Windows checkout on `codex/` feature branches. The older `deploy/stmary-staging` and `001-auth-rbac-baseline` branches are historical.

The production release layout and GitHub production environment are configured. See [GitHub Actions](https://github.com/javannnn/salitemihret-system/actions) and [production deployments](https://github.com/javannnn/salitemihret-system/deployments/activity_log?environments_filter=production) for the latest deployment result. A successful build alone does not establish a successful production deployment.

## Work from this chat or PowerShell

This folder is a real checkout with a working `.venv`; editing, frontend builds, and backend tests work without terminal Codex or WSL.

```powershell
# First setup: use Python 3.11 or 3.12. Existing .venv is reused.
./scripts/dev.ps1 setup -Python 'C:/path/to/python.exe'
./scripts/dev.ps1 check
./scripts/dev.ps1 frontend
# Separate session, after configuring local PostgreSQL:
./scripts/dev.ps1 backend
```

The helper uses pinned pnpm 10.15.1 through npx. Vite runs on localhost:5173 and targets FastAPI on localhost:8001. Tests use an isolated SQLite database and a fresh temporary directory per run. Configure local DATABASE_URL and a unique JWT_SECRET in ignored `server/.env` before starting the backend; apply migrations from `server/` with `../.venv/Scripts/python.exe -m alembic upgrade head`. Local PostgreSQL is not provisioned; production must never be used for local development.

## Daily pipeline

1. Edit here, run `./scripts/dev.ps1 check`, commit, and push a `codex/` branch.
2. Open a PR into `main`. CI builds the frontend, runs 176 backend tests and seven Linux release/recovery tests, and validates the entire migration chain against PostgreSQL 15.
3. Merge after checks pass. The resulting `main` commit runs the same checks.
4. After success, Deploy production packages that exact commit, transfers it over verified SSH, installs a separate backend virtual environment, backs up PostgreSQL, applies migrations, atomically switches the release, restarts the service, and checks internal/public health.
5. Read Actions and the production environment for the result and deployed SHA. No manual per-release script is needed.

Deployments are serialized, running deployments are not cancelled, PRs cannot deploy, and obsolete queued commits are refused. Repository variable `AUTO_DEPLOY_ENABLED=false` disables future deployments (it does not interrupt an active deployment). Set it to true to enable them.

## Production facts

- Host: `178.128.225.48`, hostname `Sealitemariyam`; public site: `http://178.128.225.48`.
- Administrator access from this workstation: `ssh deploy@178.128.225.48` using the existing Windows key.
- GitHub deploys as `salitemihret` using a separate restricted SSH key. Its sudo access is limited to Nginx validation, backend restart, and Nginx reload. Never put private keys or application secrets in the repository.
- Backend: `salitemihret-backend.service`, Python 3.12, four uvicorn workers bound to `127.0.0.1:8000`.
- Database: PostgreSQL 16. CI additionally checks PostgreSQL 15 compatibility.
- `/opt/salitemihret/current`: active release symlink.
- `/opt/salitemihret/releases`: separate code, virtual environment, and frontend builds per deployment; `baseline-20261015` preserves the original app/web layout for recovery.
- `/opt/salitemihret/shared/server.env`: private production environment.
- `shared/uploads` and `shared/runtime`: symlinks to the original uploads and license/runtime directories under `/opt/salitemihret/app/server`, preserving live state and ownership.
- `shared/static`: persistent static directory; `shared/backups`: private pre-migration database dumps.
- `/etc/salitemihret/deploy.conf`: root-owned deployment configuration; `/etc/sudoers.d/salitemihret-releases`: limited service permissions.
- `/etc/systemd/system/salitemihret-backend.service.d/automatic-releases.conf`: service override pointing to current/server.
- `/etc/nginx/sites-available/salitemihret`: frontend root current/frontend/dist, existing API proxy and upload alias preserved.

The original app is a copied deployment, not a Git checkout. Its backend matched GitHub main before pipeline changes; its frontend source was older. Preserve it as a recovery source. The recent UAT removal has been reapplied and committed in the Windows checkout.

## GitHub configuration

The production environment permits only branch main. Environment variables: DEPLOY_HOST=178.128.225.48, DEPLOY_USER=salitemihret, DEPLOY_PORT=22. Environment secrets: DEPLOY_SSH_KEY (dedicated CI key) and DEPLOY_KNOWN_HOSTS (verified droplet host key). AUTO_DEPLOY_ENABLED is a repository variable. Application/database/mail/license secrets stay on the server.

`.github/workflows/ci.yml` runs checks. `.github/workflows/deploy.yml` reacts only to successful push checks on main. `scripts/deploy-release.sh` performs the release switch and recovery; `scripts/backup-database.py` backs up without printing credentials. This is automatic script execution by CI, replacing the former operator-led deployment commands.

## Validation and recovery

Windows frontend build and 176 backend tests pass. Linux CI tests backup/migration/install failures, corrupted uploads, unprovisioned hosts, successful switching, and failed-health recovery. The full PostgreSQL migration chain passes after repairing missing enum labels, duplicate audit-table creation, and legacy enrollment assumptions. Existing databases past those historical revisions do not rerun them.

Before activation, the production database was dumped, restored into `salitemihret_pipeline_validation_20261015`, upgraded, and used for application-startup/health/auth checks with scheduled jobs and external integrations disabled. Member count was preserved. The temporary validation database and release are removed after deployment verification; the private recovery backup is retained.

The initial full recovery snapshot is `/var/backups/salitemihret/pipeline-20261015T101234Z` (app, web assets, original service/Nginx config, verified PostgreSQL dump). The original source, uploads, license files, and web assets remain at their previous locations.

A failed install, backup, or migration leaves the active application link unchanged. After activation, restart or health-check failure restores the previous application release and restarts it. Database changes are never automatically reversed or restored; future migrations must remain compatible with the previous release. Failed/previous releases and dumps are retained for inspection; configure retention separately.

To investigate, use `readlink -f /opt/salitemihret/current`, `cat /opt/salitemihret/shared/deployed-revision`, service status/journal, and Actions logs. Do not restore a database or delete live state as a routine application rollback.

