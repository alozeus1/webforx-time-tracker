import { NextFunction, Request, Response } from 'express';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: { auditLog: { create: jest.fn() } },
}));

import prisma from '../src/config/db';
import { auditLog } from '../src/middlewares/auditMiddleware';

describe('audit middleware payload minimisation', () => {
    it('records field names but never request values', async () => {
        const req = {
            user: { userId: 'user-1', organization_id: 'org-1' },
            method: 'POST',
            originalUrl: '/api/v1/example',
            query: { page: '1', token: 'do-not-record' },
            body: { email: 'person@example.test', password: 'do-not-record', api_token: 'do-not-record' },
        } as unknown as Request;
        const res = {} as Response;
        const next = jest.fn() as NextFunction;

        await auditLog('example_action')(req as never, res, next);

        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                metadata: {
                    method: 'POST',
                    query_fields: ['page', 'token'],
                    body_fields: ['email', 'password', 'api_token'],
                },
            }),
        });
        expect(JSON.stringify((prisma.auditLog.create as jest.Mock).mock.calls[0][0])).not.toContain('do-not-record');
        expect(next).toHaveBeenCalledTimes(1);
    });
});
