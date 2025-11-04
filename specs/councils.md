# Module Spec — Councils & Governance

## Overview
- Track council departments, trainee mentorship history, and governance reporting. *(BRD §Councils)*
- Provide quarterly dashboards summarising trainee status and departmental updates. *(BRD §Reports)*

## Data Model
- Council entity: name, description, term_dates, lead. *(BRD §Council Data)*
- Trainee record: member_id, council_id, mentor_id, start/end, status. *(BRD §Trainees)*
- Meeting minutes table with agenda, decisions, follow-ups. *(BRD §Meetings)*

## Business Rules
- Trainees limited to one active council at a time; overlaps raise validation error. *(BRD §Trainees Rules)*
- Term change requires closing outstanding follow-ups. *(BRD §Governance)*
- Meeting minutes visible to Council Secretary + System Operator; exportable PDF. *(BRD §Permissions)*
- Quarterly report auto-generates metrics: active trainees, pending actions, audit highlights. *(BRD §Reports)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/councils` | List councils | CouncilSecretary, SystemOperator |
| POST | `/councils` | Create council | CouncilSecretary |
| GET | `/councils/{id}` | Detail view | CouncilSecretary |
| PUT | `/councils/{id}` | Update council/terms | CouncilSecretary |
| GET | `/councils/{id}/trainees` | Manage trainees | CouncilSecretary |
| POST | `/councils/{id}/reports/quarterly` | Generate quarterly report | CouncilSecretary |

## UAT Checklist
1. Council Secretary creates new council and adds trainees with mentor. *(BRD §Councils)*  
2. Validation prevents trainee overlap across councils. *(BRD §Trainees Rules)*  
3. Quarterly report summarises metrics and exports PDF. *(BRD §Reports)*  
4. Meeting minutes accessible only to authorised roles. *(BRD §Permissions)*  
5. Term closure requires completing outstanding follow-ups. *(BRD §Governance)*
