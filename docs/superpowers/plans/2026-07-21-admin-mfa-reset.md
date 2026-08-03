# Admin/Manager MFA Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admins and Managers reset a locked-out user's MFA enrollment (`mfa_enabled: false, mfa_secret: null`) so the user can log in with just their password and re-enroll a new device through the existing self-service `/auth/mfa/setup` → `/auth/mfa/verify` flow.

**Architecture:** One new endpoint, `POST /api/v1/users/:id/mfa/reset`, added to the existing `userRoutes.ts` / `mfaController.ts` split, reusing the org-scoped `requireRole(['Admin', 'Manager'])` pattern already used by `/users/:id/auth-events`. A new fire-and-forget notification email tells the affected user their MFA was reset. A manual `prisma.auditLog.create` call (the codebase's actual established pattern — not the unused `auditMiddleware.ts` helper) records the action. Frontend adds an "MFA" status column with a "Reset" action to the existing Users tab table in `Admin.tsx`.

**Tech Stack:** Express + TypeScript, Prisma/PostgreSQL, Jest + Supertest (backend tests), React + Vite, Vitest + Testing Library (frontend tests).

## Global Constraints

- Follow existing file conventions exactly — do not introduce new patterns (e.g. do not wire the unused `auditMiddleware.ts` `auditLog()` helper; use the inline `prisma.auditLog.create` pattern used everywhere else).
- No new npm dependencies.
- Every mutation must be scoped by `organization_id: req.user!.organization_id` — never let an Admin/Manager act on a user outside their own organization.
- Resetting MFA must be idempotent — calling it twice must not error.
- Email failures must never fail the HTTP response (fire-and-forget, matches `sendWelcomeEmail` usage in `userController.ts:558-563`).

Spec: `docs/superpowers/specs/2026-07-21-admin-mfa-reset-design.md`

---

### Task 1: MFA reset notification email

**Files:**
- Modify: `backend/src/services/emailService.ts`

**Interfaces:**
- Produces: `MfaResetNotificationEmailOptions { to: string; firstName: string }` and `sendMfaResetNotificationEmail(opts: MfaResetNotificationEmailOptions): Promise<void>`, both exported from `backend/src/services/emailService.ts`. Task 2 imports and calls this.

This file has no dedicated test file in this repo (`sendWelcomeEmail`, `sendPasswordResetEmail` etc. are only exercised indirectly, via `jest.mock` in the controllers that call them). Follow that same convention — no new test file here; Task 2's controller test mocks this function.

- [ ] **Step 1: Add the email function**

Add this after `sendPasswordResetEmail` (after line 172, before the `// ─── Access request` comment) in `backend/src/services/emailService.ts`:

```ts
// ─── MFA reset notification (admin/manager initiated) ─────────────────────────

export interface MfaResetNotificationEmailOptions {
    to: string;
    firstName: string;
}

export const sendMfaResetNotificationEmail = async (opts: MfaResetNotificationEmailOptions): Promise<void> => {
    const client = getClient();
    if (!client) {
        if (env.nodeEnv === 'development') {
            console.log(`[email:dev] MFA reset notification skipped (no RESEND_API_KEY) — ${opts.to}`);
        }
        return;
    }

    const body = `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0f172a;">Your two-factor authentication was reset</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
        Hi ${opts.firstName}, an administrator on your account reset two-factor authentication (MFA) for your login. You can now sign in with just your password, and set up a new authenticator device from your account settings whenever you're ready.
      </p>

      ${MUTED('If you did not expect this, contact your administrator right away.')}
    `;

    await send(client, {
        from: env.emailFrom,
        to: opts.to,
        subject: 'Your two-factor authentication was reset',
        html: BASE_HTML('MFA Reset', body),
    });
};
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/emailService.ts
git commit -m "feat(mfa): add MFA reset notification email"
```

---

### Task 2: `POST /api/v1/users/:id/mfa/reset` endpoint

**Files:**
- Modify: `backend/src/controllers/mfaController.ts`
- Modify: `backend/src/routes/userRoutes.ts`
- Create: `backend/tests/mfaReset.test.ts`

**Interfaces:**
- Consumes: `sendMfaResetNotificationEmail` from Task 1 (`backend/src/services/emailService.ts`).
- Produces: `resetUserMfa(req: AuthRequest, res: Response): Promise<void>`, exported from `backend/src/controllers/mfaController.ts`, wired at `POST /api/v1/users/:id/mfa/reset`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/mfaReset.test.ts`:

```ts
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import userRoutes from '../src/routes/userRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        user: {
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        mfaChallenge: {
            deleteMany: jest.fn(),
        },
        auditLog: {
            create: jest.fn(),
        },
    },
}));

jest.mock('../src/services/emailService', () => ({
    __esModule: true,
    sendMfaResetNotificationEmail: jest.fn(),
}));

import prisma from '../src/config/db';
import { sendMfaResetNotificationEmail } from '../src/services/emailService';
const mockSendMfaResetEmail = sendMfaResetNotificationEmail as jest.Mock;

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const makeToken = (userId: string, role: string, organizationId = 'org-1') =>
    jwt.sign({ userId, email: `${userId}@test.com`, role, organization_id: organizationId }, JWT_SECRET);

const adminToken = makeToken('user-admin-1', 'Admin');
const managerToken = makeToken('user-mgr-1', 'Manager');
const employeeToken = makeToken('user-emp-1', 'Employee');

const app = express();
app.use(express.json());
app.use('/api/v1/users', userRoutes);

const mfaEnabledUser = {
    id: 'user-target-1',
    email: 'target@test.com',
    first_name: 'Target',
    last_name: 'User',
    organization_id: 'org-1',
    mfa_enabled: true,
    mfa_secret: 'encrypted-secret',
};

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.mfaChallenge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    mockSendMfaResetEmail.mockResolvedValue(undefined);
});

describe('POST /api/v1/users/:id/mfa/reset', () => {
    it('Admin can reset MFA for a user in their org', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(mfaEnabledUser);
        (prisma.user.update as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.mfa_enabled).toBe(false);
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'user-target-1' },
            data: { mfa_enabled: false, mfa_secret: null },
        });
        expect(prisma.mfaChallenge.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-target-1' } });
    });

    it('Manager can reset MFA for any user in their org (org-wide, not team-scoped)', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(mfaEnabledUser);
        (prisma.user.update as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
    });

    it('returns 403 for Employee role', async () => {
        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
        expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('returns 404 when the target user is in a different organization', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(prisma.user.findFirst).toHaveBeenCalledWith({
            where: { id: 'user-target-1', organization_id: 'org-1' },
        });
    });

    it('is idempotent when MFA is already disabled', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.mfa_enabled).toBe(false);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('still returns 200 when the notification email fails to send', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(mfaEnabledUser);
        (prisma.user.update as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });
        mockSendMfaResetEmail.mockRejectedValue(new Error('Resend down'));

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
    });

    it('writes an audit log entry for the reset', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(mfaEnabledUser);
        (prisma.user.update as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });

        await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: {
                user_id: 'user-admin-1',
                organization_id: 'org-1',
                action: 'user_mfa_reset',
                resource: 'user',
                metadata: {
                    target_user_id: 'user-target-1',
                    target_email: 'target@test.com',
                },
            },
        });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest tests/mfaReset.test.ts`
Expected: FAIL — `resetUserMfa` does not exist / route returns 404.

- [ ] **Step 3: Implement `resetUserMfa`**

First, add the new import at the top of `backend/src/controllers/mfaController.ts`. Change:

```ts
import { decryptSecret, encryptSecret } from '../utils/crypto';
```

to:

```ts
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { sendMfaResetNotificationEmail } from '../services/emailService';
```

Then add this function to `backend/src/controllers/mfaController.ts`, after `getMfaStatus` (end of file, after line 268):

```ts

/**
 * POST /users/:id/mfa/reset
 * Admin/Manager-initiated MFA reset. Bypasses the TOTP requirement in
 * disableMfa() above — that's the point: this exists for the case where
 * the user has lost the device that would produce a valid code.
 * Ends in the same state as self-service disable; the user re-enrolls
 * via /auth/mfa/setup + /auth/mfa/verify whenever they're ready.
 */
export const resetUserMfa = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const targetId = req.params.id;
        const user = await prisma.user.findFirst({
            where: { id: targetId, organization_id: req.user!.organization_id },
        });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (!user.mfa_enabled) {
            res.status(200).json({ message: 'MFA was already disabled for this user.', mfa_enabled: false });
            return;
        }

        await prisma.user.update({
            where: { id: targetId },
            data: { mfa_enabled: false, mfa_secret: null },
        });

        await prisma.mfaChallenge.deleteMany({ where: { user_id: targetId } });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: req.user!.userId,
                    organization_id: req.user!.organization_id,
                    action: 'user_mfa_reset',
                    resource: 'user',
                    metadata: {
                        target_user_id: user.id,
                        target_email: user.email,
                    },
                },
            });
        } catch (error) {
            console.error('Failed to write MFA reset audit log:', error);
        }

        sendMfaResetNotificationEmail({
            to: user.email,
            firstName: user.first_name,
        }).catch((err) => console.error('Failed to send MFA reset notification email:', err));

        res.status(200).json({
            message: 'MFA has been reset. The user can set up a new device from their account settings.',
            mfa_enabled: false,
        });
    } catch (error) {
        console.error('MFA reset error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
```

This is the same fire-and-forget email pattern already used in `userController.ts`'s `createUser` (see `backend/src/controllers/userController.ts:557-563`).

- [ ] **Step 4: Wire the route**

In `backend/src/routes/userRoutes.ts`, change the import block:

```ts
import {
    getMe,
    getAllUsers,
    createUser,
    updateUser,
    deleteUser,
    permanentlyDeleteUser,
    updateMe,
    getRoles,
    getMyNotifications,
    getMyNotification,
    markMyNotificationRead,
    deleteMyNotification,
    getMyWellbeing,
    importUsers,
    getUserAuthEvents,
} from '../controllers/userController';
```

stays as-is. Add a second import line right after it:

```ts
import { resetUserMfa } from '../controllers/mfaController';
```

Add the route after `router.get('/:id/auth-events', ...)` (line 32):

```ts
router.post('/:id/mfa/reset', authenticateToken, requireRole(['Admin', 'Manager']), resetUserMfa);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/mfaReset.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 6: Run the full backend test suite to check for regressions**

Run: `cd backend && npm test`
Expected: PASS, no regressions in `tests/user.test.ts` or `tests/googleMfaAuth.test.ts`.

- [ ] **Step 7: Typecheck and build**

Run: `cd backend && npm run build`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/controllers/mfaController.ts backend/src/routes/userRoutes.ts backend/tests/mfaReset.test.ts
git commit -m "feat(mfa): add admin/manager MFA reset endpoint"
```

---

### Task 3: Expose `mfa_enabled` in the users list

**Files:**
- Modify: `backend/src/controllers/userController.ts:336-357` (`getAllUsers`)
- Modify: `backend/tests/user.test.ts:236-270` (`GET /api/v1/users` describe block)

**Interfaces:**
- Produces: `getAllUsers` response items now include `mfa_enabled: boolean`. Task 4's frontend `UserSummary` type consumes this field.

- [ ] **Step 1: Update the existing test to assert the new field**

In `backend/tests/user.test.ts`, in the `describe('GET /api/v1/users', ...)` block, update the first mock and assertion (around line 238-249):

```ts
    it('returns 200 with users list for Admin', async () => {
        (prisma.user.findMany as jest.Mock).mockResolvedValue([
            { id: 'user-1', email: 'alice@test.com', first_name: 'Alice', last_name: 'Smith', is_active: true, mfa_enabled: true, role: { name: 'Employee' } },
            { id: 'user-2', email: 'bob@test.com', first_name: 'Bob', last_name: 'Jones', is_active: true, mfa_enabled: false, role: { name: 'Manager' } },
        ]);

        const res = await request(app)
            .get('/api/v1/users')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].mfa_enabled).toBe(true);
        expect(res.body[1].mfa_enabled).toBe(false);
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/user.test.ts -t "returns 200 with users list for Admin"`
Expected: FAIL — `res.body[0].mfa_enabled` is `undefined`.

- [ ] **Step 3: Add the field to the Prisma select**

In `backend/src/controllers/userController.ts`, in `getAllUsers` (line 336-357), change the `select` block:

```ts
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                team_name: true,
                is_active: true,
                hourly_rate: true,
                employment_type: true,
                min_weekly_hours: true,
                mfa_enabled: true,
                role: { select: { name: true } },
            },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/user.test.ts`
Expected: PASS, all tests in this file green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/userController.ts backend/tests/user.test.ts
git commit -m "feat(mfa): expose mfa_enabled on the users list endpoint"
```

---

### Task 4: Frontend — MFA status column and Reset action

**Files:**
- Modify: `frontend/src/types/api.ts:16-27` (`UserSummary`)
- Modify: `frontend/src/pages/Admin.tsx` (users table header ~line 1758-1766, users table row ~line 1897-1955, handlers ~line 679-716)
- Create: `frontend/src/tests/AdminMfaReset.test.tsx`

**Interfaces:**
- Consumes: `mfa_enabled: boolean` field from Task 3's `GET /users` response, and `POST /users/:id/mfa/reset` from Task 2.

- [ ] **Step 1: Add `mfa_enabled` to `UserSummary`**

In `frontend/src/types/api.ts`, update the interface (lines 16-27):

```ts
export interface UserSummary {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    team_name?: string | null;
    is_active: boolean;
    hourly_rate?: number | null;
    role?: RoleSummary;
    employment_type?: string | null;
    min_weekly_hours?: number | null;
    mfa_enabled?: boolean;
}
```

- [ ] **Step 2: Write the failing frontend test**

Create `frontend/src/tests/AdminMfaReset.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Admin from '../pages/Admin';
import api from '../services/api';

vi.mock('../services/api', async () => {
    const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
    return {
        ...actual,
        default: {
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
        },
    };
});

type MockedApi = {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

describe('Admin users tab — MFA reset', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('confirm', vi.fn(() => true));

        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/users') {
                return Promise.resolve({
                    data: [
                        {
                            id: 'user-1',
                            email: 'alice@test.com',
                            first_name: 'Alice',
                            last_name: 'Smith',
                            is_active: true,
                            mfa_enabled: true,
                            role: { name: 'Employee' },
                        },
                        {
                            id: 'user-2',
                            email: 'bob@test.com',
                            first_name: 'Bob',
                            last_name: 'Jones',
                            is_active: true,
                            mfa_enabled: false,
                            role: { name: 'Employee' },
                        },
                    ],
                });
            }

            if (url === '/projects') return Promise.resolve({ data: [] });
            if (url === '/integrations') return Promise.resolve({ data: { integrations: [] } });

            return Promise.resolve({ data: {} });
        });

        mockedApi.post.mockResolvedValue({ data: { message: 'MFA has been reset.', mfa_enabled: false } });
    });

    it('shows a Reset action only for users with MFA enabled, and calls the reset endpoint', async () => {
        render(
            <MemoryRouter initialEntries={['/admin?tab=users']}>
                <Admin />
            </MemoryRouter>
        );

        await screen.findByText('Alice Smith');

        const resetButtons = await screen.findAllByRole('button', { name: /reset mfa/i });
        expect(resetButtons).toHaveLength(1); // only Alice (mfa_enabled: true), not Bob

        await userEvent.click(resetButtons[0]);

        await waitFor(() => {
            expect(mockedApi.post).toHaveBeenCalledWith('/users/user-1/mfa/reset');
        });
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/tests/AdminMfaReset.test.tsx`
Expected: FAIL — no "Reset MFA" button exists yet.

- [ ] **Step 4: Add the handler**

In `frontend/src/pages/Admin.tsx`, add this function right after `handleUpdateUserTeam` (after line 704, before `handleSaveRate`):

```ts
    async function handleResetUserMfa(user: UserSummary) {
        if (!window.confirm(`Reset MFA for ${user.first_name} ${user.last_name}? They will need to set up a new authenticator device.`)) return;

        try {
            await api.post(`/users/${user.id}/mfa/reset`);
            setUsers((current) => current.map((item) => (
                item.id === user.id ? { ...item, mfa_enabled: false } : item
            )));
        } catch (error) {
            console.error('Error resetting user MFA:', error);
            alert('Failed to reset MFA for this user.');
        }
    }
```

- [ ] **Step 5: Add the table header cell**

In `frontend/src/pages/Admin.tsx`, in the users-tab header block (lines 1758-1766), add an "MFA" column after "Status":

```tsx
                                    {activeTab === 'users' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Name</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Email</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Team / Group</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-right">Rate ($/hr)</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">MFA</th>
                                        </>
                                    )}
```

- [ ] **Step 6: Add the table row cell**

In `frontend/src/pages/Admin.tsx`, in the users row block, the Status `<td>` currently ends the row at line 1954 (`</td>` then `</tr>` at line 1955):

```tsx
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${u.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span> {u.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
```

Replace it with (adds the new MFA `<td>` before `</tr>`):

```tsx
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${u.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span> {u.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${u.mfa_enabled ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${u.mfa_enabled ? 'bg-emerald-500' : 'bg-slate-400'}`}></span> {u.mfa_enabled ? 'Enabled' : 'Off'}
                                                </span>
                                                {u.mfa_enabled && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleResetUserMfa(u)}
                                                        className="text-xs font-bold text-rose-600 hover:text-rose-700"
                                                    >
                                                        Reset MFA
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
```

- [ ] **Step 7: Run the frontend test to verify it passes**

Run: `cd frontend && npx vitest run src/tests/AdminMfaReset.test.tsx`
Expected: PASS.

- [ ] **Step 8: Run the full frontend test suite and typecheck to check for regressions**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: PASS, no regressions (in particular re-check `src/tests/AdminAuditLogs.test.tsx`, which also renders the Users tab).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/pages/Admin.tsx frontend/src/tests/AdminMfaReset.test.tsx
git commit -m "feat(mfa): add MFA reset action to admin users table"
```

---

## Post-implementation verification

- [ ] Run `cd backend && npm run build && npm test` — full backend suite green.
- [ ] Run `cd frontend && npx tsc -b && npm run lint -- --max-warnings=2 && npx vitest run` — full frontend suite green.
- [ ] Manually verify in the dev server: an Admin and a Manager account can each see the "Reset MFA" action on an MFA-enabled user, click it, confirm, and see the badge flip to "Off"; the row for a user without MFA enabled shows no action button.
