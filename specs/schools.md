# Module Spec — Schools & Sunday School

## Overview
- Manage Sunday School enrollment, lesson assignments, promotions, and fee reminders. *(BRD §Schools)*
- Provide cohort dashboards for attendance and mezmur/lesson completion. *(BRD §Dashboards)*

## Data Model
- Enrollment entity: member_id, class_level, academic_year, fee_plan, status. *(BRD §Enrollment Data)*
- Attendance records store session date, presence, notes. *(BRD §Attendance)*
- Lesson plan table tracks assigned mezmur/material per cohort. *(BRD §Lesson Plans)*

## Business Rules
- Enrollment requires active member and unique per academic year/class. *(BRD §Enrollment Rules)*
- Monthly fee reminders auto-send via preferred channel until paid. *(BRD §Fee Reminders)*
- Promotion requires completion of required lessons and coordinator approval. *(BRD §Promotion)*
- Coordinators limited to their cohorts; School Admin sees all. *(BRD §Permissions)*

## API Contract (MVP)
| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/schools/enrollments` | List enrollments with filters | SchoolAdmin |
| POST | `/schools/enrollments` | Create enrollment | SchoolAdmin |
| PUT | `/schools/enrollments/{id}` | Update status/fees | SchoolAdmin |
| GET | `/schools/cohorts/{id}/attendance` | List attendance | SchoolAdmin, Coordinator |
| POST | `/schools/cohorts/{id}/attendance` | Record attendance | Coordinator |

## UAT Checklist
1. Enroll member, assign fee plan, schedule first reminder. *(BRD §Enrollment Data)*  
2. Monthly reminder job logs notification and persists schedule. *(BRD §Fee Reminders)*  
3. Promotion flow validates lesson completion before advancing level. *(BRD §Promotion)*  
4. Coordinator sees only assigned cohorts; School Admin sees all. *(BRD §Permissions)*  
5. Attendance CSV export matches UI totals. *(BRD §Attendance)*
