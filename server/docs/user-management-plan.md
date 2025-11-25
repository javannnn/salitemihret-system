# User Management Revamp Plan

_Last updated: 2025-11-21_

## Objectives

1. Treat login identities (Users) as a first-class, audited resource distinct from Members.
2. Restrict account provisioning, activation, roles, and member linking to Super Admins.
3. Provide an invite-only onboarding experience (no password sharing), with strong username/password policies.
4. Maintain an explicit 1:1 optional bridge between `User` and `Member`, with approval workflows and audit logs.
5. Deliver SaaS-grade UI/UX for Super Admins (user list/detail) and normal users (self-service “My Account”).
6. Keep rollback simple via feature flags and isolated routes.

## Scope

### Backend
- **Schema updates** (Alembic `a4c1aa1c1234`):
  - `users`: add `username`, `is_super_admin`, timestamps, last-login tracking, username cooldown.
  - `user_invitations`: store invite metadata, token hash, roles snapshot, optional member link.
  - `user_member_links`: enforce 1:1 optional mapping between user and member with status + audit metadata.
  - `user_audit_logs`: capture every security-sensitive action.
- **Services/APIs** (shipped):
  - Invitation endpoints (`POST /users/invitations`, `POST /auth/invitations/{token}`) with hashed tokens + expiry.
  - User CRUD + audit feed (`GET/POST/PATCH /users/...`) gated by Super Admin, with aggregate stats + member search helper.
  - Member link approval + unlink endpoints (super-admin + self-service request flow).
  - Profile endpoints for username/password updates and member link requests under `/account`, plus `/account/me/member-search` for staff self-service lookups (name/email/phone) before submitting a link request.
- **Security**:
  - Username regex `^[a-z0-9._]{4,32}$`, change cooldown (configurable).
  - Password policy (min length, complexity).
  - Audit logging, with future MFA placeholder.

### Frontend
- Super Admin “User Management” area (list metrics/filters, invite wizard w/ member search, sticky detail view w/ status/role/member link controls + audit feed).
- “My Account” for all users (profile, security, member link request with live lookup + contextual notes).
- Toasts + inline note copy for every action.
- Navigation gating via `is_super_admin`.

## Architecture Overview

| Model | Purpose |
|-------|---------|
| `User` | Login identity (email, username, flags, timestamps). |
| `Role` / `user_roles` | Existing role matrix (Admin, FinanceAdmin, etc.). |
| `UserInvitation` | Tracks invite token lifecycle. |
| `UserMemberLink` | Maintains `User` ↔ `Member` mapping (linked/pending/rejected). |
| `UserAuditLog` | Historical ledger of user management actions. |

## Milestones

1. ✅ Planning + schema design (`docs/user-management-plan.md`).
2. ✅ Schema migration + ORM/Pydantic updates (username, new tables, enriched `/auth/whoami`).
3. ✅ Build invitation + user CRUD services (with email placeholders, audit logging).
4. ✅ Implement member link approval/request APIs.
5. ✅ Frontend Super Admin workspace + invite wizard.
6. ✅ Frontend self-service “My Account”.
7. ☐ QA pass + documentation updates.

## Rollback Strategy

- All changes are isolated behind Alembic migration `a4c1aa1c1234`. To rollback schema, downgrade this revision (drops new tables/columns).
- Feature-flag new routes/UI (e.g., `USER_MGMT_V2_ENABLED` in config). Disable the flag to hide the new experience without touching data.
- Invitations live in `user_invitations`. Purging rows invalidates outstanding invites.
- `/auth/whoami` now returns `username` + `is_super_admin`. If backend is reverted, ensure frontend falls back to assuming `user` = email.
