# Premium Launch Enhancements — Design Spec

Date: 2026-04-13  
Status: Approved  
Production safety constraint: **All changes are strictly additive. Zero modifications to existing auth flows, protected routes, seeded users, CORS config, or live DB models.**

---

## Problem Statement

The marketing report (2026-04-13) identified four UX/messaging weaknesses impacting the premium launch:

1. No public self-serve in-product demo environment
2. Request-access flow is mail-client dependent (less premium than in-app submission)
3. AI narrative is present but under-explained in public-facing messaging
4. Authenticated proof visuals are missing for premium launch credibility

---

## Production Safety Principles

These rules apply to every task in this spec:

- **No changes to existing routes** — only new routes added
- **No changes to existing Prisma models** — only new model added via migration
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

**Demo data reset:**
- New cron endpoint: `POST /api/v1/cron/reset-demo` (protected by `CRON_SECRET`)
- Deletes all `TimeEntry` and `ActiveTimer` rows for the demo user
- Re-seeds with a clean set of representative entries
- Scheduled weekly via Vercel cron or external scheduler

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

**Screenshot capture guide (for team):**
1. Log in as Admin at `https://timer.dev.webforxtech.com`
2. Capture at 1440×900 viewport minimum
3. Use PNG or WEBP format
4. Name files exactly as listed in the table above
5. Place in `frontend/public/screenshots/`
6. No code changes needed — gallery automatically shows the images

---

## Files Changed Summary

### New files
| File | Purpose |
|---|---|
| `frontend/src/pages/Demo.tsx` | Guided tour public route |
| `frontend/src/pages/Demo.css` | Tour styles |
| `backend/src/routes/contactRoutes.ts` | Request-access API route |
| `backend/src/controllers/contactController.ts` | Request-access handler |
| `backend/prisma/migrations/*/migration.sql` | AccessRequest table |

### Modified files
| File | Change | Risk |
|---|---|---|
| `frontend/src/App.tsx` | Add `/demo` route | Additive only |
| `frontend/src/pages/Landing.tsx` | Add AI section + gallery section + demo CTAs | Additive only |
| `frontend/src/pages/Landing.css` | Add styles for new sections | Additive only |
| `frontend/src/pages/RequestAccess.tsx` | Replace mailto: with fetch() | Isolated to this page |
| `frontend/src/components/Layout.tsx` | Add conditional demo banner | Conditional render, no logic change |
| `backend/src/app.ts` (or routes index) | Mount contactRoutes | Additive only |
| `backend/prisma/schema.prisma` | Add AccessRequest model | New model, no existing model changes |
| `backend/prisma/seed.ts` | Add demo user seeding (behind env flag) | Guarded by `SEED_DEMO_USER=true` |
| `backend/src/routes/cronRoutes.ts` | Add demo reset endpoint | Additive only |

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

## Success Criteria

- [ ] `/demo` is publicly accessible without auth, tour navigates all 6 stops
- [ ] Demo login pre-fills credentials and shows demo banner inside the app
- [ ] Request-access form submits without opening mail client, admin receives Resend email, visitor receives receipt
- [ ] `AccessRequest` rows visible in DB after submission
- [ ] AI section visible on landing page between Demo and Roles sections
- [ ] Gallery renders with role tabs and lightbox; placeholder shown for missing images
- [ ] No existing routes, auth flows, or DB models are altered
- [ ] Frontend and backend build with zero errors
- [ ] Existing e2e and unit tests pass unchanged
