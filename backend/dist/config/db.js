"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const globalForPrisma = globalThis;
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
    }
    catch (_a) {
        return databaseUrl;
    }
};
const prisma = globalForPrisma.prisma
    || new client_1.PrismaClient({
        datasources: {
            db: {
                url: getDatasourceUrl(),
            },
        },
    });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
exports.default = prisma;
