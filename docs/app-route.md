# Application Route Map

Defines the application routing structure.

---

# Public Routes

/login

Login page for authentication.

---

# Authenticated Routes

/dashboard

Main user dashboard.

Displays:

active timer  
today hours  
recent tasks

---

/timer

Dedicated timer page.

Functions:

start timer  
stop timer  
project selection

---

/timeline

Visual timeline of daily work entries.

---

/timesheet

Weekly summary view.

Displays:

hours per day  
hours per project

---

/reports

Main analytics dashboard.

Filters:

date range  
project  
user

---

# Manager Routes

/team

View team productivity and time allocation.

---

# Admin Routes

/admin

Admin control panel.

Sections:

Users  
Projects  
Integrations  
Notifications  
Audit Logs

---

# Settings Routes

/settings

User preferences.

---

# Integration Routes

/integrations

Integration settings hub.

Contains Taiga and Mattermost configuration panels.

/integrations/taiga

Alias route to the integrations hub for Taiga-specific deep links.

---

/integrations/mattermost

Alias route to the integrations hub for Mattermost-specific deep links.

---

# Profile Routes

/profile

User account details.

---

# API Routes (Backend)

API prefix:

/api/v1

Endpoints:

/api/v1/auth/login  
/api/v1/auth/logout  

/api/v1/timers/start  
/api/v1/timers/stop  
/api/v1/timers/manual  
/api/v1/timers/me  
/api/v1/timers/ping  
/api/v1/timers/approvals  

/api/v1/projects  

/api/v1/reports/export  

/api/v1/users  
/api/v1/users/me  

/api/v1/integrations

/api/v1/integrations/github/commits

/api/v1/integrations/quickbooks/sync

/api/v1/calendar/status

/api/v1/calendar/connect

/api/v1/calendar/events

/api/v1/calendar/disconnect

/api/v1/calendar/callback

/api/v1/ml/categorize
