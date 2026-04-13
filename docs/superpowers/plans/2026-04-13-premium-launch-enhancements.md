# Premium Launch Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five production-safe enhancements: self-serve demo environment (guided tour + demo login), in-app request-access API pipeline, AI narrative section on landing, screenshot gallery, and idle timer pause-instead-of-stop with resume banner.

**Architecture:** Two deployment phases — Phase 1 deploys backend schema + API changes first; Phase 2 deploys all frontend changes after Phase 1 is live. Every change is additive except the targeted idle-pause modification to `idleTracker.ts` and duration calculation in `timeEntryController.ts`.

**Tech Stack:** Express + Prisma + PostgreSQL (backend), React + Vite + TypeScript (frontend), Resend (email), Jest + Supertest (backend tests), Vitest (frontend unit tests)

**Spec:** `docs/superpowers/specs/2026-04-13-premium-launch-enhancements-design.md`

---

## File Map

### Phase 1 — Backend

| File | Action | Responsibility |
|---|---|---|
| `backend/prisma/schema.prisma` | Modify | Add `AccessRequest` model + 3 pause fields to `ActiveTimer` |
| `backend/prisma/migrations/*/migration.sql` | Create | Generated migration file |
| `backend/src/services/activeTimerService.ts` | Modify | Add `pauseActiveTimer`, `resumeActiveTimer`; fix duration deduction in `stopActiveTimerWithReason` |
| `backend/src/controllers/timeEntryController.ts` | Modify | Fix `stopTimer` duration to deduct `paused_duration_seconds` |
| `backend/src/routes/timeEntryRoutes.ts` | Modify | Add `POST /pause` and `POST /resume` routes |
| `backend/src/workers/idleTracker.ts` | Modify | `browser_inactive` path calls `pauseActiveTimer` instead of `stopActiveTimerWithReason` |
| `backend/src/services/emailService.ts` | Modify | Add `sendAccessRequestNotification` + `sendAccessRequestReceipt` |
| `backend/src/controllers/contactController.ts` | Create | Validate input, write `AccessRequest` to DB, send both emails |
| `backend/src/routes/contactRoutes.ts` | Create | `POST /request-access` with rate limiter |
| `backend/src/index.ts` | Modify | Mount `contactRoutes` at `/api/v1/contact` |
| `backend/prisma/seed.ts` | Modify | Seed demo user behind `SEED_DEMO_USER=true` env guard |
| `backend/src/controllers/cronController.ts` | Modify | Add `resetDemoData` handler |
| `backend/src/routes/cronRoutes.ts` | Modify | Add `POST /reset-demo` route |
| `backend/tests/idleTracker.test.ts` | Modify | Update `browser_inactive` test expectation to `pauseActiveTimer` |
| `backend/tests/contactRoutes.test.ts` | Create | Tests for request-access endpoint |
| `backend/tests/activeTimerService.test.ts` | Create | Tests for `pauseActiveTimer` + `resumeActiveTimer` |

### Phase 2 — Frontend

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/pages/RequestAccess.tsx` | Modify | Replace `mailto:` with `fetch()` to new API |
| `frontend/src/pages/Landing.tsx` | Modify | Add AI section, gallery section, demo CTAs |
| `frontend/src/pages/Landing.css` | Modify | Styles for new landing sections |
| `frontend/src/pages/Demo.tsx` | Create | 6-stop guided tour public route |
| `frontend/src/pages/Demo.css` | Create | Tour overlay and mockup styles |
| `frontend/src/App.tsx` | Modify | Add `/demo` public route |
| `frontend/src/hooks/useActiveTimerHeartbeat.ts` | Modify | Dispatch `TIMER_PAUSED_EVENT` when sync reveals paused timer |
| `frontend/src/components/Layout.tsx` | Modify | Upgrade idle dialog to pause/resume; add resume banner; add demo banner |

---

## ⚠️ DEPLOYMENT CHECKPOINT

**After Task 8, deploy backend before continuing to Task 9.**

```bash
# In backend/:
npm run build                          # must pass
npx prisma migrate deploy              # apply schema migration
# Set in Vercel backend env:
#   SEED_DEMO_USER=true
#   SEED_DEMO_PASSWORD=<secure-value>
npx prisma db seed                     # seeds demo user
vercel deploy --prod                   # deploy backend
# Verify:
curl https://vercel-backend-xi-three.vercel.app/api/v1/health
```

---

## PHASE 1 — Backend

---

### Task 1: Prisma Schema — AccessRequest model + ActiveTimer pause fields

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add new fields and model to schema**

Open `backend/prisma/schema.prisma`. Add these three fields to the `ActiveTimer` model immediately after the `heartbeat_state` field:

```prisma
model ActiveTimer {
  id               String    @id @default(uuid())
  user_id          String    @unique
  project_id       String?
  task_description String
  start_time       DateTime
  persisted_state  Json      @default("{}")
  last_active_ping DateTime? @default(now())
  last_heartbeat_at DateTime? @default(now())
  last_client_activity_at DateTime?
  client_visibility String?
  client_has_focus Boolean?
  heartbeat_state  Json      @default("{}")
  is_paused              Boolean   @default(false)
  paused_at              DateTime?
  paused_duration_seconds Int       @default(0)

  user    User     @relation(fields: [user_id], references: [id])
  project Project? @relation(fields: [project_id], references: [id])
}
```

Then add the `AccessRequest` model at the bottom of the schema file (before the final closing brace or after the last model):

```prisma
model AccessRequest {
  id        String   @id @default(cuid())
  fullName  String
  workEmail String
  company   String
  teamSize  String
  details   String?
  status    String   @default("pending")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Generate and apply migration**

```bash
cd backend
npx prisma migrate dev --name add_pause_fields_and_access_request
```

Expected output: migration file created in `prisma/migrations/`, schema client regenerated.

- [ ] **Step 3: Verify schema drift check passes**

```bash
npm run schema:check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): add ActiveTimer pause fields and AccessRequest model"
```

---

### Task 2: activeTimerService — pause, resume, and duration deduction

**Files:**
- Modify: `backend/src/services/activeTimerService.ts`

- [ ] **Step 1: Write failing tests for pauseActiveTimer and resumeActiveTimer**

Create `backend/tests/activeTimerService.test.ts`:

```typescript
jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        activeTimer: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        notification: { create: jest.fn() },
        auditLog: { create: jest.fn() },
    },
}));

import prisma from '../src/config/db';
import { pauseActiveTimer, resumeActiveTimer } from '../src/services/activeTimerService';

describe('pauseActiveTimer', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sets is_paused and paused_at on the active timer', async () => {
        const fakeTimer = {
            id: 'timer-1',
            user_id: 'user-1',
            task_description: 'Test task',
            is_paused: false,
            paused_at: null,
            paused_duration_seconds: 0,
        };
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(fakeTimer);
        (prisma.activeTimer.update as jest.Mock).mockResolvedValue({ ...fakeTimer, is_paused: true });
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

        await pauseActiveTimer('user-1', 'browser_inactive');

        expect(prisma.activeTimer.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { user_id: 'user-1' },
                data: expect.objectContaining({ is_paused: true }),
            }),
        );
        expect(prisma.notification.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ type: 'timer_paused' }),
            }),
        );
    });

    it('is a no-op if the timer is already paused', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue({
            id: 'timer-1', user_id: 'user-1', is_paused: true,
        });

        await pauseActiveTimer('user-1', 'browser_inactive');

        expect(prisma.activeTimer.update).not.toHaveBeenCalled();
    });

    it('is a no-op if no active timer exists', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(null);

        await pauseActiveTimer('user-1', 'browser_inactive');

        expect(prisma.activeTimer.update).not.toHaveBeenCalled();
    });
});

describe('resumeActiveTimer', () => {
    beforeEach(() => jest.clearAllMocks());

    it('clears is_paused and accumulates paused_duration_seconds', async () => {
        const pausedAt = new Date(Date.now() - 120_000); // 2 minutes ago
        const fakeTimer = {
            id: 'timer-1',
            user_id: 'user-1',
            is_paused: true,
            paused_at: pausedAt,
            paused_duration_seconds: 60, // already had 60s from a prior pause cycle
        };
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(fakeTimer);
        (prisma.activeTimer.update as jest.Mock).mockResolvedValue({});
        (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

        const totalPaused = await resumeActiveTimer('user-1');

        // 60 existing + ~120 new = ~180
        expect(totalPaused).toBeGreaterThanOrEqual(170);
        expect(prisma.activeTimer.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    is_paused: false,
                    paused_at: null,
                }),
            }),
        );
    });

    it('returns 0 and is a no-op if timer is not paused', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue({
            id: 'timer-1', user_id: 'user-1', is_paused: false, paused_at: null, paused_duration_seconds: 0,
        });

        const result = await resumeActiveTimer('user-1');
        expect(result).toBe(0);
        expect(prisma.activeTimer.update).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npx jest tests/activeTimerService.test.ts --no-coverage
```

Expected: `pauseActiveTimer is not a function` or similar import error.

- [ ] **Step 3: Implement pauseActiveTimer and resumeActiveTimer**

Append to the bottom of `backend/src/services/activeTimerService.ts` (after the closing brace of `stopActiveTimerWithReason`):

```typescript
export const pauseActiveTimer = async (userId: string, reason: string): Promise<void> => {
    const timer = await prisma.activeTimer.findUnique({ where: { user_id: userId } });
    if (!timer || timer.is_paused) return;

    await prisma.activeTimer.update({
        where: { user_id: userId },
        data: {
            is_paused: true,
            paused_at: new Date(),
        },
    });

    await prisma.notification.create({
        data: {
            user_id: userId,
            message: `Your timer was paused due to inactivity. Resume when you're back — your time is saved.`,
            type: 'timer_paused',
        },
    });

    await prisma.auditLog.create({
        data: {
            user_id: userId,
            action: 'timer_paused',
            resource: 'active_timer',
            metadata: { reason, active_timer_id: timer.id },
        },
    });
};

export const resumeActiveTimer = async (userId: string): Promise<number> => {
    const timer = await prisma.activeTimer.findUnique({ where: { user_id: userId } });
    if (!timer || !timer.is_paused || !timer.paused_at) return 0;

    const now = new Date();
    const newPausedSeconds = Math.floor((now.getTime() - timer.paused_at.getTime()) / 1000);
    const totalPausedSeconds = timer.paused_duration_seconds + newPausedSeconds;

    await prisma.activeTimer.update({
        where: { user_id: userId },
        data: {
            is_paused: false,
            paused_at: null,
            paused_duration_seconds: totalPausedSeconds,
        },
    });

    await prisma.auditLog.create({
        data: {
            user_id: userId,
            action: 'timer_resumed',
            resource: 'active_timer',
            metadata: {
                active_timer_id: timer.id,
                new_paused_seconds: newPausedSeconds,
                total_paused_seconds: totalPausedSeconds,
            },
        },
    });

    return totalPausedSeconds;
};
```

- [ ] **Step 4: Fix duration deduction in stopActiveTimerWithReason**

In `backend/src/services/activeTimerService.ts`, find this line inside `stopActiveTimerWithReason`:

```typescript
const duration = Math.max(Math.floor((endTime.getTime() - startTime.getTime()) / 1000), 1);
```

Replace it with:

```typescript
const rawDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
const pausedSeconds = activeTimer.paused_duration_seconds ?? 0;
const duration = Math.max(rawDuration - pausedSeconds, 1);
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend && npx jest tests/activeTimerService.test.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/activeTimerService.ts backend/tests/activeTimerService.test.ts
git commit -m "feat(timers): add pauseActiveTimer and resumeActiveTimer; deduct pause duration from auto-stop"
```

---

### Task 3: stopTimer controller — deduct paused duration on manual stop

**Files:**
- Modify: `backend/src/controllers/timeEntryController.ts`

- [ ] **Step 1: Fix duration calculation in stopTimer**

In `backend/src/controllers/timeEntryController.ts`, find the `stopTimer` function. Locate this line (around line 80):

```typescript
const duration = Math.floor((end_time.getTime() - new Date(activeTimer.start_time).getTime()) / 1000);
```

Replace it with:

```typescript
const rawDuration = Math.floor((end_time.getTime() - new Date(activeTimer.start_time).getTime()) / 1000);
const pausedSeconds = activeTimer.paused_duration_seconds ?? 0;
const duration = Math.max(rawDuration - pausedSeconds, 1);
```

- [ ] **Step 2: Build to confirm no type errors**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/timeEntryController.ts
git commit -m "fix(timers): deduct paused_duration_seconds from manual stop duration"
```

---

### Task 4: timerRoutes — pause and resume API endpoints

**Files:**
- Modify: `backend/src/routes/timeEntryRoutes.ts`
- Modify: `backend/src/controllers/timeEntryController.ts`

- [ ] **Step 1: Add pause and resume controller functions**

In `backend/src/controllers/timeEntryController.ts`, add these two exports after the `stopTimer` function:

```typescript
export const pauseTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    try {
        const timer = await prisma.activeTimer.findUnique({ where: { user_id: userId } });
        if (!timer) { res.status(404).json({ message: 'No active timer found.' }); return; }
        if (timer.is_paused) { res.status(200).json({ ok: true, message: 'Timer already paused.', pausedAt: timer.paused_at }); return; }

        await pauseActiveTimer(userId, 'user_requested');
        res.status(200).json({ ok: true, pausedAt: new Date().toISOString() });
    } catch (error) {
        console.error('[pauseTimer]', error);
        res.status(500).json({ message: 'Failed to pause timer.' });
    }
};

export const resumeTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    try {
        const timer = await prisma.activeTimer.findUnique({ where: { user_id: userId } });
        if (!timer) { res.status(404).json({ message: 'No active timer found.' }); return; }
        if (!timer.is_paused) { res.status(200).json({ ok: true, message: 'Timer is not paused.' }); return; }

        const totalPausedSeconds = await resumeActiveTimer(userId);
        res.status(200).json({ ok: true, resumedAt: new Date().toISOString(), pausedDurationSeconds: totalPausedSeconds });
    } catch (error) {
        console.error('[resumeTimer]', error);
        res.status(500).json({ message: 'Failed to resume timer.' });
    }
};
```

Also add the imports at the top of the controller file (add to the existing import from `activeTimerService`):

```typescript
import { pauseActiveTimer, resumeActiveTimer } from '../services/activeTimerService';
```

- [ ] **Step 2: Add routes to timeEntryRoutes.ts**

In `backend/src/routes/timeEntryRoutes.ts`, add after the existing `router.post('/stop', stopTimer);` line:

```typescript
router.post('/pause', pauseTimer);
router.post('/resume', resumeTimer);
```

Also update the import at the top of the file to include the new exports:

```typescript
import { startTimer, stopTimer, pauseTimer, resumeTimer, manualEntry, getMyEntries, pingTimer, getPendingTimesheets, reviewTimesheet, updateEntry, deleteEntry, duplicateEntry } from '../controllers/timeEntryController';
```

- [ ] **Step 3: Build to confirm no type errors**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/timeEntryRoutes.ts backend/src/controllers/timeEntryController.ts
git commit -m "feat(timers): add POST /timers/pause and POST /timers/resume endpoints"
```

---

### Task 5: idleTracker — browser_inactive path uses pause instead of stop

**Files:**
- Modify: `backend/src/workers/idleTracker.ts`
- Modify: `backend/tests/idleTracker.test.ts`

- [ ] **Step 1: Update the existing browser_inactive test**

In `backend/tests/idleTracker.test.ts`, the mock for `activeTimerService` currently only mocks `stopActiveTimerWithReason`. Update the mock block to also include `pauseActiveTimer`:

```typescript
jest.mock('../src/services/activeTimerService', () => ({
    stopActiveTimerWithReason: jest.fn(),
    pauseActiveTimer: jest.fn(),
    resumeActiveTimer: jest.fn(),
}));
```

Add this import after the existing imports:

```typescript
import { stopActiveTimerWithReason, pauseActiveTimer } from '../src/services/activeTimerService';
```

Find the existing test that verifies `browser_inactive` auto-stop (the test that sets `client_visibility: 'hidden'` and expects `stopActiveTimerWithReason` to be called). Update its assertion:

```typescript
it('pauses timers when browser is inactive', async () => {
    (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([
        {
            id: 'timer-1',
            user_id: 'user-1',
            start_time: new Date(Date.now() - 2 * 60 * 60 * 1000),
            last_active_ping: new Date(Date.now() - 40 * 60 * 1000),
            last_heartbeat_at: new Date(Date.now() - 40 * 60 * 1000),
            last_client_activity_at: new Date(Date.now() - 40 * 60 * 1000),
            client_visibility: 'hidden',
            client_has_focus: false,
            is_paused: false,
            paused_duration_seconds: 0,
        },
    ]);

    await checkIdleTimers();

    expect(pauseActiveTimer).toHaveBeenCalledWith('user-1', 'browser_inactive');
    expect(stopActiveTimerWithReason).not.toHaveBeenCalled();
});
```

Also add `is_paused: false, paused_duration_seconds: 0` fields to all existing timer fixture objects in the test file so they match the updated schema.

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npx jest tests/idleTracker.test.ts --no-coverage
```

Expected: test fails (still calls `stopActiveTimerWithReason` for `browser_inactive`).

- [ ] **Step 3: Update idleTracker.ts**

In `backend/src/workers/idleTracker.ts`, add the import for `pauseActiveTimer`:

```typescript
import { stopActiveTimerWithReason, pauseActiveTimer } from '../services/activeTimerService';
```

Find the auto-stop block (around line 24–33). Replace the `browser_inactive` path:

```typescript
// Before:
if (clientActivityAgeMs >= autoStopThresholdMs || heartbeatAgeMs >= autoStopThresholdMs) {
    await stopActiveTimerWithReason({
        userId: timer.user_id,
        reason: browserInactive
            ? 'browser_inactive'
            : (clientActivityAgeMs >= autoStopThresholdMs ? 'idle_timeout' : 'heartbeat_missing'),
        triggeredAt: now,
    });
    console.log(`[Worker] Timer auto-stopped for user ${timer.user_id}`);
    continue;
}

// After:
if (clientActivityAgeMs >= autoStopThresholdMs || heartbeatAgeMs >= autoStopThresholdMs) {
    if (browserInactive && !timer.is_paused) {
        await pauseActiveTimer(timer.user_id, 'browser_inactive');
        console.log(`[Worker] Timer paused (browser inactive) for user ${timer.user_id}`);
    } else if (!browserInactive) {
        const reason = clientActivityAgeMs >= autoStopThresholdMs ? 'idle_timeout' : 'heartbeat_missing';
        await stopActiveTimerWithReason({ userId: timer.user_id, reason, triggeredAt: now });
        console.log(`[Worker] Timer auto-stopped (${reason}) for user ${timer.user_id}`);
    }
    continue;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && npx jest tests/idleTracker.test.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/workers/idleTracker.ts backend/tests/idleTracker.test.ts
git commit -m "feat(idle): pause timer on browser_inactive instead of auto-stop"
```

---

### Task 6: emailService — request-access email templates

**Files:**
- Modify: `backend/src/services/emailService.ts`

- [ ] **Step 1: Add request-access email functions**

At the bottom of `backend/src/services/emailService.ts`, append:

```typescript
// ─── Access request — admin notification ────────────────────────────────────

export interface AccessRequestNotificationOptions {
    to: string;
    fullName: string;
    workEmail: string;
    company: string;
    teamSize: string;
    details?: string;
}

export const sendAccessRequestNotification = async (opts: AccessRequestNotificationOptions): Promise<void> => {
    const client = getClient();
    if (!client) {
        console.log(`[email:dev] Access request notification skipped (no RESEND_API_KEY) — ${opts.workEmail} from ${opts.company}`);
        return;
    }

    const body = `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0f172a;">New Access Request</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
        A new workspace access request has been submitted.
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;width:100%;margin-bottom:4px;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Request details</p>
          <p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>Name:</strong> ${opts.fullName}</p>
          <p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>Email:</strong> ${opts.workEmail}</p>
          <p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>Company:</strong> ${opts.company}</p>
          <p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>Team size:</strong> ${opts.teamSize}</p>
          ${opts.details ? `<p style="margin:0;font-size:14px;color:#0f172a;"><strong>Details:</strong> ${opts.details}</p>` : ''}
        </td></tr>
      </table>
    `;

    await send(client, {
        from: env.emailFrom,
        to: opts.to,
        subject: `New access request — ${opts.company} (${opts.teamSize})`,
        html: BASE_HTML('New Access Request', body),
    });
};

// ─── Access request — visitor receipt ───────────────────────────────────────

export interface AccessRequestReceiptOptions {
    to: string;
    fullName: string;
}

export const sendAccessRequestReceipt = async (opts: AccessRequestReceiptOptions): Promise<void> => {
    const client = getClient();
    if (!client) {
        console.log(`[email:dev] Access request receipt skipped (no RESEND_API_KEY) — ${opts.to}`);
        return;
    }

    const body = `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0f172a;">We received your request, ${opts.fullName}.</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
        Thank you for your interest in Web Forx Time Tracker. Our team will review your request and reach out within 1–2 business days.
      </p>
      <p style="margin:0;font-size:15px;color:#475569;line-height:1.6;">
        In the meantime, you can explore the product tour at <a href="https://timer.dev.webforxtech.com/demo" style="color:#354ac0;">timer.dev.webforxtech.com/demo</a>.
      </p>
    `;

    await send(client, {
        from: env.emailFrom,
        to: opts.to,
        subject: 'We received your request — Web Forx Time Tracker',
        html: BASE_HTML('Request Received', body),
    });
};
```

- [ ] **Step 2: Build to confirm no type errors**

```bash
cd backend && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/emailService.ts
git commit -m "feat(email): add request-access notification and receipt templates"
```

---

### Task 7: contactController + contactRoutes — request-access API

**Files:**
- Create: `backend/src/controllers/contactController.ts`
- Create: `backend/src/routes/contactRoutes.ts`
- Modify: `backend/src/index.ts`
- Create: `backend/tests/contactRoutes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/contactRoutes.test.ts`:

```typescript
import request from 'supertest';
import express from 'express';

const mockEnv = {
    nodeEnv: 'test',
    jwtSecret: 'test-secret',
    resendApiKey: '',
    emailFrom: 'test@webforxtech.com',
};

jest.mock('../src/config/env', () => ({ __esModule: true, env: mockEnv }));
jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        accessRequest: { create: jest.fn() },
    },
}));
jest.mock('../src/services/emailService', () => ({
    sendAccessRequestNotification: jest.fn().mockResolvedValue(undefined),
    sendAccessRequestReceipt: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../src/config/db';
import contactRoutes from '../src/routes/contactRoutes';

const app = express();
app.use(express.json());
app.use('/api/v1/contact', contactRoutes);

describe('POST /api/v1/contact/request-access', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 200 and persists the request when input is valid', async () => {
        (prisma.accessRequest.create as jest.Mock).mockResolvedValue({ id: 'req-1' });

        const res = await request(app)
            .post('/api/v1/contact/request-access')
            .send({
                fullName: 'Test User',
                workEmail: 'test@company.com',
                company: 'Acme Corp',
                teamSize: '1-10',
                details: 'Looking forward to using this.',
            });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(prisma.accessRequest.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    fullName: 'Test User',
                    workEmail: 'test@company.com',
                    company: 'Acme Corp',
                }),
            }),
        );
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await request(app)
            .post('/api/v1/contact/request-access')
            .send({ fullName: 'Test' });

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
    });

    it('returns 400 for invalid email format', async () => {
        const res = await request(app)
            .post('/api/v1/contact/request-access')
            .send({
                fullName: 'Test User',
                workEmail: 'not-an-email',
                company: 'Acme',
                teamSize: '1-10',
            });

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npx jest tests/contactRoutes.test.ts --no-coverage
```

Expected: module not found or route 404.

- [ ] **Step 3: Create contactController.ts**

Create `backend/src/controllers/contactController.ts`:

```typescript
import type { Request, Response } from 'express';
import prisma from '../config/db';
import { sendAccessRequestNotification, sendAccessRequestReceipt } from '../services/emailService';

const ADMIN_EMAIL = 'admin@webforxtech.com';
const VALID_TEAM_SIZES = ['1-10', '11-30', '31-75', '76+'];

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const submitAccessRequest = async (req: Request, res: Response): Promise<void> => {
    const { fullName, workEmail, company, teamSize, details } = req.body as Record<string, unknown>;

    if (
        typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100 ||
        typeof workEmail !== 'string' || !isValidEmail(workEmail.trim()) ||
        typeof company !== 'string' || company.trim().length < 2 || company.trim().length > 100 ||
        typeof teamSize !== 'string' || !VALID_TEAM_SIZES.includes(teamSize)
    ) {
        res.status(400).json({ ok: false, error: 'Please fill in all required fields with valid values.' });
        return;
    }

    if (typeof details === 'string' && details.length > 1000) {
        res.status(400).json({ ok: false, error: 'Additional details must be under 1000 characters.' });
        return;
    }

    try {
        await prisma.accessRequest.create({
            data: {
                fullName: fullName.trim(),
                workEmail: workEmail.trim().toLowerCase(),
                company: company.trim(),
                teamSize,
                details: typeof details === 'string' ? details.trim() : undefined,
            },
        });

        await Promise.allSettled([
            sendAccessRequestNotification({
                to: ADMIN_EMAIL,
                fullName: fullName.trim(),
                workEmail: workEmail.trim(),
                company: company.trim(),
                teamSize,
                details: typeof details === 'string' ? details.trim() : undefined,
            }),
            sendAccessRequestReceipt({
                to: workEmail.trim().toLowerCase(),
                fullName: fullName.trim(),
            }),
        ]);

        res.status(200).json({ ok: true, message: 'Request received.' });
    } catch (error) {
        console.error('[contactController] Failed to submit access request:', error);
        res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
    }
};
```

- [ ] **Step 4: Create contactRoutes.ts**

Create `backend/src/routes/contactRoutes.ts`:

```typescript
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitAccessRequest } from '../controllers/contactController';

const router = Router();

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests. Please try again later.' },
});

router.post('/request-access', contactLimiter, submitAccessRequest);

export default router;
```

- [ ] **Step 5: Mount in index.ts**

In `backend/src/index.ts`, add after the existing imports:

```typescript
import contactRoutes from './routes/contactRoutes';
```

Add after `app.use('/api/v1/public', publicRoutes);`:

```typescript
app.use('/api/v1/contact', contactRoutes);
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd backend && npx jest tests/contactRoutes.test.ts --no-coverage
```

Expected: all 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/contactController.ts backend/src/routes/contactRoutes.ts backend/src/index.ts backend/tests/contactRoutes.test.ts
git commit -m "feat(contact): add POST /api/v1/contact/request-access with DB persistence and Resend emails"
```

---

### Task 8: Demo user seed + 24hr rolling cron reset

**Files:**
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/src/controllers/cronController.ts`
- Modify: `backend/src/routes/cronRoutes.ts`

- [ ] **Step 1: Add demo user seed block**

In `backend/prisma/seed.ts`, add after the employee user block (after the `console.log('✅ Employee user seeded...')` line):

```typescript
// ── Demo user (self-serve public demo) ───────────────────────────
if (process.env.SEED_DEMO_USER === 'true') {
    const demoPassword = process.env.SEED_DEMO_PASSWORD;
    if (!demoPassword) {
        throw new Error('SEED_DEMO_USER=true but SEED_DEMO_PASSWORD is not set.');
    }

    if (employeeRole) {
        const demoUser = await prisma.user.upsert({
            where: { email: 'demo@webforxtech.com' },
            update: {
                first_name: 'Demo',
                last_name: 'User',
                role_id: employeeRole.id,
                is_active: true,
            },
            create: {
                email: 'demo@webforxtech.com',
                first_name: 'Demo',
                last_name: 'User',
                password_hash: await bcrypt.hash(demoPassword, 10),
                role_id: employeeRole.id,
                is_active: true,
            },
        });
        console.log(`✅ Demo user seeded: ${demoUser.email}`);
    }
}
```

- [ ] **Step 2: Add demo reset cron handler**

In `backend/src/controllers/cronController.ts`, add this export at the bottom:

```typescript
export const resetDemoData = async (_req: Request, res: Response): Promise<void> => {
    const DEMO_EMAIL = 'demo@webforxtech.com';
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    try {
        const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
        if (!demoUser) {
            res.status(200).json({ status: 'skipped', message: 'Demo user not found.' });
            return;
        }

        const userId = demoUser.id;

        // Always delete active timer for demo user (prevents stuck timers)
        await prisma.activeTimer.deleteMany({ where: { user_id: userId } });

        // Delete time entries older than 24h
        const deletedEntries = await prisma.timeEntry.deleteMany({
            where: { user_id: userId, start_time: { lt: cutoff } },
        });

        // Delete notifications older than 24h
        await prisma.notification.deleteMany({
            where: { user_id: userId, created_at: { lt: cutoff } },
        });

        console.log(`[Cron] Demo reset: deleted ${deletedEntries.count} entries for ${DEMO_EMAIL}`);
        res.status(200).json({
            status: 'success',
            deletedEntries: deletedEntries.count,
        });
    } catch (error) {
        console.error('[Cron] Demo reset failed:', error);
        res.status(500).json({ status: 'error', message: 'Demo reset failed.' });
    }
};
```

- [ ] **Step 3: Add the route**

In `backend/src/routes/cronRoutes.ts`, add the import and route:

```typescript
import { runIdleChecks, runWorkloadChecks, runDailyReport, resetDemoData } from '../controllers/cronController';
```

Add after the last existing route:

```typescript
router.post('/reset-demo', resetDemoData);
```

- [ ] **Step 4: Build**

```bash
cd backend && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && npm test 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/seed.ts backend/src/controllers/cronController.ts backend/src/routes/cronRoutes.ts
git commit -m "feat(demo): seed demo user behind SEED_DEMO_USER flag; add 24hr rolling cron reset"
```

---

## ⚠️ DEPLOY BACKEND NOW

```bash
cd backend
npm run build
vercel deploy --prod
# Then in Vercel backend environment settings:
# Add: SEED_DEMO_USER=true, SEED_DEMO_PASSWORD=<secure-random-value>
# Then run seed:
npx prisma migrate deploy
npx prisma db seed
# Smoke check:
curl -X POST https://vercel-backend-xi-three.vercel.app/api/v1/contact/request-access \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Test","workEmail":"test@test.com","company":"Acme","teamSize":"1-10"}'
# Expected: {"ok":true,"message":"Request received."}
```

---

## PHASE 2 — Frontend

---

### Task 9: RequestAccess.tsx — replace mailto with fetch

**Files:**
- Modify: `frontend/src/pages/RequestAccess.tsx`

- [ ] **Step 1: Replace the submit handler**

In `frontend/src/pages/RequestAccess.tsx`, replace the entire component state and submit handler:

Replace the state declarations at the top of the `RequestAccess` component:

```typescript
const [submitted, setSubmitted] = useState(false);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [form, setForm] = useState({
  fullName: '',
  workEmail: '',
  company: '',
  teamSize: '1-10',
  details: '',
});
```

Replace the `handleSubmit` function entirely:

```typescript
const handleSubmit = async (event: React.FormEvent) => {
  event.preventDefault();
  setLoading(true);
  setError(null);

  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/contact/request-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };

    if (data.ok) {
      setSubmitted(true);
    } else {
      setError(data.error ?? 'Something went wrong. Please try again.');
    }
  } catch {
    setError('Could not connect to the server. Please check your connection and try again.');
  } finally {
    setLoading(false);
  }
};
```

Update the submit button to show loading state:

```tsx
<button type="submit" className="btn btn-primary login-btn" disabled={loading}>
  <Send size={16} />
  {loading ? 'Sending...' : 'Send Access Request'}
</button>
```

Add the error display above the submit button:

```tsx
{error && (
  <p role="alert" style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '8px' }}>
    {error}
  </p>
)}
```

Update the success state copy:

```tsx
<h1>Request Submitted</h1>
<p>
  Your request has been received. Check your email for a confirmation.
  Our team will reach out within 1–2 business days.
</p>
```

- [ ] **Step 2: Build to confirm no TypeScript errors**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/RequestAccess.tsx
git commit -m "feat(request-access): replace mailto with in-app API submission"
```

---

### Task 10: Landing.tsx — AI section

**Files:**
- Modify: `frontend/src/pages/Landing.tsx`
- Modify: `frontend/src/pages/Landing.css`

- [ ] **Step 1: Add AI feature data**

In `frontend/src/pages/Landing.tsx`, add this constant after the `benefits` array:

```typescript
const aiFeatures = [
  {
    icon: <Brain size={20} />,
    title: 'Workday Reconstruction',
    desc: 'When gaps appear in the daily log, the system analyses calendar events and activity signals to suggest missing time blocks — reducing context loss at end of day.',
  },
  {
    icon: <AlertTriangle size={20} />,
    title: 'Burnout Risk Detection',
    desc: 'Weekly hours are monitored per team member. Alerts surface when anyone approaches healthy workload thresholds — before damage is done.',
  },
  {
    icon: <Zap size={20} />,
    title: 'Approval Intelligence',
    desc: 'Timesheet entries are scored for anomalies — unusual durations, project mismatches, submission timing — so managers prioritise review on what matters.',
  },
  {
    icon: <TrendingUp size={20} />,
    title: '14-Day Capacity Forecast',
    desc: 'Using the last 7 days of tracked data, the platform projects each team member\'s load and overload risk over the next two weeks — enabling proactive planning.',
  },
];
```

Update the Lucide import line at the top to include the new icons:

```typescript
import {
  LayoutDashboard, Clock, Calendar, FileText, BarChart2, Users,
  ShieldCheck, Plug, CheckCircle2, ArrowRight,
  Eye, Briefcase, UserCheck, LockKeyhole,
  Brain, AlertTriangle, Zap, TrendingUp,
} from 'lucide-react';
```

- [ ] **Step 2: Insert AI section into the JSX**

In `Landing.tsx`, find the comment `{/* ── 6. User Roles ── */}`. Insert the AI section immediately before it:

```tsx
{/* ── 5b. AI Features ── */}
<section className="landing-section section-center" id="ai-features">
  <p className="section-label">AI-Powered Operations</p>
  <h2 className="section-heading">Intelligence Built Into Every Workflow</h2>
  <p className="section-subheading">
    Every insight is derived from real tracked time — not estimates or guesses.
  </p>
  <div className="ai-features-grid">
    {aiFeatures.map((f) => (
      <div className="ai-feature-card" key={f.title}>
        <div className="ai-feature-icon">{f.icon}</div>
        <h3>{f.title}</h3>
        <p>{f.desc}</p>
      </div>
    ))}
  </div>
  <p className="ai-trust-line">
    Built on real signals, not predictions. Every AI insight is derived from your team's actual tracked time data.
  </p>
</section>
```

Also add an "AI" nav button to the landing nav (alongside "Features" and "Demo"):

```tsx
<button type="button" className="btn btn-outline" onClick={() => scrollTo('ai-features')}>AI</button>
```

- [ ] **Step 3: Add CSS for AI section**

In `frontend/src/pages/Landing.css`, append:

```css
/* ── AI Features ── */
.ai-features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
  margin-top: 2.5rem;
}

.ai-feature-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 1.5rem;
  text-align: left;
  transition: box-shadow 0.2s;
}

.ai-feature-card:hover {
  box-shadow: 0 4px 20px rgba(79, 70, 229, 0.1);
}

.ai-feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #354ac0, #4f46e5);
  border-radius: 10px;
  color: #ffffff;
  margin-bottom: 1rem;
}

.ai-feature-card h3 {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 0.5rem;
}

.ai-feature-card p {
  font-size: 0.875rem;
  color: #64748b;
  line-height: 1.6;
  margin: 0;
}

.ai-trust-line {
  margin-top: 2rem;
  font-size: 0.875rem;
  color: #94a3b8;
  font-style: italic;
  text-align: center;
}
```

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Landing.tsx frontend/src/pages/Landing.css
git commit -m "feat(landing): add AI-Assisted Operations section with 4 feature cards"
```

---

### Task 11: Landing.tsx — screenshot gallery with lightbox

**Files:**
- Modify: `frontend/src/pages/Landing.tsx`
- Modify: `frontend/src/pages/Landing.css`

- [ ] **Step 1: Add gallery data and state**

In `frontend/src/pages/Landing.tsx`, add the gallery data constant after the `aiFeatures` array:

```typescript
type GalleryTab = 'all' | 'employee' | 'manager' | 'admin';

const galleryImages: Array<{ src: string; caption: string; role: GalleryTab }> = [
  { src: '/screenshots/dashboard.png', caption: 'Dashboard — daily totals and active timer', role: 'employee' },
  { src: '/screenshots/workday.png', caption: 'Workday — AI-assisted activity reconstruction', role: 'employee' },
  { src: '/screenshots/timeline.png', caption: 'Timeline — chronological daily log', role: 'employee' },
  { src: '/screenshots/reports.png', caption: 'Reports — team analytics and utilization', role: 'manager' },
  { src: '/screenshots/team.png', caption: 'Team — member directory and activity overview', role: 'manager' },
  { src: '/screenshots/admin.png', caption: 'Admin — organization controls and audit visibility', role: 'admin' },
];
```

Inside the `Landing` component, add these state variables (after the `activeDemo` state):

```typescript
const [galleryTab, setGalleryTab] = useState<GalleryTab>('all');
const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
```

- [ ] **Step 2: Add keyboard handler for lightbox**

Add this inside the `Landing` component (alongside the other `useEffect` / callback definitions):

```typescript
useEffect(() => {
  if (lightboxIndex === null) return;
  const filtered = galleryImages.filter((img) => galleryTab === 'all' || img.role === galleryTab);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setLightboxIndex(null);
    if (e.key === 'ArrowRight') setLightboxIndex((i) => (i === null ? null : (i + 1) % filtered.length));
    if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i === null ? null : (i - 1 + filtered.length) % filtered.length));
  };
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  return () => {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  };
}, [lightboxIndex, galleryTab]);
```

- [ ] **Step 3: Insert gallery section into JSX**

Find the comment `{/* ── 8. CTA Banner ── */}`. Insert the gallery section immediately before it:

```tsx
{/* ── 7b. Screenshot Gallery ── */}
<section className="landing-section section-center" id="gallery">
  <p className="section-label">In Action</p>
  <h2 className="section-heading">See the Platform</h2>
  <p className="section-subheading">Real views from the product — captured from a live workspace.</p>

  <div className="gallery-tabs" role="tablist" aria-label="Screenshot gallery tabs">
    {(['all', 'employee', 'manager', 'admin'] as GalleryTab[]).map((tab) => (
      <button
        key={tab}
        type="button"
        role="tab"
        aria-selected={galleryTab === tab}
        className={`gallery-tab ${galleryTab === tab ? 'active' : ''}`}
        onClick={() => setGalleryTab(tab)}
      >
        {tab === 'all' ? 'All Views' : tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    ))}
  </div>

  <div className="gallery-grid">
    {galleryImages
      .filter((img) => galleryTab === 'all' || img.role === galleryTab)
      .map((img, idx) => (
        <button
          key={img.src}
          type="button"
          className="gallery-thumb"
          onClick={() => setLightboxIndex(idx)}
          aria-label={`View screenshot: ${img.caption}`}
        >
          <img src={img.src} alt={img.caption} loading="lazy" />
          <div className="gallery-thumb-caption">{img.caption}</div>
        </button>
      ))}
  </div>
</section>

{lightboxIndex !== null && (() => {
  const filtered = galleryImages.filter((img) => galleryTab === 'all' || img.role === galleryTab);
  const current = filtered[lightboxIndex];
  if (!current) return null;
  return (
    <div
      className="lightbox-backdrop"
      onClick={() => setLightboxIndex(null)}
      role="dialog"
      aria-modal="true"
      aria-label={current.caption}
    >
      <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-close" onClick={() => setLightboxIndex(null)} aria-label="Close">✕</button>
        <img src={current.src} alt={current.caption} className="lightbox-image" />
        <p className="lightbox-caption">{current.caption}</p>
        <div className="lightbox-nav">
          <button type="button" onClick={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + filtered.length) % filtered.length))} aria-label="Previous">←</button>
          <span>{lightboxIndex + 1} / {filtered.length}</span>
          <button type="button" onClick={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % filtered.length))} aria-label="Next">→</button>
        </div>
      </div>
    </div>
  );
})()}
```

- [ ] **Step 4: Add gallery CSS**

In `frontend/src/pages/Landing.css`, append:

```css
/* ── Gallery ── */
.gallery-tabs {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin: 2rem 0 1.5rem;
  flex-wrap: wrap;
}

.gallery-tab {
  padding: 0.4rem 1rem;
  border-radius: 9999px;
  border: 1px solid var(--border, #e2e8f0);
  background: transparent;
  font-size: 0.875rem;
  cursor: pointer;
  color: #64748b;
  transition: all 0.15s;
}

.gallery-tab.active,
.gallery-tab:hover {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.gallery-thumb {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border, #e2e8f0);
  text-align: left;
  transition: box-shadow 0.2s, transform 0.2s;
}

.gallery-thumb:hover {
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  transform: translateY(-2px);
}

.gallery-thumb img {
  width: 100%;
  aspect-ratio: 16/10;
  object-fit: cover;
  display: block;
}

.gallery-thumb-caption {
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
  background: #f8fafc;
}

/* ── Lightbox ── */
.lightbox-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.lightbox-container {
  position: relative;
  max-width: 1100px;
  width: 100%;
}

.lightbox-close {
  position: absolute;
  top: -2.5rem;
  right: 0;
  background: none;
  border: none;
  color: #fff;
  font-size: 1.5rem;
  cursor: pointer;
}

.lightbox-image {
  width: 100%;
  border-radius: 10px;
  display: block;
}

.lightbox-caption {
  color: #cbd5e1;
  font-size: 0.875rem;
  text-align: center;
  margin: 0.75rem 0 0;
}

.lightbox-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  margin-top: 1rem;
  color: #fff;
}

.lightbox-nav button {
  background: rgba(255,255,255,0.15);
  border: none;
  color: #fff;
  font-size: 1.25rem;
  padding: 0.4rem 1rem;
  border-radius: 6px;
  cursor: pointer;
}

.lightbox-nav button:hover {
  background: rgba(255,255,255,0.3);
}
```

- [ ] **Step 5: Build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Landing.tsx frontend/src/pages/Landing.css
git commit -m "feat(landing): add screenshot gallery with role tabs and lightbox"
```

---

### Task 12: Landing.tsx — demo CTAs

**Files:**
- Modify: `frontend/src/pages/Landing.tsx`

- [ ] **Step 1: Add "Try Demo" to the hero section**

In `Landing.tsx`, find the `hero-actions` div containing the two existing CTA buttons. Add a third button:

```tsx
<div className="hero-actions">
  <Link className="btn btn-primary btn-lg" to="/login">
    Get Started <ArrowRight size={18} style={{ marginLeft: 6 }} />
  </Link>
  <Link className="btn btn-secondary btn-lg" to="/demo">
    Try Demo
  </Link>
  <button type="button" className="btn btn-outline btn-lg" onClick={() => scrollTo('how-it-works')}>
    See How It Works
  </button>
</div>
```

- [ ] **Step 2: Update the CTA banner**

Find the `cta-actions` div in the CTA Banner section. Update to include the demo link:

```tsx
<div className="cta-actions">
  <Link className="btn btn-lg btn-white" to="/login">
    Sign In <ArrowRight size={18} style={{ marginLeft: 6 }} />
  </Link>
  <Link className="btn btn-lg btn-ghost" to="/demo">
    Try Demo
  </Link>
  <Link className="btn btn-lg btn-ghost" to="/request-access">
    Request Access
  </Link>
</div>
```

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Landing.tsx
git commit -m "feat(landing): add Try Demo CTAs to hero and CTA banner"
```

---

### Task 13: Demo.tsx — 6-stop guided tour

**Files:**
- Create: `frontend/src/pages/Demo.tsx`
- Create: `frontend/src/pages/Demo.css`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create Demo.css**

Create `frontend/src/pages/Demo.css`:

```css
.demo-tour-page {
  min-height: 100vh;
  background: #0f172a;
  color: #f1f5f9;
  display: flex;
  flex-direction: column;
}

.demo-tour-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}

.demo-tour-brand {
  font-weight: 700;
  font-size: 1rem;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
}

.demo-tour-exit {
  font-size: 0.875rem;
  color: #94a3b8;
  text-decoration: none;
  padding: 0.4rem 1rem;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  transition: all 0.15s;
}

.demo-tour-exit:hover {
  background: rgba(255,255,255,0.07);
  color: #e2e8f0;
}

.demo-tour-body {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: 0;
}

.demo-tour-sidebar {
  border-right: 1px solid rgba(255,255,255,0.08);
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.demo-tour-sidebar-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 0.75rem;
}

.demo-stop-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.875rem;
  text-align: left;
  transition: all 0.15s;
  width: 100%;
}

.demo-stop-btn:hover {
  background: rgba(255,255,255,0.06);
  color: #e2e8f0;
}

.demo-stop-btn.active {
  background: rgba(79,70,229,0.2);
  color: #a5b4fc;
}

.demo-stop-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.demo-stop-btn.active .demo-stop-num {
  background: #4f46e5;
  color: #fff;
}

.demo-tour-content {
  padding: 2.5rem 3rem;
  overflow-y: auto;
}

.demo-stop-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6366f1;
  margin-bottom: 0.5rem;
}

.demo-stop-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #f1f5f9;
  margin: 0 0 0.75rem;
}

.demo-stop-desc {
  font-size: 0.9375rem;
  color: #94a3b8;
  line-height: 1.7;
  max-width: 560px;
  margin-bottom: 1.5rem;
}

.demo-mockup-frame {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 2rem;
}

.demo-mockup-topbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.03);
}

.demo-mockup-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.demo-mockup-body {
  padding: 1.5rem;
}

.demo-stat-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.demo-stat-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 0.875rem 1.25rem;
  flex: 1;
  min-width: 130px;
}

.demo-stat-label {
  font-size: 0.75rem;
  color: #64748b;
  margin-bottom: 0.25rem;
}

.demo-stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #f1f5f9;
}

.demo-stat-tag {
  display: inline-block;
  margin-top: 0.25rem;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: rgba(79,70,229,0.2);
  color: #a5b4fc;
}

.demo-tour-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 3rem;
  border-top: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.02);
}

.demo-progress {
  font-size: 0.875rem;
  color: #64748b;
}

.demo-nav-btns {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.demo-nav-btn {
  padding: 0.5rem 1.25rem;
  border-radius: 7px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.demo-nav-btn.secondary {
  border: 1px solid rgba(255,255,255,0.15);
  background: transparent;
  color: #94a3b8;
}

.demo-nav-btn.secondary:hover {
  background: rgba(255,255,255,0.07);
}

.demo-nav-btn.primary {
  border: none;
  background: #4f46e5;
  color: #fff;
}

.demo-nav-btn.primary:hover {
  background: #4338ca;
}

.demo-cta-strip {
  background: rgba(79,70,229,0.12);
  border: 1px solid rgba(79,70,229,0.25);
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.demo-cta-strip p {
  margin: 0;
  font-size: 0.9rem;
  color: #a5b4fc;
}

.demo-cta-strip a {
  padding: 0.5rem 1.25rem;
  background: #4f46e5;
  color: #fff;
  border-radius: 7px;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .demo-tour-body { grid-template-columns: 1fr; }
  .demo-tour-sidebar { display: none; }
  .demo-tour-content { padding: 1.5rem; }
  .demo-tour-footer { padding: 1rem 1.5rem; }
}
```

- [ ] **Step 2: Create Demo.tsx**

Create `frontend/src/pages/Demo.tsx`:

```tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Clock, Calendar, FileText, BarChart2, ShieldCheck } from 'lucide-react';
import { usePageMetadata } from '../hooks/usePageMetadata';
import './Demo.css';

const DEMO_LOGIN_EMAIL = 'demo@webforxtech.com';

type DemoStop = {
  key: string;
  label: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  mockup: React.ReactNode;
};

const stops: DemoStop[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={16} />,
    title: 'Your Command Centre',
    desc: 'Every morning starts here. See today\'s tracked hours, active timer status, top projects by time, and pending notifications — all without digging through reports.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card">
              <div className="demo-stat-label">Today</div>
              <div className="demo-stat-value">6h 42m</div>
              <div className="demo-stat-tag">84% of target</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Active timer</div>
              <div className="demo-stat-value" style={{ color: '#4ade80' }}>Running</div>
              <div className="demo-stat-tag">Platform Eng · 34m</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">This week</div>
              <div className="demo-stat-value">31h 10m</div>
              <div className="demo-stat-tag">3 projects</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            Top projects today: Platform Engineering · Webforx Website · Business Analytics
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'timer',
    label: 'Timer',
    icon: <Clock size={16} />,
    title: 'One Click to Start Tracking',
    desc: 'Select a project, describe the task, and hit Start. The timer runs in the background — even if you switch tabs. It auto-saves your state every 15 seconds.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card" style={{ flex: 2 }}>
              <div className="demo-stat-label">Current session</div>
              <div className="demo-stat-value" style={{ fontSize: '2rem', color: '#4ade80' }}>00:34:12</div>
              <div className="demo-stat-tag" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>● Live</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Task</div>
              <div style={{ fontSize: '0.85rem', color: '#f1f5f9', marginTop: '4px' }}>Sprint planning and backlog refinement</div>
              <div className="demo-stat-tag" style={{ marginTop: '6px' }}>Platform Engineering</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            Break reminder in 26 minutes · Auto-save pulse active
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'workday',
    label: 'Workday / AI',
    icon: <LayoutDashboard size={16} />,
    title: 'AI-Assisted Workday Reconstruction',
    desc: 'Missed logging a meeting? The Workday view analyses your calendar events and activity signals to surface untracked time blocks. Review the suggestions and accept with one click.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {[
              { time: '09:00–09:45', label: 'Team standup', status: 'tracked', color: '#4ade80' },
              { time: '10:15–11:35', label: 'API architecture review', status: 'tracked', color: '#4ade80' },
              { time: '12:00–12:30', label: 'Lunch break', status: 'gap', color: '#64748b' },
              { time: '13:00–14:20', label: 'Calendar: Product review call', status: 'AI suggested', color: '#a78bfa' },
              { time: '14:30–16:00', label: 'Feature implementation', status: 'tracked', color: '#4ade80' },
            ].map((row) => (
              <div key={row.time} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.625rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', minWidth: '110px' }}>{row.time}</span>
                <span style={{ fontSize: '0.825rem', color: '#e2e8f0', flex: 1 }}>{row.label}</span>
                <span style={{ fontSize: '0.7rem', color: row.color, padding: '2px 8px', background: `${row.color}15`, borderRadius: '9999px' }}>{row.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'timeline',
    label: 'Timeline',
    icon: <Calendar size={16} />,
    title: 'Your Day in Chronological Order',
    desc: 'The Timeline shows every time entry as it happened. Navigate between days, edit entries within the allowed window, and spot unlogged gaps at a glance.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card">
              <div className="demo-stat-label">First log</div>
              <div className="demo-stat-value" style={{ fontSize: '1rem' }}>08:42 AM</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Last log</div>
              <div className="demo-stat-value" style={{ fontSize: '1rem' }}>05:16 PM</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Total entries</div>
              <div className="demo-stat-value" style={{ fontSize: '1rem' }}>8</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#f59e0b' }}>
            ⚠ Unlogged gap detected between 12:00 PM and 1:00 PM
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: <BarChart2 size={16} />,
    title: 'Analytics Built for Managers',
    desc: 'Filter by team member, project, or date range. View utilization, billable ratios, and approval lag. Export to CSV or PDF for payroll, billing, or client reports.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card">
              <div className="demo-stat-label">Team utilization</div>
              <div className="demo-stat-value">79%</div>
              <div className="demo-stat-tag">Mar 1–28</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Billable ratio</div>
              <div className="demo-stat-value">68%</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Approval lag</div>
              <div className="demo-stat-value">7h 14m</div>
              <div className="demo-stat-tag" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>−18%</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            Export: CSV · PDF · Scheduled delivery available
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: <ShieldCheck size={16} />,
    title: 'Full Organizational Control',
    desc: 'Admins manage users, configure projects and tasks, define approval workflows, and review audit logs. Everything is role-gated — employees never see what isn\'t theirs.',
    mockup: (
      <div className="demo-mockup-frame">
        <div className="demo-mockup-topbar">
          <div className="demo-mockup-dot" style={{ background: '#ef4444' }} />
          <div className="demo-mockup-dot" style={{ background: '#f59e0b' }} />
          <div className="demo-mockup-dot" style={{ background: '#22c55e' }} />
        </div>
        <div className="demo-mockup-body">
          <div className="demo-stat-row">
            <div className="demo-stat-card">
              <div className="demo-stat-label">Active projects</div>
              <div className="demo-stat-value">14</div>
              <div className="demo-stat-tag">+2 this month</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Team members</div>
              <div className="demo-stat-value">23</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-label">Audit events (24h)</div>
              <div className="demo-stat-value">56</div>
              <div className="demo-stat-tag" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>Normal</div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748b' }}>
            Policy mode: Strict · Roles: Admin · Manager · Employee · Intern
          </div>
        </div>
      </div>
    ),
  },
];

const Demo: React.FC = () => {
  const [step, setStep] = useState(0);

  usePageMetadata({
    title: 'Product Tour | Web Forx Time Tracker',
    description: 'Explore the Web Forx Time Tracker product — Dashboard, Timer, AI Workday, Reports, and Admin views.',
    canonical: '/demo',
  });

  const current = stops[step];
  const isFirst = step === 0;
  const isLast = step === stops.length - 1;

  return (
    <div className="demo-tour-page">
      <div className="demo-tour-topbar">
        <Link to="/" className="demo-tour-brand">
          <img src="/webforx-logo.png" alt="Web Forx" style={{ height: 28 }} />
          Web Forx Time Tracker
        </Link>
        <Link to="/" className="demo-tour-exit">← Back to site</Link>
      </div>

      <div className="demo-tour-body">
        <div className="demo-tour-sidebar">
          <div className="demo-tour-sidebar-title">Product Tour</div>
          {stops.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`demo-stop-btn ${i === step ? 'active' : ''}`}
              onClick={() => setStep(i)}
            >
              <span className="demo-stop-num">{i + 1}</span>
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>

        <div className="demo-tour-content">
          <p className="demo-stop-label">Step {step + 1} of {stops.length}</p>
          <h1 className="demo-stop-title">{current.title}</h1>
          <p className="demo-stop-desc">{current.desc}</p>
          {current.mockup}
          <div className="demo-cta-strip">
            <p>Want to explore the real app? Log in with the demo account — no sign-up needed.</p>
            <a
              href={`/login?prefill=${encodeURIComponent(DEMO_LOGIN_EMAIL)}`}
            >
              Try Demo Account →
            </a>
          </div>
        </div>
      </div>

      <div className="demo-tour-footer">
        <span className="demo-progress">{step + 1} / {stops.length}</span>
        <div className="demo-nav-btns">
          {!isFirst && (
            <button type="button" className="demo-nav-btn secondary" onClick={() => setStep((s) => s - 1)}>
              ← Previous
            </button>
          )}
          {!isLast ? (
            <button type="button" className="demo-nav-btn primary" onClick={() => setStep((s) => s + 1)}>
              Next →
            </button>
          ) : (
            <Link to="/request-access" className="demo-nav-btn primary" style={{ textDecoration: 'none' }}>
              Request Access →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default Demo;
```

- [ ] **Step 3: Add the route in App.tsx**

In `frontend/src/App.tsx`, add the import:

```typescript
import Demo from './pages/Demo';
```

Add the route with the other public routes:

```tsx
<Route path="/demo" element={<Demo />} />
```

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Demo.tsx frontend/src/pages/Demo.css frontend/src/App.tsx
git commit -m "feat(demo): add 6-stop guided product tour at /demo"
```

---

### Task 14: useActiveTimerHeartbeat — expose is_paused via event

**Files:**
- Modify: `frontend/src/hooks/useActiveTimerHeartbeat.ts`

- [ ] **Step 1: Add the TIMER_PAUSED_EVENT constant and update sync**

In `frontend/src/hooks/useActiveTimerHeartbeat.ts`, add the new event constant after the existing ones:

```typescript
export const TIMER_PAUSED_EVENT = 'wfx:timer-paused';
```

The `syncActiveTimer` function currently reads `activeTimer.start_time` from the API response. The API response from `GET /api/v1/timers/me` now also returns `is_paused` (automatically, since Prisma returns all model fields). Update the sync to track and dispatch the paused state:

Add a ref for tracking the paused state:

```typescript
const isPausedRef = useRef(false);
```

Inside `syncActiveTimer`, after updating `hasActiveTimerRef.current`, add:

```typescript
const newIsPaused = Boolean(response.data.activeTimer?.is_paused);
if (newIsPaused && !isPausedRef.current) {
    // Timer just became paused (detected on sync, e.g. after tab becomes active again)
    window.dispatchEvent(new CustomEvent(TIMER_PAUSED_EVENT));
}
isPausedRef.current = newIsPaused;

if (!hasActiveTimerRef.current) {
    isPausedRef.current = false;
    // existing reset...
}
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useActiveTimerHeartbeat.ts
git commit -m "feat(heartbeat): dispatch TIMER_PAUSED_EVENT when sync detects paused timer"
```

---

### Task 15: Layout.tsx — idle dialog upgrade + resume banner + demo banner

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Add TIMER_PAUSED_EVENT import and resume banner state**

In `frontend/src/components/Layout.tsx`, update the import from the heartbeat hook:

```typescript
import { TIMER_IDLE_RESUMED_EVENT, TIMER_IDLE_WARNING_EVENT, TIMER_PAUSED_EVENT, useActiveTimerHeartbeat } from '../hooks/useActiveTimerHeartbeat';
```

Add a new state variable inside the `Layout` component (after the existing `idleWarning` state):

```typescript
const [showResumeBanner, setShowResumeBanner] = useState(false);
```

- [ ] **Step 2: Add event listeners for TIMER_PAUSED_EVENT**

In the `useEffect` that registers `TIMER_IDLE_WARNING_EVENT` and `TIMER_IDLE_RESUMED_EVENT`, extend it:

```typescript
useEffect(() => {
    const onIdleWarning = (event: Event) => {
        const detail = (event as CustomEvent<{ inactiveForMinutes?: number }>).detail;
        setIdleWarning({
            inactiveForMinutes: detail?.inactiveForMinutes ?? 0,
        });
    };

    const onIdleResumed = () => {
        setIdleWarning(null);
        // If the timer is paused, the TIMER_PAUSED_EVENT will fire on next sync
        // which shows the resume banner instead
    };

    const onTimerPaused = () => {
        setIdleWarning(null);
        setShowResumeBanner(true);
    };

    window.addEventListener(TIMER_IDLE_WARNING_EVENT, onIdleWarning as EventListener);
    window.addEventListener(TIMER_IDLE_RESUMED_EVENT, onIdleResumed);
    window.addEventListener(TIMER_PAUSED_EVENT, onTimerPaused);

    return () => {
        window.removeEventListener(TIMER_IDLE_WARNING_EVENT, onIdleWarning as EventListener);
        window.removeEventListener(TIMER_IDLE_RESUMED_EVENT, onIdleResumed);
        window.removeEventListener(TIMER_PAUSED_EVENT, onTimerPaused);
    };
}, []);
```

- [ ] **Step 3: Add resume handler**

Add this function inside the `Layout` component:

```typescript
const handleResumeTimer = async () => {
    try {
        await fetch(`${import.meta.env.VITE_API_URL}/timers/resume`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('wfx-token') ?? ''}`,
            },
        });
    } catch {
        // silently fail — timer state will reconcile on next heartbeat sync
    }
    setShowResumeBanner(false);
    setIdleWarning(null);
    window.dispatchEvent(new Event('wfx:timer-entry-changed'));
};

const handleDiscardTimer = async () => {
    try {
        await fetch(`${import.meta.env.VITE_API_URL}/timers/stop`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('wfx-token') ?? ''}`,
            },
        });
    } catch {
        // silently fail
    }
    setShowResumeBanner(false);
    setIdleWarning(null);
};
```

- [ ] **Step 4: Add demo banner state**

Add after `showResumeBanner`:

```typescript
const isDemoSession = localStorage.getItem('wfx-email') === 'demo@webforxtech.com';
```

- [ ] **Step 5: Update the JSX**

In the Layout JSX, inside `<main className="main-content">`, add the demo banner immediately after `<Navbar onMenuClick={() => setSidebarOpen(true)} />`:

```tsx
{isDemoSession && (
  <div role="status" style={{
    background: '#1e1b4b', color: '#a5b4fc',
    fontSize: '0.8125rem', textAlign: 'center',
    padding: '0.5rem 1rem', borderBottom: '1px solid rgba(165,180,252,0.2)',
  }}>
    Demo session — data resets every 24 hours.{' '}
    <Link to="/request-access" style={{ color: '#818cf8', fontWeight: 600 }}>
      Request access to get your own workspace →
    </Link>
  </div>
)}
```

Add the resume banner immediately after the demo banner:

```tsx
{showResumeBanner && (
  <div role="alert" style={{
    background: '#78350f', color: '#fef3c7',
    fontSize: '0.875rem', padding: '0.625rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '1rem', flexWrap: 'wrap', borderBottom: '1px solid #92400e',
  }}>
    <span>⏸ Your timer is paused — resume when you're ready.</span>
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={handleResumeTimer}
        style={{
          background: '#d97706', border: 'none', color: '#fff',
          padding: '0.3rem 0.875rem', borderRadius: '5px',
          fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
        }}
      >
        Resume Timer
      </button>
      <button
        type="button"
        onClick={handleDiscardTimer}
        style={{
          background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
          color: '#fef3c7', padding: '0.3rem 0.875rem', borderRadius: '5px',
          fontSize: '0.8125rem', cursor: 'pointer',
        }}
      >
        I'm done
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Upgrade the AccessibleDialog for idle warning**

Replace the existing `AccessibleDialog` content (the "Your timer may stop soon" dialog) with:

```tsx
<AccessibleDialog
  isOpen={Boolean(idleWarning)}
  onClose={() => setIdleWarning(null)}
  ariaLabel="Timer paused"
  panelClassName="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
>
  <div className="space-y-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Timer Paused</p>
    <h2 className="text-xl font-bold text-slate-900">Your timer has been paused</h2>
    <p className="text-sm text-slate-600">
      No activity detected for {idleWarning?.inactiveForMinutes ?? 0} minute(s).
      Your time up to this point is saved — resume when you're back.
    </p>
    <div className="flex gap-3 justify-end">
      <button
        type="button"
        className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
        onClick={handleDiscardTimer}
      >
        I'm done for now
      </button>
      <button
        type="button"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        onClick={handleResumeTimer}
      >
        Resume Timer
      </button>
    </div>
  </div>
</AccessibleDialog>
```

- [ ] **Step 7: Build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 8: Run frontend unit tests**

```bash
cd frontend && npm run test:unit 2>&1 | tail -20
```

Expected: all existing tests pass. If `activeTimerHeartbeat.test.tsx` fails due to the new `isPausedRef`, update the test to provide `is_paused: false` in the mock response.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat(layout): upgrade idle dialog to pause/resume; add resume banner and demo session banner"
```

---

### Task 16: Final validation and deploy

- [ ] **Step 1: Full frontend build and lint**

```bash
cd frontend && npm run build && npm run lint 2>&1 | tail -20
```

Expected: both exit 0, no errors.

- [ ] **Step 2: Full backend build and tests**

```bash
cd backend && npm run build && npm test 2>&1 | tail -20
```

Expected: both exit 0, all tests pass.

- [ ] **Step 3: Smoke-check checklist**

After deploying frontend to production, verify each item manually:

```
[ ] / — landing page loads; nav shows Features, Demo, AI, Sign In
[ ] /#ai-features — AI section visible with 4 cards and trust line
[ ] /#gallery — gallery with 6 thumbnails, tab filter works, lightbox opens
[ ] /demo — tour loads; 6 sidebar stops; Next/Previous navigates; CTA strip links to /login
[ ] /request-access — form submits without opening mail client; success state shows
[ ] /login — demo user pre-fill works (from /demo CTA)
[ ] Authenticated: demo banner shows for demo@webforxtech.com
[ ] Authenticated: idle timer goes to paused state (not stopped) after inactivity
[ ] Authenticated: resume banner appears on browser return when timer is paused
[ ] POST /api/v1/cron/reset-demo — returns 200 (run with CRON_SECRET header)
```

- [ ] **Step 4: Final commit if any smoke-check fixes applied**

```bash
git add -p  # stage only relevant fixes
git commit -m "fix: smoke-check corrections from production deploy"
```

---

## Verification Against Spec

| Spec requirement | Task |
|---|---|
| `/demo` public tour, 6 stops, no auth | Task 13 |
| Demo login pre-fills credentials, shows demo banner | Tasks 12, 14, 15 |
| Demo data reset every 24 hours (hourly cron) | Task 8 |
| Request-access form → backend API, DB persist, dual Resend emails | Tasks 6, 7, 9 |
| AI section on landing page between Demo and Roles sections | Task 10 |
| Screenshot gallery with role tabs and lightbox | Task 11 |
| `ActiveTimer` pause fields (backward-compatible) | Task 1 |
| `pauseActiveTimer` / `resumeActiveTimer` service functions | Task 2 |
| Duration deduction for paused time on stop | Tasks 2, 3 |
| `idleTracker` browser_inactive → pause (not stop) | Task 5 |
| Pause/resume API endpoints | Task 4 |
| Idle dialog updated to "Timer Paused" with Resume action | Task 15 |
| Resume banner on browser return | Tasks 14, 15 |
| All existing tests pass | Tasks 2, 5, 16 |
| Frontend and backend build clean | Tasks 8, 16 |
