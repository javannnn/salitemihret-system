# System Administration Guide

Document status: Technical operations guide  
Version: 1.0

## Daily Checks
- Confirm application is reachable.
- Confirm login works for an admin account.
- Review error logs.
- Review failed login or suspicious access patterns.
- Confirm scheduled backup completed.
- Confirm available disk space.

## Weekly Checks
- Review active users and suspended accounts.
- Review open support tickets.
- Review performance and error trends.
- Confirm report generation behavior.
- Confirm email delivery health.

## User and Role Administration
Use Super Admin access to:

- Create users.
- Update roles.
- Suspend departing users immediately.
- Review role changes.
- Keep access aligned with parish responsibilities.

## Backup Administration
Backups must include:

- Database.
- Uploaded files and attachments.
- Production configuration names and deployment references.

Backups must be encrypted and stored in the approved backup location. Restore tests should be scheduled periodically.

## Monitoring
Monitor:

- Backend service uptime.
- Frontend availability.
- Database availability.
- API response time.
- Error rate.
- Disk, memory, CPU.
- Backup success/failure.

## Troubleshooting
| Symptom | First Checks |
| --- | --- |
| User cannot log in | Account active, password reset, role assignment, session status |
| Module missing | Role module visibility and permissions |
| Payment cannot save | Required fields, member status, service type, permissions |
| Report fails | Filters, data volume, backend logs |
| Email not sent | Email provider status, configuration, logs |
| Website unavailable | DNS, SSL, hosting, web server status |

## Security Administration
- Keep secrets in the secure vault.
- Rotate secrets according to policy.
- Review elevated-role access monthly.
- Disable unused accounts.
- Keep server and dependencies patched.
