# Module Spec — Volunteers

## Overview
- Manage volunteer groups, rosters, service logs, and inactivity monitoring. *(BRD §Volunteers)*
- Surface dashboards for coordinators highlighting service gaps and upcoming events. *(BRD §Dashboards)*

## Data Model
- Volunteer entity links member to volunteer-specific attributes (skills, availability). *(BRD §Volunteer Data)*
- Group entity: name, coordinator, schedule, roster membership. *(BRD §Groups)*
- Service log: volunteer_id, service_type, hours, verification_status. *(BRD §Service Logs)*
- Inactivity tracker stores last service date, threshold, escalation status. *(BRD §Inactivity)*

## Business Rules
- Coordinators may manage groups they own; Volunteer Coordinator sees all. *(BRD §Permissions)*
- Service logs require verification within 7 days; unverified flagged for review. *(BRD §Service Logs)*
- Inactivity job flags volunteers approaching threshold and emails coordinator. *(BRD §Inactivity)*
- Volunteers linked to members must be active; archived members unavailable. *(BRD §Volunteer Data)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/volunteers` | List volunteers with filters | VolunteerCoordinator |
| POST | `/volunteers` | Register volunteer profile | VolunteerCoordinator |
| GET | `/volunteers/{id}` | Detail view | VolunteerCoordinator, Coordinator |
| PUT | `/volunteers/{id}` | Update profile | VolunteerCoordinator |
| POST | `/volunteers/{id}/service-logs` | Record service | Coordinator |
| GET | `/volunteer-groups` | Manage groups/rosters | VolunteerCoordinator |

## UAT Checklist
1. Volunteer Coordinator registers member as volunteer, assigns to group. *(BRD §Volunteer Data)*  
2. Coordinator logs service and verifies within 7 days. *(BRD §Service Logs)*  
3. Inactivity job notifies coordinator for volunteer approaching threshold. *(BRD §Inactivity)*  
4. Archived member cannot be assigned as volunteer. *(BRD §Volunteer Data)*  
5. Dashboard filters by group and shows hours totals. *(BRD §Dashboards)*
