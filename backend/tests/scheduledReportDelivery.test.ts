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
        scheduledReport: {
            findMany: jest.fn(),
            update: jest.fn(),
        },
        timeEntry: {
            findMany: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';
import { processDueScheduledReports } from '../src/services/reporterService';

const monday = new Date('2026-04-06T23:59:00.000Z');

beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([
        {
            id: 'entry-1',
            task_description: 'Weekly delivery work',
            duration: 7200,
            start_time: new Date('2026-04-06T14:00:00.000Z'),
            status: 'approved',
            user: { email: 'employee@webforxtech.com' },
            project: { name: 'Platform Engineering' },
        },
    ]);
    (prisma.scheduledReport.update as jest.Mock).mockResolvedValue({});
});

describe('scheduled report delivery', () => {
    it('sends due weekly reports to configured recipients and records last_sent_at', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'schedule-1',
                frequency: 'weekly',
                day_of_week: 1,
                recipients: ['admin@webforxtech.com'],
                report_type: 'summary',
                last_sent_at: null,
                created_at: new Date('2026-04-01T00:00:00.000Z'),
            },
        ]);

        const result = await processDueScheduledReports(monday);

        expect(result).toMatchObject({ processed: 1, sent: 1, failed: 0, skipped: 0 });
        expect(prisma.scheduledReport.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                is_active: true,
                AND: expect.any(Array),
            }),
        }));
        expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                start_time: {
                    gte: expect.any(Date),
                    lt: expect.any(Date),
                },
            }),
        }));
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
            from: 'Web Forx Reports <reports@webforxtech.com>',
            to: ['admin@webforxtech.com'],
            subject: 'Weekly Summary Report - 2026-03-31 to 2026-04-06',
            attachments: [expect.objectContaining({ filename: 'weekly-summary-report-2026-04-06.pdf' })],
        }));
        expect(prisma.scheduledReport.update).toHaveBeenCalledWith({
            where: { id: 'schedule-1' },
            data: { last_sent_at: monday },
        });
    });

    it('skips due schedules with no valid recipient instead of marking them sent', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'schedule-empty',
                frequency: 'weekly',
                day_of_week: 1,
                recipients: [],
                report_type: 'summary',
                last_sent_at: null,
                created_at: new Date('2026-04-01T00:00:00.000Z'),
            },
        ]);

        const result = await processDueScheduledReports(monday);

        expect(result).toMatchObject({ processed: 1, sent: 0, failed: 0, skipped: 1 });
        expect(mockSend).not.toHaveBeenCalled();
        expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });

    it('keeps due schedules unsent when the email provider rejects delivery', async () => {
        mockSend.mockResolvedValueOnce({
            data: null,
            error: { name: 'validation_error', message: 'domain is not verified' },
        });
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'schedule-failing',
                frequency: 'weekly',
                day_of_week: 1,
                recipients: ['admin@webforxtech.com'],
                report_type: 'summary',
                last_sent_at: null,
                created_at: new Date('2026-04-01T00:00:00.000Z'),
            },
        ]);

        const result = await processDueScheduledReports(monday);

        expect(result.failed).toBe(1);
        expect(result.failures[0]).toEqual({
            id: 'schedule-failing',
            message: 'Resend error [validation_error]: domain is not verified',
        });
        expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });
});
