import prisma from '../config/db';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Returns the locked PayrollPeriod that covers `entryTime`, or null if the
 * entry falls in an open (or no) period.
 */
export const findLockedPeriodForTime = async (
    organizationId: string,
    entryTime: Date,
): Promise<{ id: string; start_date: Date; end_date: Date } | null> => {
    return db.payrollPeriod.findFirst({
        where: {
            organization_id: organizationId,
            status: 'locked',
            start_date: { lte: entryTime },
            end_date: { gte: entryTime },
        },
        select: { id: true, start_date: true, end_date: true },
    });
};

/**
 * Throws a structured error object that controllers can catch and turn into a 423 response.
 * Usage: `await assertPeriodNotLocked(orgId, entryStartTime)`
 */
export const assertPeriodNotLocked = async (
    organizationId: string,
    entryTime: Date,
): Promise<void> => {
    const locked = await findLockedPeriodForTime(organizationId, entryTime);
    if (locked) {
        const err = new Error('This time entry falls within a locked payroll period and cannot be modified.');
        (err as NodeJS.ErrnoException).code = 'PERIOD_LOCKED';
        throw err;
    }
};
