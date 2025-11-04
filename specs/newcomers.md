# Module Spec — Newcomers

## Overview
- Capture newcomer intake records, track welcome follow-ups, and support conversion to members. *(BRD §Newcomers)*
- Coordinate pastoral assignments and reminder digests for unresolved newcomers. *(BRD §Follow-up)*

## Data Model
- Newcomer entity: name, contact info, origin parish, visit_date, assigned_staff, status. *(BRD §Newcomer Data)*
- Follow-up notes table stores dated comments, next action, owner. *(BRD §Follow-up)*
- Conversion link references resulting Member record when created. *(BRD §Conversion)*

## Business Rules
- Intake form mandatory fields: name, contact channel, visit date, language preference. *(BRD §Newcomer Data)*
- Reminder digest emailed weekly to Sponsorship Committee until status = Converted/Closed. *(BRD §Follow-up)*
- Conversion flow creates member (or links existing) and archives newcomer record. *(BRD §Conversion)*
- Sensitive notes restricted to PR Admin + Sponsorship Committee. *(BRD §Permissions)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/newcomers` | List newcomers with status filters | PublicRelations, SponsorshipCommittee |
| POST | `/newcomers` | Add newcomer intake | PublicRelations |
| GET | `/newcomers/{id}` | Detail view | PublicRelations, SponsorshipCommittee |
| PUT | `/newcomers/{id}` | Update status/notes | PublicRelations |
| POST | `/newcomers/{id}/convert` | Convert to member | PublicRelations |

## UAT Checklist
1. Intake captures newcomer and schedules first follow-up. *(BRD §Newcomer Data)*  
2. Weekly digest email lists pending newcomers with next actions. *(BRD §Follow-up)*  
3. Conversion creates linked Member record and marks newcomer Converted. *(BRD §Conversion)*  
4. Permissions prevent Office Admin from editing sensitive notes. *(BRD §Permissions)*  
5. API returns validation error when required fields missing. *(BRD §Newcomer Data)*
