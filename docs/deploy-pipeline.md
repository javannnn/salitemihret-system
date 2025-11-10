# Deployment Pipeline – SaliteMihret Demo/Staging

This document defines the exact workflow for taking a feature from local development to the client’s staging server. Follow these steps every time—no ad‑hoc pushes.

---

## 1. Start From the Correct Branch

```bash
cd ~/projects/salitemihret-system
git switch deploy/stmary-staging
git pull
```

Optional clean branch:

```bash
git switch -c feature/membership-tweak-001
```

Build the feature there, then merge back into `deploy/stmary-staging` when ready.

---

## 2. Backend (Local Parity With Client)

Systemd service already configured locally:

```bash
sudo systemctl status salitemihret-dev-backend --no-pager
```

If inactive:

```bash
sudo systemctl restart salitemihret-dev-backend
curl -s http://127.0.0.1:8000/health  # expect {"status":"ok"}
```

Use the same API base (`http://127.0.0.1:8000`) for local tests.

---

## 3. Frontend Development

### Hot Reload Mode

```bash
cd ~/projects/salitemihret-system/frontend
echo 'VITE_API_BASE=http://localhost:8000' > .env.local
pnpm install
pnpm dev   # visit http://localhost:5173/
```

### Client-Parity Check (Nginx + /api proxy)

```bash
echo 'VITE_API_BASE=/api' > .env.production
pnpm build
sudo rsync -a dist/ /var/www/salitemihret-dev/
sudo systemctl reload nginx
```

Open the site via your local Nginx endpoint (e.g. `http://localhost/` or assigned IP) to ensure `/api` → `127.0.0.1:8000` works like the client server.

---

## 4. Database Changes (Mandatory Flow)

If you modify models/schemas:

```bash
cd ~/projects/salitemihret-system/server
source .venv/bin/activate
export PYTHONPATH=$(pwd)
alembic revision -m "describe_the_change" --autogenerate
alembic upgrade head
```

Commit the migration and related model/router updates. If migrations fail locally, stop—do **not** deploy.

---

## 5. Commit & Push (Local Repo)

```bash
git status
git add .
git commit -m "Feature: membership XYZ improvements"
# if using feature branch:
git switch deploy/stmary-staging
git merge feature/membership-tweak-001
git push origin deploy/stmary-staging
```

---

## 6. Deploy to Client Server (stmary@…)

```bash
ssh stmary@CLIENT_HOST
cd /opt/salitemihret/app
sudo -u salitemihret -H git pull
```

### Backend

```bash
cd /opt/salitemihret/app/server
sudo -u salitemihret -H bash -lc 'source .venv/bin/activate && pip install -r requirements.txt && alembic upgrade head'
sudo systemctl restart salitemihret-backend
sudo systemctl status salitemihret-backend --no-pager
```

### Frontend

```bash
cd /opt/salitemihret/app/frontend
sudo -u salitemihret -H pnpm install
sudo -u salitemihret -H pnpm build
sudo rsync -a /opt/salitemihret/app/frontend/dist/ /var/www/salitemihret/
sudo systemctl reload nginx
```

### Smoke Tests

```bash
curl -s http://127.0.0.1:8000/health
curl -I http://10.0.0.5/
curl -I http://10.0.0.5/api/health
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/auth/login -H "Content-Type: application/json" -d '{"email":"finance@example.com","password":"Demo123!"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/payments?page=1" | head -c 200
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/payments/export.csv?status=Pending" | head -n 2
```

Open the site in a browser, log in as `superadmin@example.com / Demo123!` (and as `finance@example.com / Demo123!`), then verify:

- Members list (filters, actions dropdown, quick-add modal)
- Payments ledger (summary cards, export report button, record/correction dialog, Office Admin read-only banner)

---

## 7. Summary Loop

1. `deploy/stmary-staging` → optional feature branch.
2. Backend service on port 8000 (systemd) mirrors client.
3. Frontend dev via Vite; parity check with Nginx proxy.
4. Migrations via Alembic (always run locally first).
5. Commit & push.
6. On client box: `git pull`, pip install, Alembic upgrade, restart backend, build frontend, rsync, reload Nginx.
7. Smoke tests (health endpoints + UI login).

Follow this pipeline every time—no manual shortcuts.
