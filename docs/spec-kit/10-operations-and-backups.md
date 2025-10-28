# Operations and Backups

## Backup Strategy
- **Database**: Nightly full MariaDB dumps at 02:00 UTC stored in S3 with server-
  side encryption. Hourly binlog shipping enables point-in-time recovery.
- **File Storage**: Media uploads and exported CSVs synced nightly to S3 bucket
  with versioning enabled. Retain 30-day history.
- **Redis**: Hourly snapshots persisted to disk and copied to S3.
- **Configuration**: Docker Compose environment files and Nginx configs stored in
  private Git repository with GitOps workflows.

## Restoration Procedures
1. Trigger restore runbook in incident management tool.
2. Provision fresh database instance; import latest full dump.
3. Replay binlogs up to target timestamp (RPO 1 hour).
4. Restore file storage from S3 version matching timestamp.
5. Reconfigure Frappe site to point to restored database, flush cache, run `bench
   migrate`.
6. Validate critical workflows (login, member search, status approval, payment
   entry, media feed) before reopening access.

## Drill Cadence
- Quarterly restore drills into staging using production snapshot.
- Document metrics: time to restore (target < 4 hours), data loss (<= 1 hour),
  and blockers encountered.
- Post-drill retro updates runbook and backlog items.

## Runbooks
- **Import Failure**: Steps to inspect job queue, download error CSV, requeue.
- **Status Suggestion Alerts**: Validate streak calculation job, confirm PR
  notifications delivered.
- **Child Turns 18 Notification**: Ensure scheduler job (`child_adulthood_job`)
  ran; review audit events.
- **Payment Correction**: Verify original and correction records, confirm audit
  entries, and reconcile financial report.
- **Media Publication**: Check media request status, generated public post, and
  CDN invalidation.
- Runbooks stored in `docs/runbooks/` and referenced inside application tooltips.

## Disaster Recovery Targets
- **RTO**: 4 hours for critical services.
- **RPO**: 1 hour, driven by binlog shipping and Redis snapshots.
- **Service Prioritization**: Restore order – Database, Redis, Backend, Frontend,
  Background Workers, Nginx, Observability exporters.

## Operational Monitoring
- Weekly ops review ensures backup jobs succeed (check S3 logs, retention).
- Alert if backups fail twice consecutively or deviation from expected size >10%.
- Publish monthly operations report summarizing backup success rates and restore
  drill outcomes.
