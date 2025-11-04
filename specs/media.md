# Module Spec — Media Requests & Approvals

## Overview
- Manage media requests from ministries, route approvals to Kahen/Media Admin, and publish to public feed. *(BRD §Media)*
- Support attachments, review workflow, and automatic publication after approval. *(BRD §Media Workflow)*

## Data Model
- MediaRequest entity: title, description, requester, due_date, attachments, status. *(BRD §Media Data)*
- Approval record logs approver, decision, comments, timestamps. *(BRD §Approvals)*
- PublicPost entity references approved request with publish_at and channels. *(BRD §Public Feed)*

## Business Rules
- Requests default to Pending; only Media Admin can approve/reject. *(BRD §Media Workflow)*
- Approval triggers creation/update of PublicPost within 60 seconds. *(BRD §Public Feed)*
- Rejected requests require comment; requester notified via email. *(BRD §Notifications)*
- Sensitive attachments stored in S3 with signed URLs and expiry. *(BRD §Security)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/media/requests` | List requests with status filters | MediaAdmin, OfficeAdmin (RO) |
| POST | `/media/requests` | Submit request with attachments | Authenticated Staff |
| GET | `/media/requests/{id}` | View request detail | MediaAdmin, requester |
| POST | `/media/requests/{id}/approve` | Approve request → publish | MediaAdmin |
| POST | `/media/requests/{id}/reject` | Reject request with reason | MediaAdmin |
| GET | `/media/public-feed` | Public feed endpoint | Public |

## UAT Checklist
1. Staff submits request with attachment; Media Admin sees in queue. *(BRD §Media Data)*  
2. Approval creates PublicPost and logs audit event within 60 seconds. *(BRD §Public Feed)*  
3. Rejection requires comment; requester receives notification. *(BRD §Notifications)*  
4. Public feed returns approved items sorted by publish date. *(BRD §Public Feed)*  
5. Attachment URLs expire after configured duration. *(BRD §Security)*
