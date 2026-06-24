# Technical Documentation

Document status: Technical handover summary  
Version: 1.0

## Architecture Overview
The SaliteMihret System uses a frontend/backend architecture:

- Frontend: React, TypeScript, Vite, Tailwind, protected routes, role-aware navigation.
- Backend: FastAPI, SQLAlchemy models, Alembic migrations, Pydantic schemas, modular routers/services.
- Database: Relational database with module-specific tables for members, payments, sponsorships, newcomers, schools, volunteers, parish councils, users, roles, audit, and reports.
- Authentication: Token-based authentication with protected API dependencies and role checks.
- Authorization: Role and module-permission model with Super Admin controls.

## Frontend Structure
| Path | Purpose |
| --- | --- |
| `frontend/src/App.tsx` | Route definitions |
| `frontend/src/layouts/AppShell.tsx` | Authenticated shell, sidebar, top bar |
| `frontend/src/pages/` | Module pages |
| `frontend/src/hooks/usePermissions.ts` | Client-side permission helpers |
| `frontend/src/lib/api.ts` | API client |
| `frontend/src/context/` | Auth, theme, chat, tour context |

## Backend Structure
| Path | Purpose |
| --- | --- |
| `server/app/main.py` | FastAPI app setup and router registration |
| `server/app/routers/` | API endpoints by module |
| `server/app/services/` | Business logic and workflow services |
| `server/app/models/` | SQLAlchemy data models |
| `server/app/schemas/` | Pydantic request/response schemas |
| `server/alembic/` | Database migrations |
| `server/tests/` | Automated backend tests |

## Key API Areas
| Area | Router |
| --- | --- |
| Authentication | `auth.py`, `whoami.py`, `account.py` |
| Users and Roles | `users.py`, `roles.py`, `staff.py` |
| Members | `members.py`, `members_bulk.py`, `members_files.py`, `households.py` |
| Payments | `payments.py` |
| Sponsorships | `sponsorships.py` |
| Newcomers | `newcomers.py` |
| Schools | `schools.py`, `sunday_school.py`, `children.py` |
| Volunteers | `volunteers.py` |
| Parish Councils | `parish_councils.py` |
| Reports | `reports.py` |
| Email and Notifications | `emails.py`, notification services |
| License | `license.py` |

## Data Model Summary
| Module | Key Models |
| --- | --- |
| Users/Roles | `User`, `Role`, user-role relationship, audit records |
| Membership | `Member`, `Household`, `MemberAudit`, ministries, tags, priests |
| Payments | `Payment`, `PaymentDayLock`, contribution/payment records |
| Sponsorship | `Sponsorship`, `SponsorshipBudgetRound`, `SponsorshipNote`, `SponsorshipStatusAudit` |
| Newcomers | `Newcomer`, newcomer tracking/link records |
| Schools | School and Sunday School enrollment/attendance models |
| Volunteers | `VolunteerGroup`, `VolunteerWorker` |
| Parish Councils | Council departments, assignments, documents, audit events |
| Chat/AI | Chat and AI-related support models |

## Environment Variables
Environment variables are documented by name in the production environment document. Values must remain in the secure vault.

## Build and Deploy Process
Use the deployment plan for production. At a high level:

1. Install dependencies.
2. Run tests.
3. Apply migrations.
4. Build frontend.
5. Deploy backend and frontend.
6. Validate routes, API health, reports, permissions, email, backups, and public website.

## Testing
Run backend tests before releases. Frontend should be validated through build checks and role-based browser testing.
