# Module Spec — User Management

## Overview
- Provide administrators with tools to manage staff accounts, roles, and access levels. *(BRD §User Management)*
- Centralise persona assignments (Office Admin, Public Relations, Finance Admin, etc.) with auditable changes. *(BRD §Roles & Personas)*

## Data Model
- User entity stores email, full name, active flag, locale, and audit timestamps. *(BRD §User Records)*
- Role entity enumerates personas; many-to-many association between users and roles. *(BRD §Role Matrix)*
- Password history tracked for policy enforcement and breach review. *(BRD §Security Policies)*

## Business Rules
- Password policy: minimum length, mixed-case, numeric, rotated every 90 days. *(BRD §Security Policies)*
- Role assignment logged with actor, target, timestamp, and justification. *(BRD §Governance)*
- Users disabled (not deleted) to preserve audit links; login blocked immediately. *(BRD §User Lifecycle)*
- MFA optional at go-live, required in Phase 2; enrollment status tracked per user. *(BRD §MFA)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/users` | List users with role filters | SuperAdmin |
| POST | `/users` | Invite/create user with roles | SuperAdmin |
| GET | `/users/{id}` | Retrieve user detail | SuperAdmin |
| PUT | `/users/{id}` | Update profile, roles, status | SuperAdmin |
| POST | `/users/{id}/reset-password` | Trigger reset email/token | SuperAdmin |

## UAT Checklist
1. Super Admin creates new user, assigns multiple roles, and receives audit entry. *(BRD §User Onboarding)*  
2. Role change notification emailed to governance inbox. *(BRD §Governance Notifications)*  
3. Disabled user cannot log in; whoami endpoint returns 401. *(BRD §User Lifecycle)*  
4. MFA enrollment flow records status and backup codes. *(BRD §MFA)*  
5. Password reset token invalidates after single use or 30 minutes. *(BRD §Security Policies)*
