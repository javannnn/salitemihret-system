# Operations and Backups

## Backup Strategy
- **PostgreSQL**: Nightly `pg_basebackup` at 02:00 UTC stored in S3 (server-side
  encryption, lifecycle 35 days). WAL archiving every 5 minutes enables
  point-in-time recovery (RPO ≤ 1 hour).
- **Uploads / Exports**: Avatar files, import templates, and CSV exports synced
  nightly to S3/MinIO with versioning. Retention: 30 days (daily), 90 days
  (weekly), 1 year (monthly snapshots).
- **Redis (optional)**: Hourly RDB snapshots copied to object storage when Redis
  is enabled.
- **Configuration**: systemd unit files, Nginx configs, and `.env` templates
  kept in the infra repo and mirrored to `/etc/salitemihret/backup.tgz` daily.

## Restoration Procedures
1. Trigger the restore runbook via the incident tool; assign Database Lead.
2. Provision clean Postgres instance; restore the latest base backup.
3. Replay WAL segments up to the target timestamp (RPO target 60 minutes).
4. Restore `/var/www/salitemihret/uploads` from the matching snapshot; verify
  checksums.
5. Redeploy backend: `git checkout <tag>`, `pip install -r requirements.txt`,
  `alembic upgrade head`, `sudo systemctl restart salitemihret-backend`.
6. Rebuild frontend assets (`pnpm build`, rsync to `/var/www/salitemihret/`,
  reload Nginx).
7. Run smoke tests (login, member search, status approval, payment entry, media
  feed) before reopening access.

## Drill Cadence
- Quarterly DR drill restoring staging from a production snapshot. Record
  metrics: total restore time (<4 hours), data loss window (<1 hour), blockers.
- After every drill, update the runbook and backlog any automation gaps.

## Runbooks
- **Import Failure**: Inspect APScheduler logs, re-run `members.import_members`
  with captured CSV, notify PR if requeueing.
- **Status Suggestion Alerts**: Validate streak calculation job health, review
  `member_audit` entries, confirm notifications delivered.
- **Child Turns 18**: Check `child_promotion` job schedule, inspect pending
  queue, ensure emails sent.
- **Payment Correction**: Confirm paired payment rows, verify audit entries, and
  reconcile the payments export.
- **Media Publication**: Validate request status, generated public post, and CDN
  invalidation log.
- Runbooks live under `docs/runbooks/` and are linked from the admin UI help
  modals.

## Disaster Recovery Targets
- **RTO**: 4 hours for API + frontend + database.
- **RPO**: 1 hour (dictated by WAL archiving cadence).
- **Restore Order**: PostgreSQL → Redis (if enabled) → FastAPI backend →
  Frontend → Nginx → Background schedulers → Observability agents.

## Operational Monitoring
- Daily cron verifies backup artifacts (size delta within ±10%, checksum) and
  posts status to the ops channel.
- Alerts trigger if a backup misses two consecutive runs or WAL shipping lags >
  30 minutes.
- Monthly ops review summarizes backup success rates, restore drills, and
  outstanding remediation tasks.
