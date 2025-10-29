# Media Module

## Purpose
Manage storytelling and announcement workflows from internal request intake to
curated publication on the public website feed.

## Roles & Permissions
- **Media Coordinator**: Create requests, edit content, approve or reject.
- **PR Administrator**: Co-review high-impact content, view analytics.
- **Council Secretary**: Read-only oversight for governance.

## Fields & Data Model
| Field | Source | Notes |
|-------|--------|-------|
| Media Request | `Media Request` DocType | Title, ministry area, status, assets.
| Public Post | `Public Post` DocType | Generated upon approval with slug, body, language.
| Audit Links | `Audit Event` | Tracks approval and publication actions.

## User Flows
1. **List → Drawer → Actions**
   - Request list filtered by status and ministry area.
   - Drawer tabs: Summary, Assets, Approval History, Linked Public Post.
   - Actions: Edit draft, Submit for review, Approve, Reject, Publish now.
2. **Approval Flow**
   - Approver reviews content, attaches editorial notes, selects publish date.
   - On approval, system creates `Public Post`, notifies PR/admin, and logs audit
     events for both approval and publication.
3. **Asset Management**
   - File uploader enforces allowed types (jpg, png, mp4). Files stored in S3 and
     referenced via signed URLs.

## API Endpoints
- `GET/POST/PUT /api/resource/Media Request`
- `GET/POST/PUT /api/resource/Public Post`
- `GET /api/method/salitemiret.api.media.public_feed`

## Validation Rules
- Publication requires title in both English and Amharic.
- Hero image required for high-visibility categories (PR, Outreach).
- Cannot approve if due date is past without override reason.

## Notifications
- Slack/email alert to PR admins when new request submitted.
- Approval notification includes preview link and scheduled publish date.
- Public post publication triggers webhook to invalidate website CDN.

## Reports & Exports
- **Editorial Calendar**: CSV of upcoming publish dates, ministry, status.
- **Content Performance**: Pulls analytics metrics once available (placeholder
  integration to website stats).

## Edge Cases
- Rejection returns request to Draft with reason logged.
- Rescheduling after publication updates `published_on` and logs audit event.
- Deleting public post requires Council approval; retains audit trail.

## Acceptance Criteria (Spec IDs)
- `MED-AC-01`: Approving media request creates Public Post automatically and
  appears in public feed within 60 seconds.
- `MED-AC-02`: Rejected request logs audit entry and surfaces reason to requester.
- `MED-AC-03`: Editorial calendar export reflects current status filters.

## Tests
- Backend tests for approval service, public post creation, and audit logging.
- Frontend tests for drawer interactions, bilingual validation, and feed preview.
- Integration test covering end-to-end request → post flow.

## Security & Audit
- Assets stored with signed URLs; only authorized roles can download drafts.
- Approval and publication actions emit `Audit Event` types `Media Approved` and
  `Media Published` with trace IDs.
- Public feed method read-only and rate-limited to prevent abuse.

## Implementation Plan
- **Day 8**: Finalize DocTypes (`apps/salitemiret/doctype/media_request/`,
  `public_post/`) with workflow states and validation hooks for bilingual fields.
- **Day 8**: Implement media APIs in `apps/salitemiret/api/media.py`, including
  approval logic, public feed response, and CDN invalidation integration under
  `apps/salitemiret/integrations/cdn.py`.
- **Day 8**: Build React media board, approval drawer, and public feed preview in
  `frontend/src/features/media/`, ensuring audit trail visibility and Amharic
  copy entry.
