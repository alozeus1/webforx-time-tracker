import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
    prisma?: PrismaClient;
};

const getDatasourceUrl = () => {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        return undefined;
    }

    if (process.env.VERCEL !== '1') {
        return databaseUrl;
    }

    try {
        const url = new URL(databaseUrl);
        if (!url.searchParams.has('connection_limit')) {
            url.searchParams.set('connection_limit', '1');
        }
        if (!url.searchParams.has('pool_timeout')) {
            url.searchParams.set('pool_timeout', '30');
        }

        return url.toString();
    } catch {
        return databaseUrl;
    }
};

const prisma =
    globalForPrisma.prisma
    || new PrismaClient({
        datasources: {
            db: {
                url: getDatasourceUrl(),
            },
        },
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export default prisma;
