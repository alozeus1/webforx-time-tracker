process.env.RESEND_API_KEY = 're_test_reports';
process.env.EMAIL_FROM = 'Web Forx Reports <reports@webforxtech.com>';

const mockSend = jest.fn();

jest.mock('resend', () => ({
    Resend: jest.fn().mockImplementation(() => ({
        emails: { send: mockSend },
    })),
}));

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        organization: {
            findMany: jest.fn(),
        },
        timeEntry: {
            findMany: jest.fn(),
        },
        user: {
            findMany: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';
import { generateAndEmailDailyReport } from '../src/services/reporterService';

beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
});

describe('daily report digest', () => {
    it('sends one report per active organization, scoped to that org', async () => {
        (prisma.organization.findMany as jest.Mock).mockResolvedValue([
            { id: 'org-1', name: 'Web Forx', settings: {} },
            { id: 'org-2', name: 'Acme Co', settings: { daily_report_recipient: 'ops@acme.com' } },
        ]);

        await generateAndEmailDailyReport();

        expect(prisma.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { status: 'active' },
        }));
        expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ organization_id: 'org-1' }),
        }));
        expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ organization_id: 'org-2' }),
        }));
        expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('falls back to the default recipient when an org has no configured recipient', async () => {
        (prisma.organization.findMany as jest.Mock).mockResolvedValue([
            { id: 'org-1', name: 'Web Forx', settings: {} },
        ]);

        await generateAndEmailDailyReport();

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: ['admin@webforxtech.com'] }));
    });

    it('uses the organization-configured recipient when one is set', async () => {
        (prisma.organization.findMany as jest.Mock).mockResolvedValue([
            { id: 'org-2', name: 'Acme Co', settings: { daily_report_recipient: 'ops@acme.com' } },
        ]);

        await generateAndEmailDailyReport();

        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: ['ops@acme.com'] }));
    });

    it('keeps sending to other organizations when one organization fails', async () => {
        (prisma.organization.findMany as jest.Mock).mockResolvedValue([
            { id: 'org-1', name: 'Web Forx', settings: {} },
            { id: 'org-2', name: 'Acme Co', settings: { daily_report_recipient: 'ops@acme.com' } },
        ]);
        mockSend
            .mockRejectedValueOnce(new Error('provider outage'))
            .mockResolvedValueOnce({ data: { id: 'email-2' }, error: null });

        await expect(generateAndEmailDailyReport()).resolves.toBeUndefined();

        expect(mockSend).toHaveBeenCalledTimes(2);
    });
});
