# Development and automatic deployment

## Current status (2026-10-15)

The Windows project folder is now a real checkout of `javannnn/salitemihret-system`, based on `main` (August 2026), on feature branch `codex/automatic-deployment`. The older `deploy/stmary-staging` branch ends in December 2025. GitHub's default branch is still the much older `001-auth-rbac-baseline`; change it to `main` during activation so `workflow_run` can trigger production deployment.

The workflows and release tooling are prepared. **Production automation is not activated or verified yet.** SSH to `deploy@178.128.225.48` currently rejects this Windows key. Computer Use reports that product policy blocks Termius. No production files, services, database, or GitHub secrets have been changed.

## Work from this chat or PowerShell

Open this project folder in Codex and work on a `codex/` feature branch. No terminal Codex session or functioning WSL installation is required for editing, frontend builds, or backend tests.

```powershell
# First setup: use Python 3.11 or 3.12. Existing .venv is reused.
./scripts/dev.ps1 setup -Python 'C:/path/to/python.exe'
./scripts/dev.ps1 check
./scripts/dev.ps1 frontend
# In a separate session, after configuring a local PostgreSQL database:
./scripts/dev.ps1 backend
```

The helper uses the project's pinned pnpm 10.15.1 through npx. The frontend runs on localhost:5173 and targets the backend on localhost:8001. Backend tests use an isolated SQLite database and a new local temporary directory for each run. `server/.env` is ignored by Git; set local `DATABASE_URL` and a unique `JWT_SECRET` there before running the backend. Apply migrations to that local database with `.venv/Scripts/python.exe -m alembic upgrade head` from `server/`. Do not use the production database for local work. Docker and WSL are currently unavailable and local PostgreSQL has not been provisioned.

## Intended daily pipeline

1. Edit in this checkout, run `./scripts/dev.ps1 check`, commit and push a feature branch.
2. Open a PR into `main`. GitHub Actions builds the frontend, runs backend tests, and tests the release switch and rollback logic on Linux.
3. Merge into `main`. The same checks run on the resulting commit.
4. After all checks pass, Deploy production builds and transfers that exact commit, backs up PostgreSQL, applies migrations, switches the current release, restarts the backend, and verifies internal/public health endpoints.
5. See the production environment and Actions logs for the result and deployed commit. No operator needs to run the old deployment script for each release.

Production jobs are serialized and running deployments are not cancelled. Pull requests and feature branches cannot deploy. An older queued commit is refused if `main` has advanced. GitHub's default branch must contain both workflow files for the workflow_run trigger to operate.

## One-time activation: inspect first

After SSH access is available, inspect the existing deployment script, repository/commit (including uncommitted changes), service unit, Nginx site, domain, environment locations, uploads, license files, Python version, database, backups, and sudo permissions. Reconcile the recent uncommitted UAT removal from the original Linux checkout before treating this Windows checkout as authoritative. Preserve the original app and take backups. The paths below are proposed from the repository documentation, not verified droplet facts.

Prepare `/opt/salitemihret/releases`, `/opt/salitemihret/shared`, and `/opt/salitemihret/current` (a symlink to an initial release). Preserve production state in shared locations:

- `shared/server.env`: the existing backend environment file, readable only by the deployment/service accounts.
- `shared/uploads`, `shared/runtime`, `shared/static`: existing uploads, license/runtime state, and static assets. Copy without losing ownership or permissions; check record counts and license state.
- `shared/backups`: private PostgreSQL custom-format dumps. Configure retention and test restore separately; deployment never deletes them.

Configure the existing service to use WorkingDirectory `/opt/salitemihret/current/server` and ExecStart `/opt/salitemihret/current/server/.venv/bin/uvicorn ...` with the existing bind address, arguments, user, environment, and hardening preserved. Configure Nginx root `/opt/salitemihret/current/frontend/dist`, preserving the existing API proxy, upload locations, TLS, and domain. The service user must be able to traverse/read the release directories and write shared state.

Install a root-owned `/etc/salitemihret/deploy.conf` using `scripts/deploy.conf.example`; verify all paths and URLs, then set `PROVISIONED=yes`. The deployment account needs write access to release/current/shared paths, Python with venv, matching PostgreSQL client tools (`pg_dump`), curl, tar, flock, and limited noninteractive sudo for `nginx -t`, backend restart, and Nginx reload. Do not grant blanket passwordless sudo.

Use a separate SSH key for GitHub Actions; do not reuse the Windows user's private key. Add its public key to the deployment account, without agent/port/X11 forwarding or a PTY. Configure the GitHub `production` environment, restrict it to `main`, and add:

| Setting | Type | Value |
|---|---|---|
| DEPLOY_HOST | environment variable | 178.128.225.48 (verify) |
| DEPLOY_USER | environment variable | deploy (verify) |
| DEPLOY_PORT | environment variable | 22 (verify) |
| DEPLOY_SSH_KEY | environment secret | dedicated CI private key |
| DEPLOY_KNOWN_HOSTS | environment secret | verified droplet host key entry |
| AUTO_DEPLOY_ENABLED | repository variable | true, only after provisioning/testing |

Change GitHub's default branch to `main`, merge the workflow changes, then enable AUTO_DEPLOY_ENABLED and push the first reviewed production commit. Keep branch protection and passing Build and test jobs required before merging. A required environment reviewer would pause each deployment; omit that gate if fully automatic deployment is desired.

## Failure and recovery

A failed install, backup, or migration leaves the current application symlink in place. After activation, restart or health-check failures restore the preceding application release and restart it. Database migrations are not automatically reversed or restored: changes must remain compatible with the previous release. Failed/previous releases and database dumps are retained for inspection. The existing application remains the recovery source during the first migration to this release layout.

Before switching production to the new layout, test it against a restored/scrubbed database, verify a new release, deliberately test a failed health check, and verify recovery. A successful local build does not establish production deployment success.
