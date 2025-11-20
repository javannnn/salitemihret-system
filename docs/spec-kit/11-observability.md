# Observability

## Logging
- **Format**: JSON lines with `timestamp`, `level`, `trace_id`, `user_id`,
  `endpoint`, `action`, `duration_ms`, `role`. FastAPI middleware attaches the
  trace ID to the response header and logger context.
- **Frontend**: Significant UI events (import submission, sponsorship reminder,
  payment correction) flow through the shared telemetry helper and are POSTed to
  `/telemetry/events`.
- **Backend**: Standard `logging` configured via `logging.config.dictConfig`
  writes to stdout/systemd. ASGI lifespan middleware captures request start/end
  with timing information.
- **Trace Correlation**: `trace_id` header returned on every API response; React
  stores it in TanStack Query cache and forwards it on related calls via
  `x-trace-id`.

## Metrics
Prometheus scrapes exporters running beside the FastAPI service.
- `http_request_duration_seconds{route="/members"}` – REST latency (budget:
  p95 < 400 ms).
- `import_job_duration_seconds` – histogram, bucketed by row count.
- `status_suggestion_processed_total` – counter incremented when the promotion
  job evaluates rules.
- `media_publication_latency_seconds` – approval-to-publish delay.
- `background_scheduler_last_run_timestamp` – gauge verifying APScheduler runs.

Grafana dashboards cover operations, finance, PR engagement, and media
throughput.

## Tracing
- OpenTelemetry ASGI instrumentation wraps FastAPI. Spans exported to Sentry
  Performance (20 % sample overall, 100 % for imports/payment corrections).
- `trace_id` is written to logs and OTLP spans, enabling log ↔ trace joins.

## Sentry Integration
- Backend DSN configured via `SENTRY_DSN` env var; frontend DSN set in Vite env.
- Release names follow `salitemihret@<git-tag>#<commit-sha>`.
- Alert rules: 5+ login failures/minute, unhandled exceptions in imports,
  payment correction errors, and spike in 5xx responses.
- Breadcrumbs include role/persona (where privacy permits) and key identifiers
  like `member_id`.

## Health Checks
- `GET /health` executes a lightweight DB query plus APScheduler status check.
- Nginx upstreams configured with passive health checks; systemd restarts the
  service on repeated failures.

## Alerting
- Prometheus Alertmanager routes incidents to the on-call Slack channel and SMS
  backup.
- Critical alerts: PostgreSQL unreachable, scheduler idle > 10 minutes,
  `/members` latency p95 > 800 ms for 5 minutes, import failure ratio > 15%, or
  nightly backup failure.
- Warning alerts: Sentry regression spikes, high queue depth (>50), low disk on
  uploads volume (<15%).

## Log Retention
- Application logs kept 30 days in Loki; archived to S3 Glacier for 400-day
  compliance.
- `member_audit`/`audit_events` retained indefinitely.

## Observability Onboarding Checklist
- Instrument every new endpoint with structured logging + trace spans.
- Add Prometheus metrics for new background jobs and dashboards for new KPIs.
- Link alerts to the correct runbook in `docs/runbooks/`.
