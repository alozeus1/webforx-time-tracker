# Application Route Map

Last reviewed: 2026-04-23

The frontend is a React Router app. The backend API is mounted under `/api/v1`.

## Public Frontend Routes

| Route | Purpose |
| --- | --- |
| `/` | Public landing page, or redirects authenticated users to `/dashboard` |
| `/landing` | Redirects to `/` |
| `/login` | Login form |
| `/forgot-password` | Password reset request |
| `/request-access` | Public access request form |
| `/privacy` | Privacy policy |
| `/terms` | Terms page |
| `/share/:token` | Public shared artifact view |
| `/demo` | Public 6-stop guided product tour |

## Authenticated Frontend Routes

These routes render inside the main authenticated layout.

| Route | Purpose |
| --- | --- |
| `/dashboard` | Main user dashboard with active timer, today summary, alerts, and recent work |
| `/workday` | Workday reconstruction and operational intelligence view |
| `/timer` | Start, pause, resume, stop, and manually enter time |
| `/timeline` | Chronological time entry view, edits, duplicates, and resume-task actions |
| `/timesheet` | Weekly summary and approval queue where authorized |
| `/reports` | Analytics, exports, and approval review where authorized |
| `/settings` | User preferences |
| `/profile` | User account profile |
| `/integrations` | Integration settings hub |
| `/integrations/taiga` | Deep link alias to the integrations hub |
| `/integrations/mattermost` | Deep link alias to the integrations hub |

## Manager/Admin Frontend Routes

| Route | Allowed roles | Purpose |
| --- | --- | --- |
| `/team` | Manager, Admin | Team productivity, user visibility, access diagnostics, imports |
| `/invoices` | Manager, Admin | Invoice management |
| `/templates` | Manager, Admin | Project template management |
| `/scheduled-reports` | Manager, Admin | Scheduled report management |

## Admin Frontend Routes

| Route | Allowed roles | Purpose |
| --- | --- | --- |
| `/admin` | Current code: Admin, Manager. MVP spec: Admin only. | Users, projects, integrations, notifications, audit/auth logs |
| `/webhooks` | Admin | Webhook subscription management |

Note: `/admin` currently allows `Manager` in `frontend/src/App.tsx`. Treat that as an explicit product decision before transfer.

## Backend API Prefix

All backend routes are served under:

```text
/api/v1
```

Health and base routes:

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | Public | API service descriptor |
| `GET` | `/api/v1` | Public | API base descriptor |
| `GET` | `/api/v1/health` | Public | Health check |

## Auth API

Mounted at `/api/v1/auth`.

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/login` | Public | Email/password login |
| `POST` | `/logout` | Public | Logout acknowledgment |
| `POST` | `/forgot-password` | Public | Create password reset token |
| `POST` | `/reset-password` | Public | Complete password reset |
| `POST` | `/refresh` | Public | Refresh access token |

## User API

Mounted at `/api/v1/users`.

See `backend/src/routes/userRoutes.ts` for exact role restrictions. This group supports current-user details, user listing, creation/update/admin management, imports, and diagnostics.

## Project API

Mounted at `/api/v1/projects`.

Supports project listing, creation, update/archive flows, membership-aware project access, budget reporting, and active/inactive project state.

## Timer And Time Entry API

Mounted at `/api/v1/timers`.

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/pause-beacon` | Body token | SendBeacon-safe pause on tab/window close |
| `POST` | `/start` | User | Start active timer |
| `POST` | `/stop` | User | Stop active timer and create entry |
| `POST` | `/pause` | User | Pause active timer |
| `POST` | `/resume` | User | Resume paused timer |
| `POST` | `/manual` | User | Create manual entry |
| `GET` | `/me` | User | Current user's entries, active timer, notifications, projects |
| `POST` | `/ping` | User | Heartbeat/activity ping |
| `GET` | `/corrections` | User | Current user's timer correction requests |
| `POST` | `/corrections` | User | Create timer correction request for missed paused time |
| `GET` | `/corrections/review` | Manager, Admin | List correction requests for review |
| `POST` | `/corrections/:correctionId/review` | Manager, Admin | Approve/reject correction request |
| `PUT` | `/:id` | User | Update permitted entry |
| `DELETE` | `/:id` | User | Delete permitted entry |
| `POST` | `/:id/duplicate` | User | Duplicate/resume task context |
| `GET` | `/approvals` | Manager, Admin | Pending approval queue |
| `POST` | `/approvals/:entryId` | Manager, Admin | Approve/reject entry |

## Reports API

Mounted at `/api/v1/reports`.

Supports report summaries, exports, operations insights, and manager/admin analytics. See `backend/src/routes/reportRoutes.ts` for the exact endpoint list.

## Integration API

Mounted at `/api/v1/integrations`.

Supports Taiga/Mattermost-style encrypted configuration, integration status, and feature-specific integration helpers.

## Calendar API

Mounted at `/api/v1/calendar`.

Common routes include:

- `/status`
- `/connect`
- `/events`
- `/disconnect`
- `/callback`

Google OAuth requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.

## ML API

Mounted at `/api/v1/ml`.

Includes categorization helpers such as mapping activity/window context to projects.

## Admin API

Mounted at `/api/v1/admin`.

Supports admin dashboard data, audit/auth event visibility, system activity, notifications, and operational oversight.

Timer policy endpoints:

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/timer-policy` | Admin | Read global timer idle/heartbeat policy |
| `PUT` | `/timer-policy` | Admin | Update global timer idle/heartbeat policy with server validation |

## Cron API

Mounted at `/api/v1/cron`.

Protected by `CRON_SECRET` in production.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/idle` | Idle/timer guardrail cron |
| `POST` | `/workload` | Workload/burnout cron |
| `POST` | `/daily` | Daily notification/report cron |
| `POST` | `/reset-demo` | Reset demo user's data |

## Additional API Groups

| Prefix | Purpose |
| --- | --- |
| `/api/v1/public` | Public/shared data routes |
| `/api/v1/contact` | Public request-access route |
| `/api/v1/tags` | Time entry tag management |
| `/api/v1/webhooks` | Webhook subscription management |
| `/api/v1/invoices` | Invoice workflows |
| `/api/v1/templates` | Project template workflows |
| `/api/v1/scheduled-reports` | Scheduled report workflows |

## Deployment Notes

- Frontend `VITE_API_URL` must include `/api/v1`.
- Vite environment variables are build-time values; redeploy frontend after changing `VITE_API_URL`.
- Backend production requires `INTEGRATION_SECRET`; local non-production can fall back to `JWT_SECRET`.
- Vercel cron paths are defined in `backend/vercel.json`.
