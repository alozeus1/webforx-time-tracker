# Admin Corrections Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the admin corrections tab so it defaults to actionable pending requests, surfaces resolved requests in a 30-day window, and allows purging older resolved corrections, all without breaking production.

**Architecture:** Add query parameters to the existing review endpoint, create a focused retention service, expose an admin purge endpoint, wire a daily cron, and redesign the frontend corrections tab with segmented Pending/Resolved/All views.

**Tech Stack:** React + Vite + Tailwind (frontend), Express + Prisma + PostgreSQL (backend), Playwright (e2e), Jest/Node (backend tests).

## Global Constraints

- Node.js: `>=20.19.0 <21 || >=22.12.0`
- Backend package manager: npm
- Frontend package manager: npm
- Database: PostgreSQL via Prisma
- No schema migration required
- Existing API response shape `{ corrections: [...] }` must be preserved for clients that omit query params
- Purge deletes only resolved corrections older than `CORRECTION_RETENTION_DAYS` (default 30)
- Deploy backend before frontend

---

## File Map

| File | Responsibility |
|------|----------------|
| `backend/src/config/env.ts` | Add `correctionRetentionDays` env parser |
| `backend/src/services/correctionRetentionService.ts` | Query and purge logic for correction requests |
| `backend/src/controllers/timeEntryController.ts` | Update `getCorrectionRequestsForReview`; add `purgeResolvedCorrectionsController` |
| `backend/src/controllers/cronController.ts` | Add `runCorrectionRetention` cron handler |
| `backend/src/routes/timeEntryRoutes.ts` | Add `?status` support to existing review route; add purge route |
| `backend/src/routes/cronRoutes.ts` | Add `/correction-retention` cron route |
| `backend/vercel.json` | Schedule the daily correction-retention cron |
| `frontend/src/pages/Admin.tsx` | Redesign corrections tab with segments, default Pending, purge button |
| `backend/tests/correctionRetention.test.ts` | Unit tests for the service and route behavior |
| `frontend/tests/admin-corrections.spec.ts` | Playwright e2e for the redesigned tab |

---

## Task 1: Add correction retention env parser

**Files:**
- Modify: `backend/src/config/env.ts`

**Interfaces:**
- Produces: `env.correctionRetentionDays: number`

- [ ] **Step 1: Add the parser** after `dataRetentionDays` in `backend/src/config/env.ts`.

```ts
    correctionRetentionDays: (() => {
        const parsed = Number.parseInt(process.env.CORRECTION_RETENTION_DAYS?.trim() || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
    })(),
```

- [ ] **Step 2: Verify backend builds**

Run: `cd backend && npm run build`
Expected: Build completes without TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/env.ts
git commit -m "feat(corrections): add CORRECTION_RETENTION_DAYS env parser"
```

---

## Task 2: Create correction retention service

**Files:**
- Create: `backend/src/services/correctionRetentionService.ts`

**Interfaces:**
- Consumes: `prisma` client, `env.correctionRetentionDays`
- Produces:
  - `getCorrectionRequestsForReview(options)` returns `Promise<TimerCorrectionRequest[]>`
  - `purgeResolvedCorrections(organizationId, retentionDays)` returns `Promise<number>`

- [ ] **Step 1: Write the failing test file**

Create `backend/tests/correctionRetention.test.ts`:

```ts
import { getCorrectionRequestsForReview, purgeResolvedCorrections } from '../src/services/correctionRetentionService';
import prisma from '../src/config/db';

describe('correctionRetentionService', () => {
    const orgId = 'test-org-id';

    beforeEach(async () => {
        await prisma.timerCorrectionRequest.deleteMany({ where: { organization_id: orgId } });
    });

    it('returns pending rows regardless of age', async () => {
        const oldPending = await prisma.timerCorrectionRequest.create({
            data: {
                user_id: 'user-1',
                organization_id: orgId,
                requested_start_time: new Date('2020-01-01T00:00:00Z'),
                requested_end_time: new Date('2020-01-01T01:00:00Z'),
                requested_duration_seconds: 3600,
                reason: 'old pending',
                status: 'PENDING',
                created_at: new Date('2020-01-01T00:00:00Z'),
            },
        });

        const rows = await getCorrectionRequestsForReview({ organizationId: orgId, status: 'PENDING' });
        expect(rows.map((r) => r.id)).toContain(oldPending.id);
    });

    it('filters resolved rows by lookbackDays', async () => {
        const oldApproved = await prisma.timerCorrectionRequest.create({
            data: {
                user_id: 'user-1',
                organization_id: orgId,
                requested_start_time: new Date('2020-01-01T00:00:00Z'),
                requested_end_time: new Date('2020-01-01T01:00:00Z'),
                requested_duration_seconds: 3600,
                reason: 'old approved',
                status: 'APPROVED',
                reviewed_at: new Date('2020-01-15T00:00:00Z'),
                created_at: new Date('2020-01-01T00:00:00Z'),
            },
        });
        const recentApproved = await prisma.timerCorrectionRequest.create({
            data: {
                user_id: 'user-1',
                organization_id: orgId,
                requested_start_time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                requested_end_time: new Date(Date.now()),
                requested_duration_seconds: 3600,
                reason: 'recent approved',
                status: 'APPROVED',
                reviewed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            },
        });

        const rows = await getCorrectionRequestsForReview({ organizationId: orgId, status: 'APPROVED', lookbackDays: 30 });
        expect(rows.map((r) => r.id)).not.toContain(oldApproved.id);
        expect(rows.map((r) => r.id)).toContain(recentApproved.id);
    });

    it('supports comma-separated status lists', async () => {
        const approved = await prisma.timerCorrectionRequest.create({
            data: {
                user_id: 'user-1',
                organization_id: orgId,
                requested_start_time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                requested_end_time: new Date(Date.now()),
                requested_duration_seconds: 3600,
                reason: 'approved',
                status: 'APPROVED',
                reviewed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            },
        });
        const rejected = await prisma.timerCorrectionRequest.create({
            data: {
                user_id: 'user-1',
                organization_id: orgId,
                requested_start_time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                requested_end_time: new Date(Date.now()),
                requested_duration_seconds: 3600,
                reason: 'rejected',
                status: 'REJECTED',
                reviewed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            },
        });

        const rows = await getCorrectionRequestsForReview({ organizationId: orgId, status: 'APPROVED,REJECTED', lookbackDays: 30 });
        expect(rows.map((r) => r.id)).toContain(approved.id);
        expect(rows.map((r) => r.id)).toContain(rejected.id);
    });

    it('purges only resolved corrections older than retention window', async () => {
        const oldApproved = await prisma.timerCorrectionRequest.create({
            data: {
                user_id: 'user-1',
                organization_id: orgId,
                requested_start_time: new Date('2020-01-01T00:00:00Z'),
                requested_end_time: new Date('2020-01-01T01:00:00Z'),
                requested_duration_seconds: 3600,
                reason: 'old approved',
                status: 'APPROVED',
                reviewed_at: new Date('2020-01-01T00:00:00Z'),
                created_at: new Date('2020-01-01T00:00:00Z'),
            },
        });
        const oldPending = await prisma.timerCorrectionRequest.create({
            data: {
                user_id: 'user-1',
                organization_id: orgId,
                requested_start_time: new Date('2020-01-01T00:00:00Z'),
                requested_end_time: new Date('2020-01-01T01:00:00Z'),
                requested_duration_seconds: 3600,
                reason: 'old pending',
                status: 'PENDING',
                created_at: new Date('2020-01-01T00:00:00Z'),
            },
        });

        const deleted = await purgeResolvedCorrections(orgId, 30);
        expect(deleted).toBe(1);

        const remaining = await prisma.timerCorrectionRequest.findMany({ where: { organization_id: orgId } });
        expect(remaining.map((r) => r.id)).toContain(oldPending.id);
        expect(remaining.map((r) => r.id)).not.toContain(oldApproved.id);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npm test -- correctionRetention.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `backend/src/services/correctionRetentionService.ts`:

```ts
import prisma from '../config/db';

export interface GetCorrectionRequestsOptions {
    organizationId: string;
    status?: string;
    lookbackDays?: number;
    limit?: number;
    offset?: number;
}

const RESOLVED_STATUSES = new Set(['APPROVED', 'REJECTED', 'CANCELLED']);

const parseStatusFilter = (status?: string): string[] | undefined => {
    if (!status || status.trim() === 'all') {
        return undefined;
    }
    const parts = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) {
        return undefined;
    }
    return parts;
};

const isResolvedOnly = (statuses?: string[]): boolean => {
    if (!statuses || statuses.length === 0) {
        return false;
    }
    return statuses.every((s) => RESOLVED_STATUSES.has(s));
};

export const getCorrectionRequestsForReview = async (options: GetCorrectionRequestsOptions) => {
    const { organizationId, status, lookbackDays, limit = 200, offset = 0 } = options;
    const statuses = parseStatusFilter(status);

    const statusFilter = statuses ? { status: { in: statuses } } : {};

    let lookbackFilter = {};
    if (lookbackDays != null && lookbackDays > 0 && isResolvedOnly(statuses)) {
        const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        lookbackFilter = { created_at: { gte: cutoff } };
    }

    const corrections = await prisma.timerCorrectionRequest.findMany({
        where: {
            organization_id: organizationId,
            ...statusFilter,
            ...lookbackFilter,
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
        include: {
            user: { select: { id: true, email: true, first_name: true, last_name: true } },
        },
    });

    return corrections;
};

export const purgeResolvedCorrections = async (organizationId: string, retentionDays: number): Promise<number> => {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const BATCH_SIZE = 1000;
    let deleted = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const rows = await prisma.timerCorrectionRequest.findMany({
            where: {
                organization_id: organizationId,
                status: { in: Array.from(RESOLVED_STATUSES) },
                reviewed_at: { lt: cutoff },
            },
            select: { id: true },
            take: BATCH_SIZE,
        });

        if (rows.length === 0) {
            break;
        }

        const result = await prisma.timerCorrectionRequest.deleteMany({
            where: {
                id: { in: rows.map((r) => r.id) },
            },
        });

        deleted += result.count;

        if (rows.length < BATCH_SIZE) {
            break;
        }
    }

    return deleted;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm test -- correctionRetention.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/correctionRetentionService.ts backend/tests/correctionRetention.test.ts
git commit -m "feat(corrections): add correction retention service and tests"
```

---

## Task 3: Update controller and routes

**Files:**
- Modify: `backend/src/controllers/timeEntryController.ts`
- Modify: `backend/src/routes/timeEntryRoutes.ts`

**Interfaces:**
- Consumes: `getCorrectionRequestsForReview`, `purgeResolvedCorrections`, `env.correctionRetentionDays`
- Produces:
  - `getCorrectionRequestsForReview(req, res)` honors `status`, `lookbackDays`, `limit`, `offset`
  - `purgeResolvedCorrectionsController(req, res)` returns `{ deleted: number }`

- [ ] **Step 1: Update `getCorrectionRequestsForReview` controller**

In `backend/src/controllers/timeEntryController.ts`, replace the existing `getCorrectionRequestsForReview` function with:

```ts
export const getCorrectionRequestsForReview = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const status = typeof req.query.status === 'string' ? req.query.status : 'all';
        const lookbackDays = Number.parseInt(String(req.query.lookbackDays ?? ''), 10);
        const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? ''), 10) || 200, 1), 500);
        const offset = Math.max(Number.parseInt(String(req.query.offset ?? ''), 10) || 0, 0);

        const corrections = await getCorrectionRequestsForReviewService({
            organizationId: req.user!.organization_id,
            status,
            lookbackDays: Number.isFinite(lookbackDays) && lookbackDays > 0 ? lookbackDays : undefined,
            limit,
            offset,
        });

        res.status(200).json({ corrections });
    } catch (error) {
        console.error('Failed to list correction requests for review:', error);
        res.status(500).json({ message: 'Internal server error while loading correction requests' });
    }
};
```

Add the import at the top of the file:

```ts
import { getCorrectionRequestsForReview as getCorrectionRequestsForReviewService, purgeResolvedCorrections } from '../services/correctionRetentionService';
import { env } from '../config/env';
```

- [ ] **Step 2: Add purge controller function**

Append to `backend/src/controllers/timeEntryController.ts`:

```ts
export const purgeResolvedCorrectionsController = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const deleted = await purgeResolvedCorrections(req.user!.organization_id, env.correctionRetentionDays);
        res.status(200).json({ deleted });
    } catch (error) {
        console.error('Failed to purge resolved corrections:', error);
        res.status(500).json({ message: 'Internal server error while purging resolved corrections' });
    }
};
```

- [ ] **Step 3: Update routes**

In `backend/src/routes/timeEntryRoutes.ts`, update the imports:

```ts
import { startTimer, stopTimer, pauseTimer, resumeTimer, manualEntry, getMyEntries, getActiveTimer, pingTimer, pauseBeacon, getPendingTimesheets, reviewTimesheet, updateEntry, deleteEntry, duplicateEntry, createCorrectionRequest, getCorrectionRequestsForReview, getMyCorrectionRequests, reviewCorrectionRequest, bulkUpdateEntries, purgeResolvedCorrectionsController } from '../controllers/timeEntryController';
```

Add the purge route after the review route:

```ts
router.get('/corrections/review', requireRole(['Manager', 'Admin']), getCorrectionRequestsForReview);
router.post('/corrections/:correctionId/review', requireRole(['Manager', 'Admin']), reviewCorrectionRequest);
router.post('/corrections/purge-resolved', requireRole(['Manager', 'Admin']), purgeResolvedCorrectionsController);
```

- [ ] **Step 4: Add route tests**

Append to `backend/tests/correctionRetention.test.ts`:

```ts
import request from 'supertest';
import app from '../src/index';
import prisma from '../src/config/db';
import { createTestUser, getAuthToken } from './helpers';

describe('GET /api/v1/timers/corrections/review', () => {
    // These tests assume helpers createTestUser and getAuthToken exist in backend/tests/helpers.ts
    // If helpers.ts does not exist, add minimal helpers in this task.
});
```

If `backend/tests/helpers.ts` does not exist, create it:

```ts
import prisma from '../src/config/db';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

export const createTestUser = async (roleName: 'Admin' | 'Manager' | 'Employee' = 'Admin') => {
    const organization = await prisma.organization.create({
        data: { name: 'Test Org', slug: `test-org-${Date.now()}` },
    });
    const role = await prisma.role.findFirst({ where: { name: roleName, organization_id: organization.id } });
    if (!role) {
        throw new Error(`Role ${roleName} not found for test org`);
    }
    const user = await prisma.user.create({
        data: {
            email: `test-${Date.now()}@example.com`,
            password_hash: 'hash',
            first_name: 'Test',
            last_name: 'User',
            role_id: role.id,
            organization_id: organization.id,
        },
    });
    return { user, organization, role };
};

export const getAuthToken = (userId: string, organizationId: string, roleName: string) => {
    return jwt.sign(
        { userId, organizationId, role: roleName },
        env.jwtSecret,
        { expiresIn: '1h' }
    );
};
```

- [ ] **Step 5: Build and test**

Run: `cd backend && npm run build && npm test -- correctionRetention.test.ts`
Expected: Build and tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/timeEntryController.ts backend/src/routes/timeEntryRoutes.ts backend/tests/correctionRetention.test.ts backend/tests/helpers.ts
git commit -m "feat(corrections): add query filtering and purge endpoint for correction review"
```

---

## Task 4: Wire the correction-retention cron

**Files:**
- Modify: `backend/src/controllers/cronController.ts`
- Modify: `backend/src/routes/cronRoutes.ts`
- Modify: `backend/vercel.json`

**Interfaces:**
- Consumes: `purgeResolvedCorrections`, `env.correctionRetentionDays`
- Produces: `POST /api/v1/cron/correction-retention` handler

- [ ] **Step 1: Add cron handler**

In `backend/src/controllers/cronController.ts`, add:

```ts
import { purgeResolvedCorrections } from '../services/correctionRetentionService';
import { env } from '../config/env';

export const runCorrectionRetention = async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('[Cron] Running correction retention cleanup...');
        const deleted = await purgeResolvedCorrections(env.correctionRetentionDays);
        console.log(`[Cron] Correction retention cleanup complete: ${deleted} deleted`);
        res.status(200).json({ status: 'success', deleted });
    } catch (error) {
        console.error('[Cron] Error during correction retention cleanup:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run correction retention cleanup' });
    }
};
```

Fix the call signature: `purgeResolvedCorrections` requires `organizationId`. The cron should iterate organizations or accept no organizationId and delete across all. Update the service to support `organizationId?: string`.

In `backend/src/services/correctionRetentionService.ts`, change the where clause of `purgeResolvedCorrections` to:

```ts
const where: Record<string, unknown> = {
    status: { in: Array.from(RESOLVED_STATUSES) },
    reviewed_at: { lt: cutoff },
};
if (organizationId) {
    where.organization_id = organizationId;
}
```

And update the function signature:

```ts
export const purgeResolvedCorrections = async (organizationId: string | undefined, retentionDays: number): Promise<number> => {
```

- [ ] **Step 2: Add cron route**

In `backend/src/routes/cronRoutes.ts`, update imports and add route:

```ts
import { runIdleChecks, runWorkloadChecks, runDailyReport, runScheduledReports, resetDemoData, runRetention, runCorrectionRetention } from '../controllers/cronController';
```

```ts
router.get('/correction-retention', runCorrectionRetention);
router.post('/correction-retention', runCorrectionRetention);
```

- [ ] **Step 3: Schedule cron in vercel.json**

Add to `backend/vercel.json` crons array:

```json
    {
      "path": "/api/v1/cron/correction-retention",
      "schedule": "0 4 * * *"
    }
```

- [ ] **Step 4: Add cron test**

Append to `backend/tests/correctionRetention.test.ts`:

```ts
describe('POST /api/v1/cron/correction-retention', () => {
    it('rejects unauthorized calls', async () => {
        const res = await request(app).post('/api/v1/cron/correction-retention');
        expect(res.status).toBe(401);
    });
});
```

- [ ] **Step 5: Build and test**

Run: `cd backend && npm run build && npm test -- correctionRetention.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/cronController.ts backend/src/routes/cronRoutes.ts backend/src/services/correctionRetentionService.ts backend/vercel.json backend/tests/correctionRetention.test.ts
git commit -m "feat(corrections): add daily correction-retention cron"
```

---

## Task 5: Redesign frontend corrections tab

**Files:**
- Modify: `frontend/src/pages/Admin.tsx`

**Interfaces:**
- Consumes: `GET /timers/corrections/review?status=...&lookbackDays=...`, `POST /timers/corrections/:id/review`, `POST /timers/corrections/purge-resolved`
- Produces: Segmented Pending/Resolved/All UI with purge action

- [ ] **Step 1: Add correction segment state**

Near the existing correction state (around line 140-142), replace:

```ts
const [correctionSearch, setCorrectionSearch] = useState('');
const [correctionStatus, setCorrectionStatus] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('all');
```

with:

```ts
type CorrectionSegment = 'pending' | 'resolved' | 'all';
const [correctionSegment, setCorrectionSegment] = useState<CorrectionSegment>('pending');
const [correctionSearch, setCorrectionSearch] = useState('');
const [correctionStatus, setCorrectionStatus] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('all');
const [correctionsLoading, setCorrectionsLoading] = useState(false);
const CORRECTION_RETENTION_DAYS = 30;
```

- [ ] **Step 2: Update fetchCorrections to use query params**

Replace `fetchCorrections` with:

```ts
async function fetchCorrections() {
    setCorrectionsLoading(true);
    try {
        const params = new URLSearchParams();
        if (correctionSegment === 'pending') {
            params.set('status', 'PENDING');
        } else if (correctionSegment === 'resolved') {
            params.set('status', 'APPROVED,REJECTED,CANCELLED');
            params.set('lookbackDays', String(CORRECTION_RETENTION_DAYS));
        } else {
            params.set('status', correctionStatus === 'all' ? 'all' : correctionStatus);
        }

        const res = await api.get<{ corrections: TimerCorrectionRequestSummary[] }>(`/timers/corrections/review?${params.toString()}`);
        setCorrections(res.data.corrections || []);
    } catch (error) {
        console.error('Error fetching correction requests:', error);
    } finally {
        setCorrectionsLoading(false);
    }
}
```

- [ ] **Step 3: Add purge handler**

After `handleReviewCorrection`, add:

```ts
async function handlePurgeResolvedCorrections() {
    if (!window.confirm(`Permanently delete resolved corrections older than ${CORRECTION_RETENTION_DAYS} days? This cannot be undone.`)) {
        return;
    }
    try {
        const res = await api.post<{ deleted: number }>('/timers/corrections/purge-resolved');
        void fetchCorrections();
        alert(`${res.data.deleted} resolved correction(s) purged.`);
    } catch (error) {
        console.error('Error purging resolved corrections:', error);
        alert(getApiErrorMessage(error, 'Failed to purge resolved corrections.'));
    }
}
```

- [ ] **Step 4: Add useEffect for segment/status changes**

Add after the existing `useEffect` that loads admin data:

```ts
useEffect(() => {
    void fetchCorrections();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [correctionSegment, correctionStatus]);
```

- [ ] **Step 5: Replace corrections filter UI**

Locate the corrections filter block (around line 1727-1756). Replace it with:

```tsx
{activeTab === 'corrections' && (
    <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-1">
            {(['pending', 'resolved', 'all'] as const).map((segment) => (
                <button
                    key={segment}
                    type="button"
                    onClick={() => setCorrectionSegment(segment)}
                    className={`px-3 py-1.5 rounded-md text-sm font-bold capitalize transition-colors ${
                        correctionSegment === segment
                            ? 'bg-primary text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                    {segment}
                    {segment === 'resolved' && (
                        <span className="ml-1 text-[10px] opacity-80">(30d)</span>
                    )}
                </button>
            ))}
        </div>
        <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
                type="text"
                value={correctionSearch}
                onChange={(e) => setCorrectionSearch(e.target.value)}
                placeholder="Search user or reason…"
                className="pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-56"
            />
        </div>
        {correctionSegment === 'all' && (
            <select
                value={correctionStatus}
                onChange={(e) => setCorrectionStatus(e.target.value as typeof correctionStatus)}
                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
                <option value="all">Status: All</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
            </select>
        )}
        {correctionSegment === 'resolved' && (
            <button
                type="button"
                onClick={() => void handlePurgeResolvedCorrections()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                title={`Delete resolved corrections older than ${CORRECTION_RETENTION_DAYS} days`}
            >
                Purge older than {CORRECTION_RETENTION_DAYS} days
            </button>
        )}
        <button
            type="button"
            onClick={exportCorrectionsCsv}
            disabled={filteredCorrections.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download the currently visible correction requests as CSV"
        >
            <Download size={15} /> Export CSV
        </button>
    </div>
)}
```

- [ ] **Step 6: Update filteredCorrections logic**

`filteredCorrections` should continue to apply client-side search on top of the server-filtered `corrections`. The existing implementation already does this; keep it but ensure it still works when `correctionSegment` is `pending` or `resolved`.

- [ ] **Step 7: Replace corrections table body with card list**

Locate the corrections table body (around line 2098-2125). Replace with a cleaner card/table hybrid. Keep it inside the existing `<table>` structure so the surrounding layout is not disrupted, or replace the corrections section entirely with a dedicated card grid.

Recommended minimal change: replace the corrections row rendering with card rows. Insert after the existing corrections table body block:

```tsx
{activeTab === 'corrections' && (corrections.length === 0 ? (
    <tr>
        <td colSpan={7} className="px-6 py-10">
            <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center dark:border-slate-600 dark:bg-slate-900/40">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {correctionSegment === 'pending' && 'No pending corrections'}
                    {correctionSegment === 'resolved' && 'No resolved corrections in the last 30 days'}
                    {correctionSegment === 'all' && 'No correction requests found'}
                </h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {correctionSegment === 'pending' && 'You are all caught up.'}
                    {correctionSegment === 'resolved' && 'Recent decisions appear here for 30 days.'}
                    {correctionSegment === 'all' && 'Use the filters to find historical requests.'}
                </p>
            </div>
        </td>
    </tr>
) : filteredCorrections.length === 0 ? (
    <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500 text-sm">No correction requests match the current search.</td></tr>
) : filteredCorrections.map((correction) => (
    <tr key={correction.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 align-top">
        <td colSpan={7} className="p-0">
            <div className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {correction.user?.first_name?.[0]}{correction.user?.last_name?.[0]}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {correction.user?.first_name} {correction.user?.last_name}
                            </p>
                            <p className="text-xs text-slate-500">{correction.user?.email || correction.user_id}</p>
                        </div>
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                            correction.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                                : correction.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                : correction.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                            {correction.status}
                        </span>
                    </div>
                    <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-semibold">{new Date(correction.requested_start_time).toLocaleString()}</span>
                        {' – '}
                        <span className="font-semibold">{new Date(correction.requested_end_time).toLocaleString()}</span>
                        {' '}
                        <span className="text-xs text-slate-500">({formatDurationHM(correction.requested_duration_seconds)})</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{correction.reason}</p>
                    {correction.status !== 'PENDING' && correction.reviewer_note && (
                        <p className="mt-1 text-xs text-slate-500 italic">Note: {correction.reviewer_note}</p>
                    )}
                    {correction.status !== 'PENDING' && correction.reviewed_at && (
                        <p className="mt-1 text-xs text-slate-400">Reviewed {new Date(correction.reviewed_at).toLocaleString()}</p>
                    )}
                </div>
                <div className="shrink-0">
                    {correction.status === 'PENDING' ? (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                                onClick={() => void handleReviewCorrection(correction.id, 'approve')}
                            >
                                Approve
                            </button>
                            <button
                                type="button"
                                className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                onClick={() => void handleReviewCorrection(correction.id, 'reject')}
                            >
                                Reject
                            </button>
                        </div>
                    ) : (
                        <span className="text-xs text-slate-400">Reviewed</span>
                    )}
                </div>
            </div>
        </td>
    </tr>
)))}
```

Remove the original corrections table body block after inserting the new one.

- [ ] **Step 8: Build and lint frontend**

Run:
```bash
cd frontend && npm run build && npm run lint
```
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/Admin.tsx
git commit -m "feat(corrections): redesign admin corrections tab with segments and purge"
```

---

## Task 6: Add frontend e2e tests

**Files:**
- Create: `frontend/tests/admin-corrections.spec.ts`

**Interfaces:**
- Consumes: seeded admin user, backend API for creating corrections
- Produces: Playwright tests covering default pending view and purge flow

- [ ] **Step 1: Create e2e test file**

Create `frontend/tests/admin-corrections.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Admin corrections tab', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="email"]', 'admin@webforxtech.com');
        await page.fill('input[type="password"]', process.env.SEED_ADMIN_PASSWORD || 'admin-password');
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');
    });

    test('defaults to pending corrections', async ({ page }) => {
        await page.goto('/admin?tab=corrections');
        await expect(page.getByRole('button', { name: /pending/i })).toHaveClass(/bg-primary/);
        await expect(page.getByText('No pending corrections')).toBeVisible();
    });

    test('can switch to resolved segment', async ({ page }) => {
        await page.goto('/admin?tab=corrections');
        await page.getByRole('button', { name: /resolved/i }).click();
        await expect(page.getByText(/last 30 days/i)).toBeVisible();
    });

    test('can switch to all segment and use status filter', async ({ page }) => {
        await page.goto('/admin?tab=corrections');
        await page.getByRole('button', { name: /all/i }).click();
        await page.selectOption('select', 'APPROVED');
        await expect(page.getByText(/approved/i).first()).toBeVisible();
    });
});
```

Use the actual login selectors from the codebase; inspect `frontend/src/pages/Login.tsx` if selectors differ.

- [ ] **Step 2: Run e2e tests locally**

Ensure backend and frontend are running:
```bash
cd backend && npm run dev &
cd frontend && npm run dev &
cd frontend && npx playwright test tests/admin-corrections.spec.ts
```
Expected: Tests pass or fail only on environment setup issues, not on app behavior.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/admin-corrections.spec.ts
git commit -m "test(corrections): add admin corrections e2e coverage"
```

---

## Task 7: Final integration and quality gates

**Files:**
- All modified files

- [ ] **Step 1: Run backend checks**

```bash
cd backend && npm run build && npm test -- correctionRetention.test.ts
```
Expected: PASS.

- [ ] **Step 2: Run frontend checks**

```bash
cd frontend && npm run build && npm run lint && npm run test:unit
```
Expected: PASS.

- [ ] **Step 3: Run full e2e suite**

```bash
cd frontend && npx playwright test
```
Expected: PASS (existing tests still pass; new tests pass).

- [ ] **Step 4: Update AGENT_HANDBOOK if needed**

If deployment topology or env vars changed materially, update `AGENT_HANDBOOK.md`. For this feature, no update is required unless `CORRECTION_RETENTION_DAYS` becomes required in production (it has a default).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(corrections): admin corrections redesign - default pending, 30d resolved retention, purge"
```

---

## Deployment Order

1. **Backend first**: deploy `backend/` to Vercel so the new query params and purge endpoint exist.
2. **Frontend second**: deploy `frontend/` to Vercel.
3. **Cron**: verify `correction-retention` cron appears in Vercel dashboard after backend deploy.
4. **Smoke test**: log in as admin, visit `/admin?tab=corrections`, confirm Pending is default, switch segments, approve/reject if any pending exist.

---

## Self-Review Checklist

- [ ] Spec coverage: every requirement in the design spec has at least one task.
- [ ] No placeholders: no TBD/TODO/fill-in-later steps.
- [ ] Type consistency: service/controller/route signatures match.
- [ ] Production safety: no schema migration, backward-compatible API shape, batched deletes.
