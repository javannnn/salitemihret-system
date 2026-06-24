# Production Environment Document

Document status: Production reference without secrets  
Version: 1.0

## Security Notice
Do not store passwords, private keys, API tokens, database credentials, license private keys, or SMTP credentials in this document. Store secrets only in the approved secure vault.

## Production Environment
| Item | Value |
| --- | --- |
| Application domain | TBD |
| Public website domain | TBD |
| API base URL | TBD |
| Hosting provider | TBD |
| Server name/IP | TBD |
| Operating system | TBD |
| Backend runtime | Python / FastAPI |
| Frontend runtime | Static React/Vite build served by web server |
| Database | TBD |
| SSL certificate provider | TBD |
| Email provider | TBD |
| Backup storage | TBD |
| Monitoring/logging provider | TBD |

## Environment Variables
Record variable names only, not values.

| Variable | Purpose | Stored In |
| --- | --- | --- |
| DATABASE_URL | Database connection | Secure vault / server environment |
| SECRET_KEY | Application signing secret | Secure vault / server environment |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token lifetime | Server environment |
| SMTP_* | Email delivery | Secure vault / server environment |
| LICENSE_* | License validation | Secure vault / server environment |
| CORS_ORIGINS | Allowed frontend origins | Server environment |

## Backup Plan
| Backup Type | Frequency | Retention | Storage | Owner |
| --- | --- | --- | --- | --- |
| Database | Daily minimum | TBD | Encrypted storage | TBD |
| Uploaded files | Daily minimum | TBD | Encrypted storage | TBD |
| Application configuration | On change | TBD | Secure repository/vault | TBD |

## Monitoring and Logging
| Area | Required Monitoring |
| --- | --- |
| Application | Error rate, response time, uptime |
| Server | CPU, memory, disk, network |
| Database | Connections, query latency, disk usage |
| Security | Failed login attempts, elevated-role actions |
| Backups | Success/failure alerts |

## Contacts
| Responsibility | Contact |
| --- | --- |
| Client system owner | TBD |
| Technical administrator | TBD |
| Hosting provider support | TBD |
| Delivery/support contact | TBD |
