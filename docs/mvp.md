# Web Forx Time Tracker
## MVP Product Specification

Product Name: Web Forx Time Tracker  
Organization: Web Forx Technology Limited  
Purpose: Internal productivity and time tracking platform for remote engineering teams.

---

# 1. Product Overview

The Web Forx Time Tracker is a secure web and mobile responsive application that enables employees to track work hours across projects and tasks.

The system provides:

• Real-time time tracking  
• Project-based work logging  
• Employee activity visibility  
• Reporting dashboards  
• Integration with internal tools

This platform is designed for remote engineers working on multiple company projects.

---

# 2. Core Product Goals

1. Provide accurate tracking of employee working hours.
2. Provide managers visibility into project time allocation.
3. Simplify daily timesheet submission.
4. Generate reliable productivity reports.
5. Integrate with existing company tools.

---

# 3. Target Users

Employee (Engineer)
Manager
Administrator

---

# 4. User Roles and Permissions

## Employee

Can:

• Start/stop timer
• Select project
• Add task description
• Edit own entries (within policy window)
• View own reports
• View own timeline

Cannot:

• View other employees’ time entries
• Modify projects
• Access admin panel

---

## Manager

Can:

• View team time reports
• View employee productivity dashboards
• View project time allocations
• Export reports

Cannot:

• Modify system settings
• Create users

---

## Admin

Full access:

• Manage users
• Manage projects
• Configure integrations
• Configure reminders
• View all reports
• Access audit logs

---

# 5. Initial Projects

The system must initialize the following projects:

EDUSUC  
LAFABAH  
Yemba  
Platform Engineering  
BA  
Webforx Website  
Web Forx Technology

Admin must be able to add or archive future projects without code changes.

---

# 6. Core Features

## 6.1 Authentication

Secure login system.

Requirements:

• Email + password login
• Secure session tokens
• Password hashing
• Session expiration
• Role-based authorization

Future capability:

SSO integration.

---

## 6.2 Time Tracking

Primary function of the system.

Capabilities:

• Start timer
• Stop timer
• Select project
• Add task description
• Add optional notes

System rules:

• Only one active timer per user
• Timer persists across refresh
• Timer state stored server-side

---

## 6.3 Manual Time Entry

Users may manually enter time when necessary.

Manual entry must include:

• project
• task description
• start time
• end time
• duration

Manual entries must create audit logs.

---

## 6.4 Daily Timeline

Users can view:

• daily time blocks
• projects worked
• duration per entry

Users can edit entries within allowed window.

---

## 6.5 Weekly Timesheet

System aggregates daily entries into a weekly summary.

Displays:

• total hours
• hours per project
• hours per day

---

## 6.6 Reports Dashboard

Admin and managers can view:

• employee hours
• project hours
• daily productivity
• weekly productivity
• utilization metrics

Filters:

• date range
• employee
• project

Export options:

• CSV
• PDF

---

## 6.7 Notifications

System reminders:

• No time logged today
• Timer still running
• End-of-day summary reminder

Notifications appear:

• in-app
• Mattermost integration

---

## 6.8 Integrations

### Taiga Integration

Used for project and task tracking.

Capabilities:

• Pull Taiga projects
• Pull tasks
• Attach time entries to tasks

---

### Mattermost Integration

Capabilities:

• Send daily reminders
• Send weekly reports
• Send admin alerts

---

# 7. Mobile Support

Application must be responsive.

Mobile users must be able to:

• Start timer
• Stop timer
• Select project
• View today's hours
• View recent entries

---

# 8. Data Tracking

System must store:

User ID  
Project ID  
Timer Start  
Timer Stop  
Duration  
Task Description  
Notes  
Entry Type (timer/manual)  
Creation Timestamp  
Last Modified Timestamp

---

# 9. Audit Logging

System must log:

• login events
• logout events
• timer start
• timer stop
• manual edits
• project changes
• admin actions

---

# 10. Security Requirements

System must:

• encrypt sensitive data
• enforce role permissions
• prevent unauthorized access
• log suspicious actions

---

# 11. Non-Functional Requirements

Performance target:

Dashboard load < 2 seconds.

System uptime:

99.9%

Scalability:

Support growth of users and projects.

---

# 12. Deployment

Initial deployment may run on:

VM  
Docker container

Recommended architecture:

Frontend  
Backend API  
Database  
Background worker

---

# 13. Future Features (Post-MVP)

AI time suggestions  
Project budgeting  
Client invoicing  
Productivity analytics  
Mobile native app
