import request from 'supertest';

process.env.VERCEL = '1';
process.env.ENABLE_BACKGROUND_WORKERS = 'false';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        $queryRaw: jest.fn(),
    },
}));

import prisma from '../src/config/db';
import app from '../src/index';

describe('health check', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (prisma.$connect as jest.Mock).mockResolvedValue(undefined);
    });

    it('returns healthy only after a database probe succeeds', async () => {
        (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

        const res = await request(app).get('/api/v1/health');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
        expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('returns 503 when the database probe fails', async () => {
        (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('database unavailable'));

        const res = await request(app).get('/api/v1/health');

        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ status: 'unhealthy', database: 'unavailable' });
    });
});
