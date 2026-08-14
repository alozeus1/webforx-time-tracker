jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        activeTimer: { findFirst: jest.fn(), delete: jest.fn() },
        timeEntry: { create: jest.fn() },
        timeEntryTag: { createMany: jest.fn() },
        tag: { findMany: jest.fn() },
        timerPolicyConfig: { findFirst: jest.fn() },
        notification: { create: jest.fn() },
        auditLog: { create: jest.fn() },
        $transaction: jest.fn(),
    },
}));

import prisma from '../src/config/db';
import { stopActiveTimerWithReason } from '../src/services/activeTimerService';

const START = new Date('2026-08-12T08:00:00.000Z');

const makeTimer = (overrides: Record<string, unknown> = {}) => ({
    id: 'timer-1',
    user_id: 'user-1',
    organization_id: 'org-1',
    project_id: 'proj-1',
    task_description: 'Deploy bastion',
    start_time: START,
    persisted_state: {},
    paused_duration_seconds: 0,
    is_paused: false,
    paused_at: null,
    last_heartbeat_at: null,
    last_client_activity_at: null,
    last_active_ping: null,
    client_visibility: null,
    client_has_focus: null,
    ...overrides,
});

const createdEntry = () => (prisma.timeEntry.create as jest.Mock).mock.calls[0][0].data;
const auditMetadata = () => (prisma.auditLog.create as jest.Mock).mock.calls[0][0].data.metadata;

beforeEach(() => {
    jest.clearAllMocks();
    // Default policy row: 15-minute abandoned-timer grace.
    (prisma.timerPolicyConfig.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.timeEntry.create as jest.Mock).mockResolvedValue({ id: 'entry-1' });
    (prisma.tag.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.create as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        timeEntry: { create: (...a: unknown[]) => (prisma.timeEntry.create as jest.Mock)(...a) },
        timeEntryTag: { createMany: (...a: unknown[]) => (prisma.timeEntryTag.createMany as jest.Mock)(...a) },
        tag: { findMany: (...a: unknown[]) => (prisma.tag.findMany as jest.Mock)(...a) },
        activeTimer: { delete: (...a: unknown[]) => (prisma.activeTimer.delete as jest.Mock)(...a) },
    }));
});

describe('clamping to proven activity', () => {
    it('trims an abandoned timer back to the last heartbeat plus the grace window', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer({
            last_heartbeat_at: new Date('2026-08-12T09:00:00.000Z'),
        }));

        // The sweep notices six hours later; only the proven hour (plus grace) is paid.
        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'abandoned_timer',
            triggeredAt: new Date('2026-08-12T15:00:00.000Z'),
        });

        expect(createdEntry().end_time.toISOString()).toBe('2026-08-12T09:15:00.000Z');
        expect(createdEntry().duration).toBe(75 * 60);
        expect(auditMetadata().clamped_to_heartbeat).toBe(true);
    });

    it('does not clamp a bot-started timer back to its phantom heartbeat', async () => {
        // A Mattermost timer's last_heartbeat_at is simply the moment the row was created,
        // so clamping to it discarded the entire session bar the grace window. Its proof of
        // work is the explicit start/stop command, and the session cap still bounds it.
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer({
            persisted_state: { source: 'mattermost' },
            last_heartbeat_at: START,
        }));

        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'active_duration_limit',
            triggeredAt: new Date('2026-08-12T16:00:00.000Z'),
        });

        expect(createdEntry().end_time.toISOString()).toBe('2026-08-12T16:00:00.000Z');
        expect(createdEntry().duration).toBe(8 * 60 * 60);
        expect(auditMetadata().clamped_to_heartbeat).toBe(false);
    });

    it('clamps a session that hit the active-duration cap the same way', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer({
            last_heartbeat_at: new Date('2026-08-12T10:00:00.000Z'),
        }));

        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'active_duration_limit',
            triggeredAt: new Date('2026-08-12T16:00:00.000Z'),
        });

        expect(createdEntry().end_time.toISOString()).toBe('2026-08-12T10:15:00.000Z');
    });

    it('falls back to client activity, then to the last ping, when there is no heartbeat', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer({
            last_client_activity_at: new Date('2026-08-12T09:30:00.000Z'),
        }));

        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'abandoned_timer',
            triggeredAt: new Date('2026-08-12T15:00:00.000Z'),
        });

        expect(createdEntry().end_time.toISOString()).toBe('2026-08-12T09:45:00.000Z');
    });

    it('does not extend a timer that stopped before the grace window elapsed', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer({
            last_heartbeat_at: new Date('2026-08-12T08:50:00.000Z'),
        }));

        // Triggered only 5 minutes after the heartbeat: clamping must never push the
        // end time forward, only back.
        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'abandoned_timer',
            triggeredAt: new Date('2026-08-12T08:55:00.000Z'),
        });

        expect(createdEntry().end_time.toISOString()).toBe('2026-08-12T08:55:00.000Z');
        expect(auditMetadata().clamped_to_heartbeat).toBe(false);
    });

    it('leaves idle_timeout alone — its paused span is already excluded', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer({
            last_heartbeat_at: new Date('2026-08-12T09:00:00.000Z'),
        }));

        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'idle_timeout',
            triggeredAt: new Date('2026-08-12T12:00:00.000Z'),
        });

        expect(createdEntry().end_time.toISOString()).toBe('2026-08-12T12:00:00.000Z');
    });

    it('still subtracts paused time from the clamped duration', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer({
            last_heartbeat_at: new Date('2026-08-12T11:00:00.000Z'),
            paused_duration_seconds: 1800,
        }));

        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'abandoned_timer',
            triggeredAt: new Date('2026-08-12T18:00:00.000Z'),
        });

        // 08:00 → 11:15 is 3h15m, less 30m paused.
        expect(createdEntry().duration).toBe(165 * 60);
    });
});

describe('flags and messaging', () => {
    it('always writes auto_stopped with the real reason', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer());

        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'abandoned_timer',
            triggeredAt: new Date('2026-08-12T12:00:00.000Z'),
        });

        expect(createdEntry()).toMatchObject({ auto_stopped: true, stop_reason: 'abandoned_timer' });
    });

    it('carries an over-cap attestation from the timer onto the entry', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer({
            persisted_state: { over_daily_cap: true, overtime_reason: 'Release night, approved by Ada.' },
        }));

        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'active_duration_limit',
            triggeredAt: new Date('2026-08-12T12:00:00.000Z'),
        });

        expect(createdEntry()).toMatchObject({
            over_daily_cap: true,
            overtime_reason: 'Release night, approved by Ada.',
        });
    });

    it('tells the user their time was trimmed rather than just "stopped"', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(makeTimer({
            last_heartbeat_at: new Date('2026-08-12T09:00:00.000Z'),
        }));

        await stopActiveTimerWithReason({
            userId: 'user-1',
            organizationId: 'org-1',
            reason: 'abandoned_timer',
            triggeredAt: new Date('2026-08-12T15:00:00.000Z'),
        });

        const message = (prisma.notification.create as jest.Mock).mock.calls[0][0].data.message;
        expect(message).toMatch(/trimmed back to your last confirmed activity/i);
        expect(createdEntry().notes).toMatch(/trimmed back to the last confirmed activity/i);
    });

    it('returns null when there is no timer to stop', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);

        const result = await stopActiveTimerWithReason({
            userId: 'user-1', organizationId: 'org-1', reason: 'abandoned_timer',
        });

        expect(result).toBeNull();
        expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });
});
