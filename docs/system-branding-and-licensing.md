# Branding & Licensing Controls

This deployment carries two cross-cutting controls that should be reviewed before every release.

## 1. Persistent “Beta” Tag

- The React shell renders a professional badge via `frontend/src/components/BetaTag.tsx`.  
- It is driven by Vite env vars (set them before `pnpm build`):

  ```bash
  # .env.local or export before pnpm build
  VITE_SHOW_BETA_TAG=true        # set to false to hide immediately
  VITE_BETA_LABEL="Beta"
  VITE_BETA_MESSAGE="Preview build • Feedback welcome"
  ```

- The badge appears in the sidebar and sticky header so users always know they are on a preview build. Toggle `VITE_SHOW_BETA_TAG=false` and rebuild to remove it.

## 2. Time‑bound Licensing

- The backend enforces licensing through `app/core/license.py`. Without a license token the system falls back to a 365‑day trial that starts the first time the API runs (tracked in `server/runtime/license_state.json`).
- When the trial or license expires every API call (except `/health`, `/auth/login`, and `/license/*`) returns `403` with `code=license_inactive`, and the UI surfaces a blocking banner.
- The active license token is stored in `server/runtime/license.key` (preferred). You can also inject via `LICENSE_TOKEN` env var for immutable deployments.
- Health endpoints:
  - `GET /license/status` – returns `state`, `message`, `expires_at`, `days_remaining`, and `customer`.
  - `POST /license/activate` – Admin‑only; persist a new token after validating its signature/expiry.
- Admins can open **Install license** from the header banner in the web app, paste the token, and activate it; the API writes `license.key`.

### Generating a License (internal use only)

1. Generate or reuse the RSA key pair. The public key lives in the repo at `server/app/core/license_public_key.pem`. Keep the private key outside of the repo (e.g. `security/license_private.pem`):

   ```bash
   openssl genrsa -out /secure/location/license_private.pem 2048
   openssl rsa -in /secure/location/license_private.pem -pubout > server/app/core/license_public_key.pem
   ```

2. Run the signing script with the private key to mint a token (example shown from the repo root):

   ```bash
   cd server
   source .venv/bin/activate
   python -m app.scripts.generate_license \
     --customer "Se'alite Mihret St. Mary" \
     --license-id "LIC-2025-0001" \
     --days 365 \
     --private-key /secure/location/license_private.pem
   ```

   The script prints a JWT‑style token; deliver it securely to the deployment target.

3. Install the token either via the UI (Admin banner → Install license) or via API:

   ```bash
   curl -X POST http://127.0.0.1:8000/license/activate \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"token":"<PASTE TOKEN HERE>"}'
   ```

4. Verify with `curl http://127.0.0.1:8000/license/status` or the dashboard banner.

> **Reminder:** Never commit the private key or raw license tokens. Keep them in a secure secrets store. Developers only need the public key that is already part of the repo.
