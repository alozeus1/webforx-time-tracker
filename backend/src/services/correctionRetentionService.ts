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

export const purgeResolvedCorrections = async (organizationId: string | undefined, retentionDays: number): Promise<number> => {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const BATCH_SIZE = 1000;
    let deleted = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const where: Record<string, unknown> = {
            status: { in: Array.from(RESOLVED_STATUSES) },
            reviewed_at: { lt: cutoff },
        };
        if (organizationId) {
            where.organization_id = organizationId;
        }

        const rows = await prisma.timerCorrectionRequest.findMany({
            where,
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
