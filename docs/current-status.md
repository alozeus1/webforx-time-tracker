# Current Application Status

Last reviewed: 2026-03-16

This document summarizes where the application stands against the current source-of-truth docs:

- [docs/mvp.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/mvp.md)
- [docs/app-route.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/app-route.md)
- [docs/ANTIGRAVITY_INSTRUCTIONS.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/ANTIGRAVITY_INSTRUCTIONS.md)

## Overall Status

The app is beyond scaffold stage.

Current maturity: functional MVP shell

Meaning:

- frontend, backend, and desktop wrapper all exist
- core auth and seeded data exist
- most documented routes are present
- several screens are connected to live backend data
- build and lint checks pass
- a few product surfaces are still incomplete or misaligned with the MVP spec

The biggest remaining blockers for "live-test ready MVP" status are reporting completeness, admin surface completeness, and environment readiness for optional integrations.

## Recent Progress

Completed in the latest implementation pass:

- [x] frontend timer now uses server-backed `/timers/start` and `/timers/stop`
- [x] timer resume is now sourced from backend `activeTimer` state
- [x] approvals endpoints are now manager/admin only
- [x] frontend route guards now restrict `/team` and `/admin` by role
- [x] employee report export is scoped to the authenticated user while managers/admins still export broader data
- [x] route documentation now reflects the implemented API surface more closely

## Verified Checks

The following commands were run successfully during review:

- `cd frontend && npm run build`
- `cd frontend && npm run lint`
- `cd backend && npm run build`

Notes:

- frontend build completed successfully, but Vite warned that the local Node version is `20.15.0` while it recommends `20.19+` or `22.12+`
- there is no meaningful automated test suite yet; frontend has no test script and backend `test` currently maps to `build`

## Done Now

### App Structure

- [x] React frontend exists in [frontend](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/frontend)
- [x] Express + Prisma backend exists in [backend](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/backend)
- [x] Electron desktop wrapper exists in [desktop](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/desktop)

### Routes

- [x] Public login route exists
- [x] Authenticated route shell exists for dashboard, timer, timeline, timesheet, reports, team, admin, settings, profile, and integrations
- [x] Integration alias routes exist for Taiga and Mattermost

### Authentication

- [x] Email/password login exists
- [x] Password hashing exists
- [x] JWT session token issuance exists
- [x] Protected backend middleware exists

### Data Model

- [x] Prisma schema includes users, roles, projects, time entries, active timers, notifications, audit logs, integrations, calendar connections, and report cache
- [x] Seed includes admin, manager, employee, and the required initial projects

### Implemented Backend Areas

- [x] auth routes
- [x] users routes
- [x] projects routes
- [x] timer/time entry routes
- [x] report export route
- [x] integrations routes
- [x] Google Calendar routes
- [x] ML categorization route
- [x] background worker bootstrapping

### Implemented Frontend Areas

- [x] login page
- [x] dashboard page
- [x] timer page
- [x] timeline page
- [x] timesheet page
- [x] reports page
- [x] team page
- [x] admin page
- [x] profile page
- [x] settings page
- [x] integrations page

## Working But Partial

These areas are present and usable, but not fully aligned with the source-of-truth requirements.

### Dashboard

- [x] loads recent entries and total durations
- [ ] still mixes live data with placeholder UI values

### Timesheet

- [x] weekly grouping works from user entries
- [ ] submission and approval UX is still simplified

### Reports

- [x] CSV export works
- [x] approvals table works at the API level
- [ ] chart metrics and dashboard analytics are mostly placeholder values
- [ ] route spec expects broader analytics filtering by date range, project, and user

### Admin

- [x] projects and users tabs exist
- [x] project creation exists
- [ ] route spec also expects integrations, notifications, and audit logs sections

### Integrations

- [x] Taiga config storage exists
- [x] Mattermost config storage exists
- [x] Google Calendar OAuth flow is implemented in code
- [ ] real Google Calendar live testing is blocked until OAuth env vars are provided

### Desktop Wrapper

- [x] Electron wrapper launches the frontend
- [x] idle-time bridge exists
- [ ] deeper native tracking behavior is still very light

## Broken Or Misaligned

These are the main gaps between the codebase and the source-of-truth docs.

### 1. Reports And Team Analytics Are Still Partially Placeholder

Status: open

Problem:

- several dashboard/reports/team metrics are hardcoded or mock-like
- the data model can support deeper reporting, but the UI is not fully wired

Impact:

- demo experience is stronger than actual analytics fidelity

### 2. Admin Surface Is Incomplete Relative To The Spec

Status: open

Problem:

- admin currently focuses on projects and users
- spec expects integrations, notifications, and audit logs sections too

Impact:

- admin panel is functional but incomplete

### 3. Environment Readiness Is Partial

Status: open

Current `.env` review:

- backend has `DATABASE_URL`, `JWT_SECRET`, `PORT`, and `NODE_ENV`
- frontend has `VITE_API_URL`
- backend does not currently expose a dedicated `INTEGRATION_SECRET`
- backend does not currently expose Google OAuth env vars

Impact:

- base app can run
- encrypted integration storage falls back to `JWT_SECRET`
- live Google Calendar connection is not ready yet

### 4. Some Product Areas Still Need Role-Aware UX Polish

Status: open

Problem:

- route guards now protect the main restricted screens
- some mixed-role pages still need role-specific sections and cleaner fallbacks

Impact:

- security is improved
- user experience still needs some refinement around permissions

### 5. API Surface Previously Drifted From The Route Spec

Status: improved

Problem:

- route documentation had fallen behind the actual implemented endpoints

Impact:

- this has now been corrected in `docs/app-route.md`, but the repo should keep docs and code updated together

### 6. There Is Still No Meaningful Automated Test Suite

Status: open

Problem:

- frontend has build and lint, but no real behavior tests wired into package scripts
- backend `test` currently maps to `build`

Impact:

- regressions in timer lifecycle, role access, and approval flow are still possible

## Priority Build Order

This is the recommended next sequence.

### P0: Must Fix Before Calling The App Live-Test Ready

- [x] Rewire the frontend timer flow to use `/timers/start`, `/timers/stop`, `/timers/me`, and persisted `activeTimer`
- [x] Make refresh-safe timer resume work from server state
- [x] Add manager/admin authorization to approvals endpoints
- [x] Add role-aware frontend route guards for `/team`, `/admin`, and approval actions
- [x] Align API docs and implemented routes so the route map reflects reality

### P1: Should Be Done Right After P0

- [ ] Replace placeholder reports metrics with computed backend values
- [ ] Add real filters for reports: date range, project, and user
- [ ] Expand admin to include integrations, notifications, and audit logs sections
- [ ] Add a dedicated `INTEGRATION_SECRET` to backend env handling for live deployments
- [ ] Provide Google OAuth env vars if Calendar sync is part of the MVP launch

### P2: Improves Reliability And Handoff

- [ ] Add automated tests for auth, timer lifecycle, approvals, and report export
- [ ] Add frontend integration coverage for login, timer start/stop, and role-restricted pages
- [ ] Add a top-level README describing how to run frontend, backend, seed, and desktop together
- [ ] Decide whether root-level git should be initialized here or whether this project is managed elsewhere

## Definition Of "Ready For Internal Live Testing"

Use this checklist when deciding if the app is ready for broader internal use.

- [ ] a user can log in with seeded credentials
- [x] a user can start a timer and refresh the page without losing it
- [ ] a user can stop a timer and see the entry appear in dashboard, timeline, and timesheet
- [x] only managers/admins can approve timesheets
- [x] only admins can create projects and access admin-only actions
- [ ] reports show real filtered data instead of placeholder figures
- [ ] builds and lint pass in current environment
- [ ] backend env includes a dedicated `INTEGRATION_SECRET`
- [ ] Google Calendar env is present if calendar sync is expected in testing

## Bottom Line

If we summarize the application in one line:

The project is structurally strong and demoable now, but it still needs one core workflow fix and a few authorization/spec-alignment fixes before it should be treated as a true live-test MVP.
