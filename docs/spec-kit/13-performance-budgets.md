# Performance Budgets

## Web Experience
- Admin dashboard time-to-interactive (desktop broadband): ≤ 2.5 seconds.
- Admin dashboard time-to-interactive (simulated 3G): ≤ 4.0 seconds.
- Route transitions within app: ≤ 300ms perceived duration (Framer Motion).
- Drawer open/close animation: ≤ 200ms.
- API-driven table refresh (TanStack Query): ≤ 500ms p95.

## API Latency Targets (p95)
| Endpoint | Budget |
|----------|--------|
| GET /api/resource/Member | 350 ms |
| POST /api/resource/Member | 400 ms |
| POST members.import_members (enqueue) | 250 ms |
| GET members.status_suggestions | 300 ms |
| POST members.approve_status | 350 ms |
| POST /api/resource/Payment | 400 ms |
| POST /api/resource/Media Request | 400 ms |
| GET media.public_feed | 200 ms |

## Background Jobs
- Member import (5,000 rows): ≤ 15 minutes total processing time.
- Status suggestion batch (overnight): ≤ 10 minutes for full membership set.
- Child-turns-18 notification job: ≤ 2 minutes, executed hourly.
- Media approval to public post publication: ≤ 60 seconds.

## Data Import Throughput
- Upload step: ≤ 30 seconds for 10 MB XLSX.
- Validation preview: ≤ 90 seconds for 5,000 rows.
- Error CSV generation: available within 2 minutes of job completion.

## Reporting & Exports
- Finance monthly export (CSV): ≤ 2 minutes.
- Volunteer service log export (CSV): ≤ 90 seconds.
- Media activity report: ≤ 60 seconds.

## Observability
- Log ingestion latency: ≤ 5 seconds.
- Metric scrape interval: 15 seconds; dashboards refresh ≤ 30 seconds.

## System Capacity Targets
- Concurrent admin users supported: 150 active sessions without breaching
  latency budgets.
- Redis queue depth: ≤ 100 pending jobs under peak load.
- Database CPU utilization: < 70% sustained during import operations.
