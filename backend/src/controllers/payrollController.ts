import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PeriodType = 'weekly' | 'biweekly' | 'semimonthly' | 'custom';

/** Generate PayrollPeriod boundaries for the requested cadence around `anchor`. */
function buildPeriodBounds(
    cadence: PeriodType,
    anchor: Date,
): { start: Date; end: Date }[] {
    const periods: { start: Date; end: Date }[] = [];

    if (cadence === 'weekly') {
        // ISO week: Mon – Sun
        const day = anchor.getUTCDay(); // 0 = Sun
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(anchor);
        monday.setUTCDate(anchor.getUTCDate() + mondayOffset);
        monday.setUTCHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);
        sunday.setUTCHours(23, 59, 59, 999);
        periods.push({ start: monday, end: sunday });
    } else if (cadence === 'biweekly') {
        // Two-week block — Mon–Sun×2 ending on the Sunday on or before anchor's Sunday
        const day = anchor.getUTCDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const thisMon = new Date(anchor);
        thisMon.setUTCDate(anchor.getUTCDate() + mondayOffset);
        thisMon.setUTCHours(0, 0, 0, 0);
        // Use a fixed epoch (2024-01-01 is a Monday) to anchor bi-weekly alignment
        const epochMs = Date.UTC(2024, 0, 1);
        const weeksFromEpoch = Math.floor((thisMon.getTime() - epochMs) / (7 * 86400000));
        const periodWeek = weeksFromEpoch % 2 === 0 ? weeksFromEpoch : weeksFromEpoch - 1;
        const start = new Date(epochMs + periodWeek * 7 * 86400000);
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 13);
        end.setUTCHours(23, 59, 59, 999);
        periods.push({ start, end });
    } else if (cadence === 'semimonthly') {
        const year = anchor.getUTCFullYear();
        const month = anchor.getUTCMonth();
        const day15end = new Date(Date.UTC(year, month, 15, 23, 59, 59, 999));
        const lastDay = new Date(Date.UTC(year, month + 1, 0));
        if (anchor.getUTCDate() <= 15) {
            periods.push({
                start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
                end: day15end,
            });
        } else {
            periods.push({
                start: new Date(Date.UTC(year, month, 16, 0, 0, 0, 0)),
                end: new Date(Date.UTC(year, month, lastDay.getUTCDate(), 23, 59, 59, 999)),
            });
        }
    }

    return periods;
}

// ---------------------------------------------------------------------------
// GET /api/v1/payroll  — list all periods for org
// ---------------------------------------------------------------------------
export const listPayrollPeriods = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const page = Math.max(parseInt(req.query.page as string) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit as string) || 24, 100);
        const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;

        const [periods, total] = await Promise.all([
            db.payrollPeriod.findMany({
                where: {
                    organization_id: orgId,
                    ...(statusFilter ? { status: statusFilter } : {}),
                },
                orderBy: { start_date: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    locker: { select: { id: true, first_name: true, last_name: true, email: true } },
                },
            }),
            db.payrollPeriod.count({
                where: { organization_id: orgId, ...(statusFilter ? { status: statusFilter } : {}) },
            }),
        ]);

        res.status(200).json({ periods, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (error) {
        console.error('[payroll] listPayrollPeriods error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/v1/payroll/generate  — auto-generate period(s) for a cadence
// ---------------------------------------------------------------------------
export const generatePayrollPeriod = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const cadence: PeriodType = req.body?.cadence ?? 'weekly';
        const anchorRaw = req.body?.anchor_date;
        const anchor = anchorRaw ? new Date(anchorRaw) : new Date();

        if (!['weekly', 'biweekly', 'semimonthly', 'custom'].includes(cadence)) {
            res.status(400).json({ message: 'Invalid cadence. Must be weekly, biweekly, semimonthly, or custom.' });
            return;
        }

        if (cadence === 'custom') {
            const { start_date, end_date } = req.body ?? {};
            if (!start_date || !end_date) {
                res.status(400).json({ message: 'custom cadence requires start_date and end_date.' });
                return;
            }
            const start = new Date(start_date);
            const end = new Date(end_date);
            if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
                res.status(400).json({ message: 'Invalid date range for custom period.' });
                return;
            }

            const period = await db.payrollPeriod.upsert({
                where: { organization_id_start_date_end_date: { organization_id: orgId, start_date: start, end_date: end } },
                create: { organization_id: orgId, period_type: 'custom', start_date: start, end_date: end, status: 'open' },
                update: {},
            });
            res.status(201).json({ periods: [period] });
            return;
        }

        const bounds = buildPeriodBounds(cadence, anchor);
        const created = await Promise.all(
            bounds.map((b) =>
                db.payrollPeriod.upsert({
                    where: { organization_id_start_date_end_date: { organization_id: orgId, start_date: b.start, end_date: b.end } },
                    create: { organization_id: orgId, period_type: cadence, start_date: b.start, end_date: b.end, status: 'open' },
                    update: {},
                }),
            ),
        );

        res.status(201).json({ periods: created });
    } catch (error) {
        console.error('[payroll] generatePayrollPeriod error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/v1/payroll/:id/lock  — lock a period
// POST /api/v1/payroll/:id/unlock — unlock a period (Admin only)
// ---------------------------------------------------------------------------
export const lockPayrollPeriod = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const userId = req.user!.userId;
        const { id } = req.params;

        const period = await db.payrollPeriod.findFirst({ where: { id, organization_id: orgId } });
        if (!period) { res.status(404).json({ message: 'Payroll period not found.' }); return; }
        if (period.status === 'locked') { res.status(409).json({ message: 'Period is already locked.' }); return; }

        const updated = await db.payrollPeriod.update({
            where: { id },
            data: { status: 'locked', locked_at: new Date(), locked_by: userId, unlocked_at: null, unlocked_by: null },
        });

        await prisma.auditLog.create({
            data: {
                user_id: userId,
                organization_id: orgId,
                action: 'payroll_period_locked',
                resource: 'payroll_period',
                metadata: { period_id: id, start_date: period.start_date, end_date: period.end_date },
            },
        });

        res.status(200).json(updated);
    } catch (error) {
        console.error('[payroll] lockPayrollPeriod error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const unlockPayrollPeriod = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const userId = req.user!.userId;
        const { id } = req.params;

        const period = await db.payrollPeriod.findFirst({ where: { id, organization_id: orgId } });
        if (!period) { res.status(404).json({ message: 'Payroll period not found.' }); return; }
        if (period.status === 'open') { res.status(409).json({ message: 'Period is already open.' }); return; }

        const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : null;

        const updated = await db.payrollPeriod.update({
            where: { id },
            data: {
                status: 'open',
                unlocked_at: new Date(),
                unlocked_by: userId,
                notes: notes ?? period.notes,
            },
        });

        await prisma.auditLog.create({
            data: {
                user_id: userId,
                organization_id: orgId,
                action: 'payroll_period_unlocked',
                resource: 'payroll_period',
                metadata: { period_id: id, start_date: period.start_date, end_date: period.end_date, notes },
            },
        });

        res.status(200).json(updated);
    } catch (error) {
        console.error('[payroll] unlockPayrollPeriod error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/v1/payroll/lock-check?start_time=<ISO>  — check if a given time is locked
// ---------------------------------------------------------------------------
export const checkLockStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const raw = req.query.start_time;
        if (typeof raw !== 'string') {
            res.status(400).json({ message: 'start_time query param required' });
            return;
        }
        const dt = new Date(raw);
        if (isNaN(dt.getTime())) {
            res.status(400).json({ message: 'Invalid start_time' });
            return;
        }

        const locked = await db.payrollPeriod.findFirst({
            where: { organization_id: orgId, status: 'locked', start_date: { lte: dt }, end_date: { gte: dt } },
        });

        res.status(200).json({ locked: !!locked, period: locked ?? null });
    } catch (error) {
        console.error('[payroll] checkLockStatus error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
