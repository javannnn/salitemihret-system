# Module Spec — Types of Services

## Overview
- Catalogue service categories (tithe, contribution, sponsorship, school fees, volunteer hours) for consistent reporting. *(BRD §Service Types)*
- Provide configurable metadata (frequency, default amounts, GL codes) consumed across modules. *(BRD §Finance Integration)*

## Data Model
- ServiceType entity stores name, description, category (financial/non-financial), active flag. *(BRD §Service Types)*
- Financial services include accounting hooks (GL account, taxability). *(BRD §Finance Integration)*  
- Linking tables connect service types to members, households, or events as applicable. *(BRD §Service Associations)*

## Business Rules
- Names must be unique, lowercase slug auto-generated for API usage. *(BRD §Service Governance)*
- Deactivating a service prevents new assignments but retains history. *(BRD §Service Lifecycle)*
- Finance Admin owns financial types; Volunteer Coordinator owns volunteer services. *(BRD §Ownership)*
- Changes require justification comment stored with audit metadata. *(BRD §Audit)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/service-types` | List configurable services | FinanceAdmin, SponsorshipCommittee, VolunteerCoordinator |
| POST | `/service-types` | Create service type | FinanceAdmin (financial), VolunteerCoordinator (volunteer) |
| PUT | `/service-types/{id}` | Update metadata | Owner role |
| DELETE | `/service-types/{id}` | Soft deactivate service | Owner role |

## UAT Checklist
1. Finance Admin creates “Monthly Tithe” with GL code; payments module references it during ledger entry. *(BRD §Finance Integration)*  
2. Volunteer Coordinator adds “Choir Practice” service; volunteer dashboard surfaces new type. *(BRD §Volunteer Services)*  
3. Deactivated service no longer appears in member contribution form. *(BRD §Service Lifecycle)*  
4. Audit log lists editor, timestamp, and comment for every change. *(BRD §Audit)*  
5. API prevents duplicate slugs, returning validation error. *(BRD §Service Governance)*
