# CI/CD and Environments

## Repository Structure
```
/
├── apps/
│   └── salitemiret/        # Frappe app
├── frontend/               # React + Vite client
├── ops/
│   ├── docker/             # Compose definitions and overrides
│   └── github/             # GitHub Actions workflows
└── docs/spec-kit/          # Product documentation
```
Monorepo commits must maintain buildability for both frontend and backend. Shared
TypeScript types generated from DocType schemas live under `frontend/src/types/`.

## Git Workflow
- Default branch: `master`.
- Feature branches follow `/speckit` generated naming `###-short-name`.
- Conventional Commits enforce change typing and drive automatic changelog.
- Pull requests require successful CI, code review, and constitution compliance
  checks.

## GitHub Actions Pipeline
1. **Lint & Test**: Runs ESLint, Stylelint, Pytest, and Vitest. Checks formatting
   with Prettier and Black.
2. **Build Artifacts**: Builds Vite bundle and Frappe assets. Generates Docker
   images tagged with commit SHA.
3. **Security Scans**: Trivy scan for container images, npm audit, pip audit.
4. **Upload Coverage**: Reports to code coverage service.
5. **Deploy Staging**: Triggered on tags `staging-*`. Uses GitHub Environments
   with required approvers.
6. **Deploy Production**: Triggered on tags `prod-*` after manual approval,
   change log review, and backup confirmation.

## Secrets Management
- GitHub environment secrets store database credentials, SMTP, Sentry DSNs,
  encryption keys.
- Secrets injected as environment variables during workflows and never committed
  to repo.
- Rotate secrets quarterly or when incidents occur.

## Environment Configuration
| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `NODE_ENV` | development | production | production |
| `FRAPPE_SITE_NAME` | salitemihret.local | salitemihret-stg | salitemihret-prod |
| `SITE_PROTOCOL` | http | https | https |
| `SENTRY_DSN` | placeholder | staging DSN | production DSN |
| `SMTP_HOST` | mailhog | SES endpoint | SES endpoint |
| `REDIS_URL` | redis://redis:6379 | managed Redis | managed Redis |

## Deployment Process
1. Create tag (`staging-YYYYMMDD` or `prod-YYYYMMDD`).
2. GitHub Actions builds and pushes images to GHCR.
3. Workflow updates Docker Compose files in target environment repository and
   triggers watchtower/ansible deployment.
4. Post-deploy hooks run migrations (`bench migrate`), clear cache, restart
   workers, and warm caches.
5. Cypress smoke tests run against deployed environment.
6. Notify stakeholders via Slack/email with release notes.

## Rollback Strategy
- Maintain previous image tags; rollback by redeploying last known good tag.
- Database backups (nightly full, hourly binlogs) allow PITR. Rollback steps in
  runbook ensure schema compatibility.
- Frontend static assets versioned; revert by switching CDN alias.

## Backups and Disaster Recovery
- **Database**: Nightly full backup stored in S3 (encrypted). Hourly binlogs
  retained for 30 days.
- **Files**: Uploaded media synced nightly to S3 with versioning.
- **Redis**: Snapshot hourly.
- **Restore Drills**: Quarterly rehearsals restore staging from production backup
  and validate login, import, and dashboard flows.

## Monitoring Deployment Health
- Post-deployment checklist verifies:
  - No failing Sentry alerts related to release.
  - Background job queue depth < 50 after 10 minutes.
  - Import pipeline smoke test completes successfully.
  - Public feed returns expected records.
- GitHub Actions posts metrics summary to PR for audit trail.
