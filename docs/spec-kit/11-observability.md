# Observability

## Logging
- **Format**: JSON lines with fields `timestamp`, `level`, `trace_id`, `span_id`,
  `user`, `doctype`, `action`, `message`, `duration_ms`.
- **Frontend**: Logs significant UI events (import submission, status approval,
  media publication) via `console.info` interceptor that forwards to backend via
  `/api/method/salitemiret.api.telemetry.log_frontend_event`.
- **Backend**: Python logger configured with structlog; writes to stdout and
  includes request metadata.
- **Trace Correlation**: Every API response returns `trace_id` header; frontend
  stores and reuses for subsequent related calls.

## Metrics
Collected via Prometheus exporters integrated with Frappe and custom scripts.
- `http_request_duration_seconds{endpoint=...}` – REST latency. Budget: p95 <
  0.4 seconds for standard endpoints.
- `import_job_duration_seconds` – histograms per batch size.
- `status_suggestion_processed_total` – counter of automated suggestions.
- `media_publication_latency_seconds` – time between approval and public post.
- `background_queue_depth` – gauge from Redis queue.

Dashboards in Grafana for operations, PR engagement, finance reconciliation, and
media throughput.

## Tracing
- OpenTelemetry instrumentation on Frappe WSGI app. Traces exported to Sentry
  Performance with 20% sampling for low-volume operations, 100% for imports and
  payment corrections.
- `trace_id` passed through TanStack Query via `x-trace-id` header.

## Sentry Integration
- Frontend and backend DSNs configured; release names use `salitemihret@<tag>`.
- Alert rules: new issue frequency >5 in 10 minutes, import job failures, media
  publication errors.
- Breadcrumbs enriched with user role and DocType context (subject to privacy
  rules).

## Health Checks
- `GET /api/method/salitemiret.api.healthz` returns `{ "status": "ok" }` and
  verifies DB and Redis connectivity.
- Nginx upstream checks monitor backend container health.

## Alerting
- Prometheus Alertmanager routes alerts to on-call Slack channel and SMS backup.
- Critical alerts: database connectivity loss, queue depth > 200, import failure
  rate > 10% in 1 hour, media publication job failure.
- Warning alerts: high latency (p95 > 0.6s for 5 minutes), Sentry release
  regression, missing nightly backup.

## Log Retention
- Application logs stored 30 days in Loki, exported to S3 glacier for 400-day
  retention.
- Audit events retained indefinitely within application database.

## Observability Onboarding Checklist
- Ensure every new endpoint adds trace instrumentation and structured logs.
- Update Grafana dashboards when introducing new business metrics.
- Add runbook links to alert descriptions.
