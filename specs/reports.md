# Module Spec — Reporting & Analytics

## Overview
- Deliver cross-module dashboards (membership, payments, sponsorships, schools, volunteers, councils) with scheduling and exports. *(BRD §Reports)*
- Provide governance-ready summaries with drill-down into underlying records. *(BRD §Analytics)*

## Data Model
- ReportDefinition entity stores query, filters, schedule, audience. *(BRD §Reports Data)*
- ReportRun stores generated output metadata (timestamp, status, artifact path). *(BRD §Report Runs)*
- Subscription table links users to scheduled reports with delivery preferences. *(BRD §Scheduling)*

## Business Rules
- Reports reference read-only replica schema; heavy queries run asynchronously. *(BRD §Performance)*
- Scheduled reports support email + dashboard delivery; failures alert ops inbox. *(BRD §Scheduling)*
- Governance reports must include audit trace IDs for underlying actions. *(BRD §Governance)*
- Export formats: CSV, XLSX, PDF snapshots, respecting localisation. *(BRD §Exports)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/reports` | List definitions, filter by module | SystemOperator, CouncilSecretary |
| POST | `/reports` | Create report definition | SystemOperator |
| POST | `/reports/{id}/run` | Trigger on-demand run | SystemOperator |
| GET | `/reports/runs/{run_id}` | Fetch report artifact/status | Authorised subscribers |
| POST | `/reports/{id}/subscribe` | Manage subscriptions | SystemOperator |

## UAT Checklist
1. System Operator creates Membership Active Roster report; run completes under 60 s. *(BRD §Reports)*  
2. Scheduled run emails Finance Admin weekly summary with attachment. *(BRD §Scheduling)*  
3. Failed run alerts ops channel with stack trace link. *(BRD §Scheduling)*  
4. Governance report includes audit trace IDs. *(BRD §Governance)*  
5. Report exports respect localisation toggles (EN/Am). *(BRD §Exports)*
