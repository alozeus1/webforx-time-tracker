# Web Forx Time Tracker — New User Onboarding Guide

> **Audience:** New users (Employees, Managers, and Admins) onboarding onto the Web Forx Time Tracker.
> **Purpose:** A single reference to set up your account and use every feature confidently.
> **App URL:** `https://timer.dev.webforxtech.com`
> **Owner:** Web Forx Technology Limited — Platform Engineering
> **Last reviewed:** 15 July 2026

---

## How to read this guide

Sections are tagged so you can jump to what applies to you:

- 🟢 **Everyone** — applies to all users.
- 🔵 **Manager / Admin** — extra capabilities for people who manage teams.
- 🟣 **Admin only** — organization-wide configuration.

Throughout the guide you'll see **📸 Screenshot** callouts telling you exactly which screen to capture when building the Confluence page. Capture at a consistent browser width (≈1440px desktop) and, where noted, add a second mobile capture (≈390px).

---

## Table of contents

1. [What the app is](#1-what-the-app-is)
2. [Roles and what you can do](#2-roles-and-what-you-can-do)
3. [Getting access to the app](#3-getting-access-to-the-app)
4. [Signing in](#4-signing-in)
5. [First login: the product tour](#5-first-login-the-product-tour)
6. [Getting around: navigation, search, and help](#6-getting-around-navigation-search-and-help)
7. [The Dashboard](#7-the-dashboard)
8. [Tracking time with the Timer](#8-tracking-time-with-the-timer)
9. [Idle detection and auto-stop](#9-idle-detection-and-auto-stop)
10. [The Timeline (edit and review your day)](#10-the-timeline-edit-and-review-your-day)
11. [Correction requests](#11-correction-requests)
12. [The Weekly Timesheet](#12-the-weekly-timesheet)
13. [Reports and analytics](#13-reports-and-analytics)
14. [Leave & PTO](#14-leave--pto)
15. [The Workday view](#15-the-workday-view)
16. [Your Profile](#16-your-profile)
17. [Settings and preferences](#17-settings-and-preferences)
18. [Two-factor authentication (MFA)](#18-two-factor-authentication-mfa)
19. [Integrations](#19-integrations)
20. [Manager tools](#20-manager-tools-🔵)
21. [Admin tools](#21-admin-tools-🟣)
22. [Approvals explained](#22-approvals-explained)
23. [Mobile use](#23-mobile-use)
24. [Troubleshooting & FAQ](#24-troubleshooting--faq)
25. [Onboarding checklist](#25-onboarding-checklist)
26. [Screenshot capture list](#26-screenshot-capture-list)

---

## 1. What the app is

Web Forx Time Tracker is Web Forx Technology's internal platform for tracking work hours by project and task. You use it to:

- Record time with a live start/stop timer or by entering it manually.
- See your day on a timeline and your week on a timesheet.
- Submit time off (Leave & PTO) and correction requests.
- Give managers and admins visibility into approvals, reports, and team utilization.

It runs in any modern browser and is fully responsive on mobile. There is also an optional desktop wrapper. This guide covers the web app, which is the primary experience.

> 📸 **Screenshot 1 — Landing page.** Open `https://timer.dev.webforxtech.com` while signed out and capture the public landing page.

---

## 2. Roles and what you can do

The app separates two independent ideas. Understanding this early prevents confusion later.

### Access Role — *what you can do*

| Role | Can do |
| --- | --- |
| **Employee** | Track own time, view own timeline/timesheet/reports, request corrections, request leave. Cannot see other people's entries or admin areas. |
| **Manager** | Everything an Employee can do, **plus** view team productivity, approve/reject timesheets, review correction and leave requests, run team reports, and create/import Member-tier users. Cannot create Admins or change anyone's access role. |
| **Admin** | Full control: manage users and roles, projects, integrations, compliance, payroll periods, notifications, audit logs, and branding. |

### Employment Type — *your weekly-hours expectation*

Separately from your access role, each person has an **employment type** — **Employee, Intern, or Contractor** — that sets your weekly-hours target for compliance and under-hours flagging (defaults are configured per organization on the Admin → Compliance tab).

**Why it's separate:** Someone can be a **Manager** (access) but an **Intern** (employment type) — i.e., a manager's permissions with an intern's hours target. Your hours expectation always comes from your employment type, never from your access role.

### Escalation guard

Only an **Admin** can create or assign the Admin access role. Managers can add regular team members and set employment types but can never grant Admin. This is enforced by the server on every change, not just hidden in the interface.

> **Note:** The `/admin` area is currently reachable by both Admins and Managers in the app, even though the original spec scoped it to Admins only. Treat this as an organization decision — some Admin tabs still perform Admin-only actions server-side.

---

## 3. Getting access to the app

You get an account in one of two ways:

1. **An Admin or Manager invites you.** You'll receive a temporary password to sign in with. Change it after your first login (see [Profile](#16-your-profile)).
2. **You request access yourself** via the public request form.

### Requesting access

Go to **`/request-access`** (there's a "**Need access? Request access**" link on the sign-in page).

Fill in:

- **Full Name** *(required)*
- **Work Email** *(required)*
- **Company / Team** *(required)*
- **Team Size** — choose *1 – 10 people*, *11 – 30 people*, *31 – 75 people*, or *76+ people*
- **Additional Details** *(optional)* — rollout timeline, role needs, onboarding requirements

Click **Send Access Request**. You'll see a "**Request Submitted**" confirmation; the team typically responds within 1–2 business days.

> 📸 **Screenshot 2 — Request Access form.** Capture the completed (but not submitted) form at `/request-access`.

---

## 4. Signing in

Go to **`/login`**.

- **Work Email** — e.g. `name@webforx.com`
- **Password**
- Click **Sign In**.

If your organization has Google SSO enabled, you'll also see an "**or continue with**" divider and a **Sign in with Google** button. Use the same email your account was invited under — if Google sign-in fails with "*Make sure your account has been invited*," your Google account isn't linked to a workspace account yet.

If your account has two-factor authentication enabled, after your password you'll be asked for a 6-digit **Authenticator Code** from your authenticator app, then **Verify & Sign In**.

Footer links on the sign-in page: **Forgot your password?**, **Request access**, **Privacy**, **Terms**, and **Back to product overview**.

> 📸 **Screenshot 3 — Sign In screen.** Capture the two-panel login page. If MFA is enabled on a test account, capture the "Authenticator Code" step as **Screenshot 3b**.

### Forgot your password

Click **Forgot your password?** and follow three steps:

1. Enter your **Work Email** → **Get Reset Code**.
2. Enter the **Reset Code** (12 characters), your **New Password** (must meet the on-screen policy, e.g. at least 12 characters), and **Confirm Password** → **Reset Password**.
3. You'll see "**Password Reset!**" → **Go to Sign In**.

Reset codes expire after 30 minutes.

> 📸 **Screenshot 4 — Password reset.** Capture the "Enter Reset Code" step showing the requirements list.

### Trying the demo first (optional)

- **`/demo`** — a 6-stop guided product tour, no login needed.
- A demo account is available for hands-on testing: `demo@webforxtech.com`. Demo data resets every 24 hours and shows a "*Demo session*" banner.

---

## 5. First login: the product tour

The first time you sign in, a **9-step Product Tour** opens automatically. It walks you through: **Welcome → Dashboard → Timer → Timeline → Weekly Timesheet → Reports & Analytics → Team & Admin → Integrations → You're All Set!** As you click **Next**, the app navigates to each page so you see it live.

- Use **Back** / **Next** to move; **Skip tour** to exit.
- The final step's button is **Go to Timer**.
- You can **relaunch the tour anytime** from the sidebar footer via **Product Tour**.

> 📸 **Screenshot 5 — Product Tour.** Capture step 1 ("Welcome to Web Forx Time Tracker") with the progress dots visible.

---

## 6. Getting around: navigation, search, and help

### Left sidebar

The sidebar is your main menu, grouped like this (role-restricted items only appear if you have the role):

- **Dashboard**, **Workday**, **Timer**
- **INSIGHTS:** Timeline, Timesheet, Leave & PTO, Reports
- **BILLING:** Invoices 🔵, Templates 🔵, Scheduled Reports 🔵
- **WORKSPACE:** Team 🔵, Admin 🟣, Webhooks 🟣, Integrations, Settings

The sidebar footer has your **profile** (avatar, name, role → opens Profile), **Product Tour**, a **Dark Mode / Light Mode** toggle, and **Sign Out**.

You can collapse the sidebar with the chevron button to get more screen space.

> 📸 **Screenshot 6 — Sidebar.** Capture the expanded sidebar for a Manager/Admin account so all groups are visible. Add a mobile capture (**6b**) showing the collapsed/hamburger state.

### Top bar (Navbar)

- **Search box** — "*Search projects or tasks…*". Type 2+ characters for a live dropdown of matching projects/tasks; use arrow keys and Enter to open one (it takes you to the Timer with that project/task pre-filled).
- **Notifications bell** — shows an unread count and opens a panel grouped into **Unread** and **Read**. Click any notification to read details; delete individual items. Managers/Admins get an **Open All** link.

### Command palette

Press **⌘K** (Mac) or **Ctrl+K** (Windows/Linux) anywhere to open the **Global Command Menu**. Quick actions: **Start Timer**, and jump to **Dashboard**, **Timeline**, **Reports**, or **Settings**.

### Help Assistant

A floating **?** button (bottom corner) opens the **Help Assistant**. Pick a topic or type a question — it knows the main pages, role permissions, troubleshooting, and manager/admin tools. Topics include Getting Started, Timer & Clocking In/Out, Viewing My Hours, Timesheet Approval, Projects, Profile & Avatar, Password Help, and Troubleshooting.

> 📸 **Screenshot 7 — Help Assistant.** Open the chatbot and capture the topic menu.

---

## 7. The Dashboard

`/dashboard` is your home screen and daily overview.

What you'll see:

- **Status pill** in the header — "**Timer Running**" (green) or "**Timer Paused**" (amber) when a timer is active.
- **Timer widget** — a live HH:MM:SS clock, a project selector, and your top project for the day. The play button opens the full Timer workspace.
- **Four stat cards:**
  - **Daily Goal** — hours today against an 8-hour goal, with a progress bar and a "vs last week" trend. Shows "Goal reached!" at 8h.
  - **Projects** — number of active projects.
  - **Recent Entries** — how many entries you logged today.
  - **Live Timer** — Stopped / running / Paused, with a quick "Add Entry →".
- **Project Budgets** *(when budgets are set)* — utilization bars per project with an "Over budget" warning.
- **Recent Tasks** — your most recent completed entries.

Quick actions: **New Entry** (opens the Timeline entry editor), the notifications bell, and the timer play button.

If you exceed your weekly hour limit, an amber banner appears: "*You exceeded your weekly hour limit this week. Consider taking a break.*" You set that limit on your Profile.

> 📸 **Screenshot 8 — Dashboard.** Capture the full dashboard with an active timer and at least one recent task so the widgets are populated.

---

## 8. Tracking time with the Timer

`/timer` (the "**Live Timer**" workspace) is where you record focused work.

### Starting a timer

1. In **Task**, type what you're working on. *(Required — you can't start without it.)*
2. Optionally pick a **Project** from the **Select Project (Optional)** dropdown.
3. Leave **Billable** on (default) or switch it off for non-billable work.
4. Optionally click **Tags** to categorize the entry.
5. Click **Start Timer**.

Tips:
- When the task field is empty, up to 5 **recent-task suggestion chips** appear — click one to reuse it.
- Keyboard shortcut: **Ctrl+Enter** / **Cmd+Enter** starts the timer (and stops it when running).
- While recording, the **Task**, **Project**, **Billable**, and **Tags** fields lock. Stop the timer to change them.

### While it runs

- Controls become **Pause Task** and **Stop Timer**.
- The sidebar shows **Session Status** and an **Activity Signal** ("Browser active" / "Timer running in background").

### Pausing and resuming

- Click **Pause Task** to pause. When paused you can **Resume Timer**, **Start New Timer** (saves the paused one and opens a fresh workspace), or **Stop Timer**.

### One timer rule

You can only have **one active timer at a time**, and it's stored on the server — so it survives a page refresh, a closed tab, or switching devices.

> 📸 **Screenshot 9 — Timer running.** Capture the Live Timer with a task and project selected and the timer actively recording (showing Pause/Stop controls and the Activity Signal).

### Manual and calendar-assisted entries

- To log time you didn't track live, add it manually from the **Timeline** (see next section) — the manual entry editor is there.
- If Google Calendar is connected, a "**Suggested from Calendar**" strip appears with your meetings; click **Use This Task** to turn a meeting into a timer entry.

---

## 9. Idle detection and auto-stop

To keep time accurate, the app watches for inactivity.

- If you go idle in the tab, an amber banner warns you: "*No activity detected for N min — Timer will pause in …*". Click **I'm still here** to keep going.
- If the tab is in the background, you'll see "*Timer running in background — activity unconfirmed*." Your timer keeps running until activity truly stops, then pauses automatically.
- The app may **auto-stop** a timer and flag the entry for these reasons:
  - **8h cap reached** — you hit the daily active-time cap.
  - **Idle timeout** — no activity for too long.
  - **Heartbeat missing** — the app lost contact with your session.
  - **Paused too long** — a pause exceeded the allowed window.

Auto-stopped entries appear on manager/admin approval queues with a reason chip. If time was genuinely worked, submit a **Correction Request** (next section).

> The exact idle/heartbeat thresholds are set by your Admin under **Admin → Policy**.

---

## 10. The Timeline (edit and review your day)

`/timeline` shows your own day (or week) as a chronological list of entries.

### Navigating

- **Previous day / Next day** chevrons, the current date heading, and a **Today** button.
- **Filter** toggles between "*Showing selected day only*" and "*Showing full week*".
- On desktop, a right sidebar shows a **Mini Calendar**, **Project Activity**, and a **Weekly Summary**.

### Working with entries

Each entry row shows the task, project, start–end time, tags, and duration. Per-entry actions:

- **Edit** (pencil) — open the editor.
- **Resume** (play) — start a fresh timer using that entry's task and project.
- Select entries with checkboxes for bulk actions.

### Adding or editing an entry (manual entry)

Click **New Task** (or **+ Add Entry**) to open the editor:

- **Task** *(required)*
- **Project** *(optional)*
- **Start Time** and **End Time** *(end must be after start)*
- Click **Add Entry** / **Save Changes**.

> ⚠️ **Manual entries need approval.** The editor shows: "*Managerial Approval Required — Manual timeline adjustments require your manager's approval before being added to your final timesheet.*" Manually added or edited entries appear with a **Pending Approval** badge until a manager approves them.

### Bulk actions

Select multiple entries to reveal a floating bar: **Assign** a project to all, **Delete** them, or **Clear** the selection. (An **Approve** button appears here too, but it only works for managers/admins — the server enforces this.)

### Locked entries

Entries inside a **locked payroll period** show a **lock icon** and a "**Locked**" badge and cannot be edited or deleted. This happens after an Admin locks that pay period.

> 📸 **Screenshot 10 — Timeline.** Capture a day with several entries, including one **Pending Approval** badge. **Screenshot 10b:** the entry editor modal open, showing the "Managerial Approval Required" notice.

---

## 11. Correction requests

Use a correction request when time was worked but the timer didn't capture it (for example, it paused while you were working in another tool).

On the **Timer** page, find the **Correction Request** section and fill in:

- **Start time** *(required)*
- **End time** *(required)*
- **Reason** *(required)* — e.g. "*Timer paused while I was working in another tool*"
- **Work note** *(optional)* — context for the reviewer

Click **Submit request**. You'll see: "*Correction request submitted and pending approval.*" Your requests appear under **My Correction Requests** with a status: **PENDING**, **APPROVED**, **REJECTED**, or **CANCELLED**, plus any reviewer note.

A manager or admin reviews it under **Admin → Corrections**. Approved corrections roll up on your timesheet under "**Time Corrections**."

> 📸 **Screenshot 11 — Correction Request.** Capture the correction form plus the "My Correction Requests" list showing at least one status badge.

---

## 12. The Weekly Timesheet

`/timesheet` (the "**Weekly Timesheet**") aggregates your week by project and day.

- **Prev Week / Next Week** and the week-label button (opens a date picker to jump weeks).
- **Hours Logged Trend** — a 7-bar chart, one bar per weekday.
- **Weekly totals grid** — projects down the side, weekdays across the top, with daily totals and a grand total. Entries with no project roll up under "**Unassigned**"; approved corrections roll up under "**Time Corrections**."
- **Export CSV** — downloads your week as `timesheet-<date>.csv`.

🔵 Managers/Admins also get an **Approval Queue (N)** button that opens the **Pending Approvals** table (see [Approvals](#22-approvals-explained)).

> 📸 **Screenshot 12 — Weekly Timesheet.** Capture a populated week showing the trend chart and the project × day grid.

---

## 13. Reports and analytics

`/reports` (the "**Reports Dashboard**") is your analytics view.

**Everyone** can:

- Filter by **Project** and **date range** (**Last 7 Days**, **Last 30 Days**, **Last 90 Days**), and pick a specific day.
- See metric cards: **Total Hours**, **Active Projects**, **Avg. Productivity** (target 85%), and **Billable Amount**.
- View the **Hours Logged Trend** bar chart and **Project Distribution** donut.
- See a **Daily Breakdown** table (Task / Project / Duration / Status) for any day.
- **Export CSV** (top-right). *Note: export is CSV only in the current app.*

🔵 Managers/Admins additionally get:

- **User: All** and **Team: All** filters to drill into any person or team.
- A **Flagged Auto-Stops** metric card.
- The **Timesheet Approvals Required (N)** table with per-row **Approve** / **Reject**.
- A **User Productivity Breakdown** table (hours, approved/pending/rejected, efficiency, status) with a filter that cycles **All users → top → needs attention**.

> 📸 **Screenshot 13 — Reports.** Capture the Reports Dashboard with metric cards and both charts. **Screenshot 13b (Manager/Admin):** the User/Team filters and the "Timesheet Approvals Required" table.

---

## 14. Leave & PTO

`/leave` (**Leave & PTO**) is where you request and track time off.

Click **Request Leave** to open the **New Leave Request** form:

- **Leave Type** — *Annual Leave, Sick Leave, Unpaid Leave, Public Holiday, Other*
- **Start Date** *(required)* and **End Date** *(required)*
- **Working Days** *(required)* — auto-calculated from the date range, excluding weekends; adjust for half-days (step 0.5)
- **Reason** *(optional)*
- Click **Submit Request**.

Your requests list shows the type, a status pill (pending shows as "**Under Review**"), the dates and day count, any reviewer note, and a timeline of who did what. You can **Cancel** a pending request.

🔵 Managers/Admins see two tabs — **My Requests** and **Team Requests** (with a pending-count badge). On team requests they get a **Review** panel with an optional note and **Approve** / **Reject** / **Cancel**.

> 📸 **Screenshot 14 — Leave & PTO.** Capture the "New Leave Request" modal. **Screenshot 14b (Manager/Admin):** the "Team Requests" tab with the Review panel.

---

## 15. The Workday view

`/workday` (**Unified Workday**) reconstructs your day and helps you recover missing time and monitor workload health from one place — "*Reconstruct your day, recover missing time, and monitor workload health from one place.*" It pulls together your tracked time and (where integrations are connected) real work context to suggest time you may have missed. Use it as a review companion to the Timer and Timeline.

> 📸 **Screenshot 15 — Workday.** Capture the Unified Workday view for a day with activity.

---

## 16. Your Profile

`/profile` (**Account Settings → Profile**) is where you manage your account.

- **Profile Avatar** — pick an avatar (initials are generated from your name).
- **First Name** / **Last Name** — editable.
- **Email** — shown, read-only.
- **Role** — shown, read-only.
- **New Password** — leave blank to keep your current password; fill it to change.
- **Weekly Hour Limit** — set a number (0–168) to get overtime alerts when you exceed it; leave blank for no limit.
- Click **Save Changes**.

**Link Mattermost:** In the **Linked Accounts — Mattermost** card, run `/timer link` in Mattermost to get an 8-character code, then enter it here within 15 minutes and click **Link**.

> 📸 **Screenshot 16 — Profile.** Capture the profile form and the Mattermost linking card.

---

## 17. Settings and preferences

`/settings` (**Workspace Configuration → Settings**).

### Preferences

- **Appearance** — Dark mode toggle (also available in the sidebar footer).
- **Privacy Mode** — choose how visible your activity is:
  - **Personal** — redacts browser activity titles; favors private self-review.
  - **Team Ops** — shares operational activity categories without sensitive detail.
  - **Compliance** — keeps detailed activity labels visible for auditable work evidence.

### Notifications

Toggles (defaults in brackets):

- **Overtime Alerts** *(on)*
- **Budget Warnings** *(on)*
- **Approval Requests** *(on)*
- **Weekly Summary Email** *(off)*

### Advanced Configuration

A collapsed "**Advanced Configuration (Developers Only)**" section shows read-only reference info (API endpoint, background workers, session security, Google Calendar OAuth). Nothing to change here for regular use.

> 📸 **Screenshot 17 — Settings.** Capture the Preferences and Notifications cards.

---

## 18. Two-factor authentication (MFA)

Also on the **Settings** page: **Two-Factor Authentication**. Strongly recommended.

**To enable:**

1. Click **Enable MFA**.
2. Scan the QR code with an authenticator app (Google Authenticator, Authy, etc.), or enter the manual secret.
3. Enter the **6-digit code** to confirm → **Activate**.
4. Success: "*MFA enabled successfully!*"

If a code is rejected, make sure your device clock is synced.

**To disable:** click **Disable MFA**, then confirm with your **Password** and current **Authenticator Code**.

> 📸 **Screenshot 18 — MFA setup.** Capture the "Scan this QR code" step (blur or use a test account's QR).

---

## 19. Integrations

`/integrations` connects external systems. Availability depends on what your workspace has enabled; some setup is Admin-oriented.

- **Google Calendar** — click **Connect Google Calendar** to pull real meetings and focus blocks into timer suggestions. Once connected you'll see the account and can **Reconnect** or **Disconnect**. If your workspace hasn't enabled calendar access yet, you'll see a message and can keep tracking time normally.
- **Task Management (Taiga)** — store a workspace credential (**Taiga Username or Email**, **Taiga Password**) to sync tasks; **Save Taiga Config** then **Test Taiga**. Credentials are encrypted before storage.
- **Notification Services (Mattermost)** — save an incoming **Webhook URL** for alerts and summaries; **Save** then **Test**.
- **Task-Native Sync Hub** — optional connectors for **GitHub, Jira, Linear, Asana, ClickUp, Trello** to feed real work context into the Workday view. Microsoft Teams is marked "Coming Soon."

> 📸 **Screenshot 19 — Integrations.** Capture the Google Calendar, Taiga, and Mattermost sections.

---

## 20. Manager tools 🔵

Managers get the **Team** page plus approval powers across Timesheet, Reports, Corrections, and Leave.

### Team page (`/team`, "Team Management")

- **Summary cards:** Active Members, Deactivated Accounts, Admin Accounts.
- **Team Hours This Week** — a per-member bar chart of the last 7 days.
- **Team Directory** — searchable/filterable roster (Member, Team, Role, Status). Per-row actions: **Edit Member**, **Deactivate** / **Reactivate**, and (Admins only) **Delete Permanently**. **Export** downloads the directory as CSV.
- **Add Team Member** — create a user with First/Last name, Email, Team/Group, a Temporary Password, **Role**, and **Employment type** (Employee / Intern / Contractor). *The Admin role option only appears if you are an Admin.*
- **Import CSV** — bulk-create members from a CSV (download the template first); set defaults and choose "*Use each email as the temporary password*" and "*Skip users that already exist*." A summary shows Created / Skipped / Failed.
- **Access Diagnostics** — inspect a user's **Failed Logins**, **Reset Requests**, **Last Good Login**, and an **Auth Event History** to help troubleshoot sign-in problems.

> 📸 **Screenshot 20 — Team Management.** Capture the summary cards, Team Directory, and Access Diagnostics. **20b:** the "Add Team Member" dialog showing Role + Employment type. **20c:** the "Bulk Import" dialog.

---

## 21. Admin tools 🟣

`/admin` ("**Organization Management**") is a tabbed console. Tabs (in order):

- **Projects** — create/edit/archive projects (logo, name, description, budgeted hours, budgeted cost). Projects can be added or archived without code changes.
- **Budgets** — project budget health (Over Budget / Near Limit / On Track / No Budget).
- **Teams** — create and archive/restore teams.
- **Users** — org-wide user overview: reassign team, set inline **Rate ($/hr)**, view status. *(User creation and role/employment-type editing live on the Team page.)*
- **Integrations** — read-only status of configured integrations.
- **Notifications** — view and delete system notifications.
- **Corrections** — review timer correction requests: **Approve** / **Reject** with an optional note.
- **Policy** — the **Timer idle policy**: heartbeat seconds, missed-heartbeat warning/pause, idle warning/pause minutes, max session hours, resume-note minutes, and "*Allow resume after idle pause*."
- **Audit Logs** — combined system audit log + authentication events with success/failure outcomes.
- **Payroll Periods** — generate periods (Weekly / Bi-weekly / Semi-monthly / Custom) and **Lock** / **Unlock** them. Locking a period freezes its entries.
- **Bot Integrations** — configure Slack and Mattermost bots (Teams coming soon).
- **Compliance** — Compliance Mode (None / DCAA / FLSA / WTD), **Minimum Weekly Hours by Employment Type**, time rounding rules, password policy, and the daily report recipient.
- **Branding** — white-label the app name, domain, logo, colors, and email sender.

> 📸 **Screenshot 21 — Admin console.** Capture the tab strip plus the **Projects** tab. Add captures for **Corrections (21b)**, **Policy (21c)**, **Payroll Periods (21d)**, and **Compliance (21e)**.

Other Admin/Manager areas from the sidebar: **Invoices**, **Templates** (project templates), **Scheduled Reports**, and **Webhooks** (Admin only).

---

## 22. Approvals explained

Approvals keep the official timesheet trustworthy. Here's the full picture:

1. **Live timer entries** are trusted automatically.
2. **Manual or edited entries** (from the Timeline) become **Pending Approval** and don't count on the final timesheet until a manager approves them.
3. **Auto-stopped entries** (idle, 8h cap, missing heartbeat, paused too long) are flagged with a reason for review.
4. **Correction requests** (missed time) are reviewed separately under Admin → Corrections.

**Where managers/admins approve:**

- **Timesheet → Approval Queue (N)** — approve/reject with a risk badge per entry.
- **Reports → Timesheet Approvals Required (N)** — same queue, in the analytics view.
- **Timeline** — bulk **Approve** selected entries.
- **Admin → Corrections** — approve/reject correction requests.
- **Leave → Team Requests** — approve/reject/cancel leave.

Each pending item may show a **risk level** (high/amber/low), an "**auto-stopped**" tag, and a stop reason so reviewers can prioritize.

> 📸 **Screenshot 22 — Approval Queue.** Capture the Timesheet "Pending Approvals" table with the Employee/Task/Risk/Duration/Date/Actions columns.

---

## 23. Mobile use

The app is fully responsive. On a phone you can:

- Start/stop the timer, select a project, and view today's hours and recent entries.
- Open the menu via the hamburger button; the sidebar slides in.

Layouts collapse into stacked cards, and tables become card lists.

> 📸 **Screenshot 23 — Mobile.** Capture the Dashboard and Timer on a ≈390px-wide viewport.

---

## 24. Troubleshooting & FAQ

**I signed in but a page is blank or missing from the menu.**
Menu items are role-based. If you don't see Team, Admin, Invoices, etc., your role doesn't include them — that's expected. Ask an Admin if you believe you need access.

**My timer disappeared after refreshing.**
It shouldn't — timers are stored on the server. If it's gone, check your connection and reload; if it persists, contact an Admin (the backend may have lost DB connectivity).

**My timer stopped on its own.**
It was likely auto-stopped (idle, 8h cap, missing heartbeat, or paused too long). If the time was worked, submit a **Correction Request** from the Timer page.

**I can't edit an entry — there's a lock icon.**
The entry is in a **locked payroll period**. Ask your Admin whether the period can be unlocked, or submit a correction if appropriate.

**My manual entry isn't on my timesheet.**
Manual/edited entries stay **Pending Approval** until a manager approves them.

**Google sign-in says my account isn't invited.**
Your Google account isn't linked to a workspace account. Sign in with email/password, or ask an Admin to invite the correct email.

**I forgot my password.**
Use **Forgot your password?** on the sign-in page. Reset codes expire after 30 minutes.

**MFA rejects my code.**
Your device clock may be out of sync — enable automatic time on your phone and try the next code.

**How do I redo the tour?**
Sidebar footer → **Product Tour**.

**Is there a keyboard shortcut to start a timer?**
Yes — **Ctrl/Cmd+Enter** on the Timer page, or **⌘K / Ctrl+K → Start Timer** from anywhere.

**Still stuck?**
Open the **Help Assistant** (the **?** button) and ask, or contact Platform Engineering.

---

## 25. Onboarding checklist

Copy this into a Confluence task list for each new user:

- [ ] Receive invite (or submit a Request Access form) and sign in at `/login`.
- [ ] Complete the 9-step Product Tour.
- [ ] Open **Profile** → set your name, avatar, and (optionally) a **Weekly Hour Limit**.
- [ ] Change your temporary password (Profile → New Password).
- [ ] Enable **Two-Factor Authentication** in Settings.
- [ ] Set your **Privacy Mode** and notification preferences in Settings.
- [ ] Start and stop your first **Timer** entry with a project selected.
- [ ] Review your day on the **Timeline**; try a manual entry.
- [ ] Check your week on the **Timesheet** and export a CSV.
- [ ] (If applicable) Connect **Google Calendar** / link **Mattermost**.
- [ ] Bookmark the app and note the **Help Assistant** location.

---

## 26. Screenshot capture list

For the Confluence build, capture these in order (desktop ≈1440px unless noted):

| # | Screen | Notes |
| --- | --- | --- |
| 1 | Landing page | Signed out |
| 2 | Request Access form | Completed, not submitted |
| 3 / 3b | Sign In / MFA step | Two-panel login; MFA on a test account |
| 4 | Password reset | "Enter Reset Code" step |
| 5 | Product Tour | Step 1 with progress dots |
| 6 / 6b | Sidebar | Manager/Admin expanded; mobile collapsed |
| 7 | Help Assistant | Topic menu |
| 8 | Dashboard | Active timer + recent tasks |
| 9 | Timer running | Task + project, Pause/Stop visible |
| 10 / 10b | Timeline / entry editor | Pending Approval badge; editor with approval notice |
| 11 | Correction Request | Form + requests list |
| 12 | Weekly Timesheet | Trend chart + grid |
| 13 / 13b | Reports / approvals | Cards + charts; manager filters + approvals table |
| 14 / 14b | Leave & PTO | Request modal; Team Requests review |
| 15 | Workday | Day with activity |
| 16 | Profile | Form + Mattermost card |
| 17 | Settings | Preferences + Notifications |
| 18 | MFA setup | QR step (blurred/test) |
| 19 | Integrations | Calendar + Taiga + Mattermost |
| 20 / 20b / 20c | Team Management | Directory + diagnostics; Add Member; Bulk Import |
| 21 / 21b–e | Admin console | Tabs + Projects; Corrections; Policy; Payroll; Compliance |
| 22 | Approval Queue | Timesheet pending approvals table |
| 23 | Mobile | Dashboard + Timer at ≈390px |

---

*This guide reflects the application as of 15 July 2026. If the app changes, update the matching section and re-capture the affected screenshots.*
