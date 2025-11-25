# reCAPTCHA Setup

Login now enforces Google reCAPTCHA v3 when keys are provided.

## Configure
1) Frontend: copy `frontend/.env.example` → `frontend/.env.local` (or `.env`) and set:
```
VITE_RECAPTCHA_SITE_KEY=your_site_key
```
2) Backend: copy `server/.env.example` → `server/.env` and set:
```
RECAPTCHA_SECRET=your_secret
RECAPTCHA_MIN_SCORE=0.5
```

## Notes
- Missing keys: login UI will show “reCAPTCHA not configured”; backend skips verification.
- With keys set, login rejects missing/failed tokens and low scores (< `RECAPTCHA_MIN_SCORE`).
- Ensure outbound HTTPS to `www.google.com/recaptcha/api/siteverify` from the backend host.
