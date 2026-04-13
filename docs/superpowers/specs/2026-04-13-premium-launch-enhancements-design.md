# Premium Launch Enhancements — Design Spec

Date: 2026-04-13  
Last updated: 2026-04-13 (user review amendments)  
Status: Approved  
Production safety constraint: **All changes are strictly additive. Zero modifications to existing auth flows, protected routes, seeded users, CORS config, or live DB models — except the targeted idle-pause upgrade to `ActiveTimer` and `idleTracker`.**

---

## Problem Statement

The marketing report (2026-04-13) identified four UX/messaging weaknesses impacting the premium launch:

1. No public self-serve in-product demo environment
2. Request-access flow is mail-client dependent (less premium than in-app submission)
3. AI narrative is present but under-explained in public-facing messaging
4. Authenticated proof visuals are missing for premium launch credibility

A fifth feature was added during design review:

5. Idle timer currently auto-stops — should pause instead, with a visible resume prompt on return

---

## Production Safety Principles

These rules apply to every task in this spec:

- **No changes to existing routes** — only new routes added
- **Minimal changes to existing Prisma models** — `ActiveTimer` gets three new nullable fields for pause support (backward-compatible migration); `AccessRequest` is a brand new model
- **No changes to existing seed users** — demo user added as a new entry only
- **No changes to existing auth middleware or JWT logic**
- **No changes to `CORS_ORIGIN`, `JWT_SECRET`, or any existing env var**
- **No changes to existing frontend pages** except:
  - `Landing.tsx` — insert two new sections (additive only)
  - `RequestAccess.tsx` — replace `window.location.href = mailto:` with `fetch()` call
  - `App.tsx` — add two new public routes (`/demo`, already-existing `/request-access` unchanged)
- **New backend routes are protected by input validation and rate limiting**
- **Demo user is a seeded Employee role — lowest privilege level**

---

## Area 1 — Self-Serve Demo Environment

### Overview

Two entry points for two levels of visitor intent:

| Surface | Route | Auth required | Audience |
|---|---|---|---|
| Guided tour | `/demo` | No | Casual browsers — low intent |
| Demo login | Uses `/login` | Yes (demo credentials) | High-intent prospects |

### 1A — Guided Sandbox Tour (`/demo`)

**What it is:** A new public React route that renders 6 read-only screen mockups of the real app UI with pre-loaded static data. A step-by-step overlay guides visitors through each screen.

**Tour stops (in order):**
1. Dashboard — live timer snapshot, daily totals, project breakdown
2. Timer — start/stop UI, task assignment, daily progress bar
3. Workday — AI workday reconstruction view with activity signals
4. Timeline — chronological entry list with daily analytics
5. Reports — team analytics charts, utilization metrics
6. Admin — org controls, user management overview

**Interaction model:**
- "Previous / Next" navigation between stops
- Progress indicator (e.g., Step 2 of 6)
- Each stop has a CTA: "Want the real thing? Try the demo account →"
- Final stop CTA: "Ready to onboard? Request access →"
- "Exit tour" button returns to landing page

**Implementation approach:**
- New file: `frontend/src/pages/Demo.tsx`
- New file: `frontend/src/pages/Demo.css`
- New route in `App.tsx`: `<Route path="/demo" element={<Demo />} />`
- Static data defined inline — no API calls, no auth
- Renders simplified UI mockups consistent with the real app's visual style
- The tour overlay is a fixed-position component with step state

**What it does NOT do:**
- No real API calls
- No auth tokens
- No interaction with existing pages or components beyond shared CSS variables

### 1B — Demo Login (Real App)

**What it is:** A seeded `demo@webforxtech.com` user with the Employee role. Visitors can enter the real app with one click.

**Entry points:**
- Landing page: "Try Demo" button (secondary CTA in hero section, additive)
- Login page: "Log in as Demo User" link below the main form (additive)

**In-app demo experience:**
- A non-dismissible banner at the top of the Layout component: "You're viewing a demo session. Data resets weekly. Request access to get your own workspace →"
- Demo user has Employee role only — cannot access `/admin`, `/team`, or any Manager/Admin-restricted routes
- Banner is rendered conditionally: `if (userEmail === 'demo@webforxtech.com')`

**Demo data reset (24-hour rolling):**
- New cron endpoint: `POST /api/v1/cron/reset-demo` (protected by `CRON_SECRET`)
- Runs hourly via Vercel cron
- Deletes all `TimeEntry`, `ActiveTimer`, and `Notification` rows for the demo user where `created_at` or `start_time` is older than 24 hours
- Also deletes any active timer for the demo user unconditionally on each run (prevents stuck timers)
- Re-seeds with a clean representative set of time entries spanning the current day
- 24-hour window chosen so: a visitor who logs in at any time of day sees fresh data; data created within the last 24h is preserved for continuity within a session

**Seed entry:**
- Added to `backend/prisma/seed.ts` as a conditional block: only seeds demo user if `SEED_DEMO_USER=true` env var is set
- Password stored in `SEED_DEMO_PASSWORD` env var (required when `SEED_DEMO_USER=true`)
- Email: `demo@webforxtech.com`, Role: Employee

**Production safety:**
- `SEED_DEMO_USER` defaults to `false` — no unintentional seeding
- Demo user has identical role enforcement as any other Employee
- Rate limiting on login endpoint already in place (no change needed)
- Demo user cannot modify projects, users, or admin settings

---

## Area 2 — Request Access (Backend API + DB + Resend)

### Overview

Replace the `mailto:` approach with a proper submission pipeline.

### New Prisma Model

```prisma
model AccessRequest {
  id         String   @id @default(cuid())
  fullName   String
  workEmail  String
  company    String
  teamSize   String
  details    String?
  status     String   @default("pending")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

Migration: `backend/prisma/migrations/YYYYMMDDHHMMSS_add_access_request/`

### New Backend Route

File: `backend/src/routes/contactRoutes.ts`  
Mounted at: `POST /api/v1/contact/request-access`  
Auth: None required (public endpoint)

**Request body:**
```json
{
  "fullName": "string (required, 2–100 chars)",
  "workEmail": "string (required, valid email)",
  "company": "string (required, 2–100 chars)",
  "teamSize": "enum: 1-10 | 11-30 | 31-75 | 76+",
  "details": "string (optional, max 1000 chars)"
}
```

**Response (success):**
```json
{ "ok": true, "message": "Request received." }
```

**Response (validation error):**
```json
{ "ok": false, "error": "Validation message" }
```

**Controller logic (`contactController.ts`):**
1. Validate input (manual validation, no new dependencies)
2. Write `AccessRequest` row to DB
3. Send admin notification email via `emailService` (to `admin@webforxtech.com`)
4. Send receipt email to visitor's `workEmail`
5. Return `{ ok: true }`
6. If Resend is not configured (`RESEND_API_KEY` absent): log warning, skip email, still return `{ ok: true }` — request is persisted in DB regardless

**Rate limiting:**
- Apply existing rate limiter middleware (already in project) to this route
- Limit: 5 requests per IP per hour

**Resend email templates:**

Admin notification subject: `New access request — {company} ({teamSize})`  
Visitor receipt subject: `We received your request — Web Forx Time Tracker`

Both use the existing `BASE_HTML` branded template from `emailService.ts`.

### Frontend Change

File: `frontend/src/pages/RequestAccess.tsx`

Replace:
```ts
window.location.href = `mailto:${REQUEST_ACCESS_EMAIL}?subject=${subject}&body=${body}`;
setSubmitted(true);
```

With:
```ts
const res = await fetch(`${VITE_API_URL}/contact/request-access`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(form),
});
const data = await res.json();
if (data.ok) setSubmitted(true);
else setError(data.error ?? 'Something went wrong. Please try again.');
```

Add loading state and inline error display. Success state copy updated to: "Your request has been submitted. Check your email for confirmation."

**Production safety:**
- CORS: `/api/v1/contact/*` served under existing CORS config — no changes needed
- No auth token required — this is a public endpoint
- Input validation prevents injection
- If `RESEND_API_KEY` is absent, endpoint still works — just no email sent, DB write succeeds

---

## Area 3 — AI Section on Landing Page

### Overview

New section inserted between the Interactive Demo Walkthrough (#5) and User Roles (#6) sections in `Landing.tsx`.

### Section Content

**Section label:** `AI-Powered Operations`  
**Heading:** `Intelligence Built Into Every Workflow`  
**Subheading:** `Every insight is derived from real tracked time — not estimates or guesses.`

**Four feature cards:**

| Card | Title | Description |
|---|---|---|
| 1 | Workday Reconstruction | When gaps appear in the daily log, the AI analyses calendar events and activity signals to suggest missing time blocks — reducing context loss at the end of the day. |
| 2 | Burnout Risk Detection | The system monitors weekly hours per team member and surfaces alerts when anyone approaches or exceeds healthy workload thresholds — before damage is done. |
| 3 | Approval Intelligence | Timesheet entries are scored for anomalies — unusual durations, project mismatches, submission timing — so managers can prioritise review time on entries that need attention. |
| 4 | 14-Day Capacity Forecast | Using the last 7 days of tracked data, the platform projects each team member's load and overload risk over the next two weeks — enabling proactive planning. |

**Trust line (below the grid):**  
`"Built on real signals, not predictions. Every AI insight is derived from your team's actual tracked time data."`

### Implementation

- All content is static data added to `Landing.tsx` (same pattern as `features`, `benefits`, `roles` arrays)
- New CSS classes added to `Landing.css` (no changes to existing classes)
- Section uses `id="ai-features"` for anchor linking
- Nav bar gets an "AI" button alongside "Features" and "Demo" (scrolls to `#ai-features`)

**Production safety:** Purely additive. No logic changes, no API calls, no state.

---

## Area 4 — Screenshot Gallery

### Overview

A role-tabbed gallery with lightbox, inserted between the Benefits section (#8) and the CTA Banner (#9) in `Landing.tsx`.

### Structure

**Tabs:** All Views · Employee · Manager · Admin

**Planned images (to be provided by the team):**

| Filename | Role tab | Caption |
|---|---|---|
| `dashboard.png` | Employee | Dashboard — daily totals and active timer |
| `workday.png` | Employee | Workday — AI-assisted activity reconstruction |
| `timeline.png` | Employee | Timeline — chronological daily log |
| `reports.png` | Manager | Reports — team analytics and utilization |
| `team.png` | Manager | Team — member directory and activity overview |
| `admin.png` | Admin | Admin — organization controls and audit visibility |

Files go in: `frontend/public/screenshots/`

**Lightbox behaviour:**
- Click any thumbnail → full-screen overlay with image, caption, and role label
- Keyboard: Escape closes, arrow keys navigate between images in the active tab
- Accessible: `role="dialog"`, `aria-modal="true"`, focus trap

### Implementation

- Static image metadata array in `Landing.tsx` (same pattern as other static data)
- Tab filter state: `const [galleryTab, setGalleryTab] = useState('all')`
- Lightbox state: `const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)`
- New CSS in `Landing.css` — no existing class changes
- Images served from `/screenshots/` public directory — no build-time processing needed
- If an image file is missing, the thumbnail renders a placeholder with the caption text (no broken img tags)

**Screenshots status:** All 6 images confirmed present in `frontend/public/screenshots/` (admin.png, dashboard.png, reports.png, team.png, timeline.png, workday.png). Gallery ships with real authenticated screenshots on day one — no placeholders needed.

---

---

## Area 5 — Idle Timer Pause (new feature)

### Problem

The current idle behavior:
- Frontend `useActiveTimerHeartbeat` detects inactivity → fires `wfx:timer-idle-warning`
- `Layout.tsx` shows a dialog: *"Your timer may stop soon"* — dismiss only ("Got it")
- Backend `idleTracker.ts` (runs every 5min) eventually calls `stopActiveTimerWithReason` — the timer is **permanently stopped**, time is lost

The user loses billable time they may have intended to track. The correct behavior is to **pause** the timer and prompt the user to resume when they return.

### New Idle Flow

```
User leaves browser (tab hidden / window loses focus / no input)
    ↓ after IDLE_WARNING_MS (default 15min)
Frontend fires wfx:timer-idle-warning
    ↓
Layout shows "Timer Paused" dialog (upgraded from current warning-only dialog)
    ↓
Backend idleTracker (next 5min tick) calls pauseActiveTimer() instead of stopActiveTimerWithReason()
    ↓ (timer is now paused — paused_at recorded, paused_duration accumulates)
User returns (any input / tab becomes visible)
    ↓
Frontend fires wfx:timer-idle-resumed
    ↓
Layout shows persistent "Your timer is paused" resume banner (cannot be dismissed without action)
    ↓
User clicks "Resume" → POST /api/v1/timers/resume → timer restarts, paused_duration excluded from total
```

### Schema Changes — `ActiveTimer`

Three new nullable fields (backward-compatible migration — existing rows get `null` defaults):

```prisma
model ActiveTimer {
  // ... existing fields unchanged ...
  is_paused              Boolean   @default(false)
  paused_at              DateTime?
  paused_duration_seconds Int      @default(0)
}
```

**Duration calculation with pause:**
- Final duration = `(stop_time - start_time) - paused_duration_seconds`
- `paused_duration_seconds` accumulates across multiple pause/resume cycles within a single timer session

### New Backend Service Functions

File: `backend/src/services/activeTimerService.ts` (additive — new exports only)

**`pauseActiveTimer(userId: string, reason: string)`**
- Sets `is_paused = true`, `paused_at = now`
- Creates `Notification` of type `timer_paused` with message:
  *"Your timer was paused due to inactivity. Resume when you're back."*
- Writes `AuditLog` with reason, heartbeat age, client_visibility
- Does NOT stop the timer — `ActiveTimer` row remains

**`resumeActiveTimer(userId: string)`**
- Reads `paused_at`, calculates elapsed seconds since pause
- Adds to `paused_duration_seconds`
- Clears `is_paused = false`, `paused_at = null`
- Creates `Notification` of type `timer_resumed`
- Writes `AuditLog`

### New Backend API Endpoints

**`POST /api/v1/timers/pause`** — protected (requires JWT)
- Calls `pauseActiveTimer(userId, 'user_requested')`
- Returns `{ ok: true, pausedAt: ISO string }`

**`POST /api/v1/timers/resume`** — protected (requires JWT)
- Calls `resumeActiveTimer(userId)`
- Returns `{ ok: true, resumedAt: ISO string, pausedDurationSeconds: number }`

Both endpoints return `404` if no active timer exists for the user.

### `idleTracker.ts` Changes

Replace `stopActiveTimerWithReason` call (on `browserInactive`) with `pauseActiveTimer`:

```ts
// Before
await stopActiveTimerWithReason({ userId: timer.user_id, reason: 'browser_inactive', ... });

// After
if (!timer.is_paused) {
    await pauseActiveTimer(timer.user_id, 'browser_inactive');
}
```

Stop behavior is preserved for `idle_timeout` and `heartbeat_missing` reasons (non-browser-inactive cases) — these still call `stopActiveTimerWithReason`. Only the `browser_inactive` path switches to pause.

### Frontend Changes

**`Layout.tsx` — upgrade idle warning dialog**

Current dialog (warning only):
- Title: "Your timer may stop soon"
- Body: "We have not detected activity for N minute(s). Resume activity to keep the timer running."
- Button: "Got it" (dismisses, no action)

New dialog (pause confirmation):
- Title: "Timer Paused"
- Body: "No activity detected for N minute(s). Your timer has been paused. Your time up to this point is saved — resume when you're back."
- Primary button: "Resume Timer" → calls `POST /api/v1/timers/resume` → dismisses dialog → fires `TIME_ENTRY_CHANGED_EVENT` to refresh timer state
- Secondary link: "I'm done for now" → calls `POST /api/v1/timers/stop` (existing endpoint) → dismisses

**`Layout.tsx` — resume banner on return**

When `wfx:timer-idle-resumed` fires AND the timer is in paused state (checked via `syncActiveTimer`):
- Show a persistent top-of-page banner (not dismissible without action):
  - Text: "Your timer is paused — tap Resume to continue tracking."
  - Button: "Resume" → calls `POST /api/v1/timers/resume` → banner hides
  - Button: "Discard" → calls `POST /api/v1/timers/stop` → banner hides

The banner sits below the Navbar, above the page content. It uses amber/warning styling consistent with existing idle warning colours.

**`useActiveTimerHeartbeat.ts`**

- No behavior changes to heartbeat logic itself
- `syncActiveTimer` response should include `is_paused` from the timer state — used by Layout to decide whether to show the resume banner
- If `is_paused === true` on any heartbeat sync, the hook dispatches `TIMER_IDLE_WARNING_EVENT` so Layout remains in warned state across page navigations

### Production Safety

- Schema migration is backward-compatible: new fields are nullable with defaults
- Existing `stop` endpoint and `stopActiveTimerWithReason` function are **unchanged**
- Only the `browser_inactive` branch in `idleTracker.ts` changes behavior
- `idle_timeout` and `heartbeat_missing` still auto-stop (protecting against truly abandoned sessions)
- If `resumeActiveTimer` is called on a non-paused timer, it is a no-op (guard clause)
- Feature is entirely within the authenticated app — no public surface changes

---

## Files Changed Summary

### New files
| File | Purpose |
|---|---|
| `frontend/src/pages/Demo.tsx` | Guided tour public route |
| `frontend/src/pages/Demo.css` | Tour styles |
| `backend/src/routes/contactRoutes.ts` | Request-access API route |
| `backend/src/controllers/contactController.ts` | Request-access handler |
| `backend/prisma/migrations/*/migration.sql` | AccessRequest table + ActiveTimer pause fields |

### Modified files
| File | Change | Risk |
|---|---|---|
| `frontend/src/App.tsx` | Add `/demo` route | Additive only |
| `frontend/src/pages/Landing.tsx` | Add AI section + gallery section + demo CTAs | Additive only |
| `frontend/src/pages/Landing.css` | Add styles for new sections | Additive only |
| `frontend/src/pages/RequestAccess.tsx` | Replace mailto: with fetch() | Isolated to this page |
| `frontend/src/components/Layout.tsx` | Upgrade idle dialog (pause/resume) + resume banner + demo banner | Targeted, no structural change |
| `frontend/src/hooks/useActiveTimerHeartbeat.ts` | Expose `is_paused` from sync, dispatch warning if paused on return | Additive logic only |
| `backend/src/app.ts` (or routes index) | Mount contactRoutes, add timers/pause and timers/resume | Additive only |
| `backend/prisma/schema.prisma` | Add AccessRequest model + 3 pause fields on ActiveTimer | Backward-compatible migration |
| `backend/prisma/seed.ts` | Add demo user seeding (behind env flag) | Guarded by `SEED_DEMO_USER=true` |
| `backend/src/routes/cronRoutes.ts` | Add demo reset endpoint (24h rolling) | Additive only |
| `backend/src/routes/timerRoutes.ts` | Add pause + resume endpoints | Additive only |
| `backend/src/services/activeTimerService.ts` | Add `pauseActiveTimer` + `resumeActiveTimer` exports | Additive only |
| `backend/src/workers/idleTracker.ts` | `browser_inactive` path → pause instead of stop | Targeted change, 3 lines |

### New env vars required
| Var | Where | Required? |
|---|---|---|
| `SEED_DEMO_USER` | Backend | No (defaults false) |
| `SEED_DEMO_PASSWORD` | Backend | Only if SEED_DEMO_USER=true |
| `RESEND_API_KEY` | Backend | Already exists in prod |

---

## Deployment Order

1. Deploy backend with new migration (`prisma migrate deploy`)
2. Set `SEED_DEMO_USER=true` and `SEED_DEMO_PASSWORD=<value>` in backend prod env
3. Run seed to create demo user
4. Verify `/api/v1/health` and `/api/v1/contact/request-access` (POST)
5. Deploy frontend
6. Smoke check: `/demo` tour, request-access form, landing AI section, gallery
7. Capture and drop authenticated screenshots into `frontend/public/screenshots/`
8. Redeploy frontend once screenshots are ready

---

## New Env Vars Required
| Var | Where | Required? |
|---|---|---|
| `SEED_DEMO_USER` | Backend | No (defaults false) |
| `SEED_DEMO_PASSWORD` | Backend | Only if SEED_DEMO_USER=true |
| `RESEND_API_KEY` | Backend | Already exists in prod |

---

## Deployment Order

1. Deploy backend with new migration (`prisma migrate deploy`)
2. Set `SEED_DEMO_USER=true` and `SEED_DEMO_PASSWORD=<value>` in backend prod env
3. Run seed to create demo user
4. Verify `/api/v1/health`, `POST /api/v1/contact/request-access`, `POST /api/v1/timers/pause`, `POST /api/v1/timers/resume`
5. Deploy frontend
6. Smoke check: `/demo` tour, request-access form, landing AI section, gallery (all 6 images), idle pause dialog, resume banner

---

## Success Criteria

- [ ] `/demo` is publicly accessible without auth, tour navigates all 6 stops
- [ ] Demo login pre-fills credentials and shows demo banner inside the app
- [ ] Demo data older than 24 hours is deleted on each hourly cron run; fresh seed entries replace them
- [ ] Request-access form submits without opening mail client; admin receives Resend notification; visitor receives receipt email; `AccessRequest` row persists in DB
- [ ] AI section visible on landing page between Demo Walkthrough and User Roles sections — 4 cards + trust line
- [ ] Gallery renders with role tabs and lightbox; all 6 authenticated screenshots display correctly
- [ ] When browser goes idle with an active timer, the timer is paused (not stopped); `is_paused=true` set in DB
- [ ] Idle dialog updated to show "Timer Paused" with Resume and "I'm done" actions
- [ ] On browser return, resume banner appears if timer is paused; clicking Resume calls `/timers/resume` and restores tracking
- [ ] Paused duration is excluded from final time entry duration on stop
- [ ] `idle_timeout` and `heartbeat_missing` paths still auto-stop (unchanged behavior)
- [ ] No existing routes, auth flows, or non-targeted DB models are altered
- [ ] Frontend and backend build with zero errors
- [ ] Existing e2e and unit tests pass unchanged
