/**
 * Rejection notices: one message per person per reviewer action, and never a
 * rollback.
 *
 * The failure this guards against is twofold. Sending one email per rejected entry
 * turns a Monday backlog clear-down into a twenty-message flood, which gets filtered —
 * and a filtered rejection notice is the same as the no-notice state that left an
 * intern unable to find out why 7.58h of her week had been thrown away. And a mail
 * failure must never undo a rejection a manager has already committed.
 */

const mockSendMail = jest.fn();
const mockGetMailProvider = jest.fn();

jest.mock('../src/services/mailer', () => ({
    __esModule: true,
    sendMail: (...args: unknown[]) => mockSendMail(...args),
    getMailProvider: () => mockGetMailProvider(),
}));

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: { user: { findMany: jest.fn() } },
}));

import prisma from '../src/config/db';
import { dispatchRejectionNotices } from '../src/services/rejectionNoticeService';

const entry = (id: string, userId: string, overrides: Record<string, unknown> = {}) => ({
    id,
    user_id: userId,
    task_description: `Task ${id}`,
    start_time: new Date('2026-08-25T09:00:00.000Z'),
    duration: 3600,
    rejection_reason_code: 'INSUFFICIENT_DESCRIPTION',
    rejection_reason_note: null,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockGetMailProvider.mockReturnValue('ses-smtp');
    mockSendMail.mockResolvedValue(undefined);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user-a', email: 'a@webforxtech.com', first_name: 'Ada' },
        { id: 'user-b', email: 'b@webforxtech.com', first_name: 'Ben' },
    ]);
});

const bodyOf = (call: number): string => mockSendMail.mock.calls[call][0].html;

describe('dispatchRejectionNotices', () => {
    it('sends one message per person, not one per entry', async () => {
        await dispatchRejectionNotices({
            organizationId: 'org-1',
            entries: [
                entry('e1', 'user-a'),
                entry('e2', 'user-a'),
                entry('e3', 'user-a'),
                entry('e4', 'user-b'),
            ],
        });

        expect(mockSendMail).toHaveBeenCalledTimes(2);
        const recipients = mockSendMail.mock.calls.map((call) => call[0].to[0]).sort();
        expect(recipients).toEqual(['a@webforxtech.com', 'b@webforxtech.com']);
        expect(mockSendMail.mock.calls[0][0].subject).toBe('3 time entries were not approved');
        expect(mockSendMail.mock.calls[1][0].subject).toBe('A time entry was not approved');
    });

    it('includes the date, hours, task and reason label for each entry', async () => {
        (prisma.user.findMany as jest.Mock).mockResolvedValue([
            { id: 'user-a', email: 'a@webforxtech.com', first_name: 'Ada' },
        ]);

        await dispatchRejectionNotices({
            organizationId: 'org-1',
            entries: [entry('e1', 'user-a', { task_description: 'Working on my tkt', duration: 23688 })],
        });

        const html = bodyOf(0);
        expect(html).toContain('Working on my tkt');
        expect(html).toContain('6.58h');
        expect(html).toContain('Aug 25, 2026');
        expect(html).toContain('Task description too vague or incomplete');
        // And what to do about it.
        expect(html).toMatch(/correction request/i);
    });

    it('says "No reason recorded" rather than leaving a blank where a reason belongs', async () => {
        (prisma.user.findMany as jest.Mock).mockResolvedValue([
            { id: 'user-a', email: 'a@webforxtech.com', first_name: 'Ada' },
        ]);

        await dispatchRejectionNotices({
            organizationId: 'org-1',
            entries: [entry('e1', 'user-a', { rejection_reason_code: null })],
        });

        expect(bodyOf(0)).toContain('No reason recorded');
    });

    it('escapes free text and task descriptions before they reach the HTML body', async () => {
        (prisma.user.findMany as jest.Mock).mockResolvedValue([
            { id: 'user-a', email: 'a@webforxtech.com', first_name: 'Ada' },
        ]);

        await dispatchRejectionNotices({
            organizationId: 'org-1',
            entries: [entry('e1', 'user-a', {
                task_description: '<img src=x onerror="alert(1)">',
                rejection_reason_note: '<script>alert("xss")</script>',
            })],
        });

        const html = bodyOf(0);
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&lt;img src=x');
    });

    it('never throws when SES fails — the rejection has already been committed', async () => {
        mockSendMail.mockRejectedValue(new Error('SES refused the message'));
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(dispatchRejectionNotices({
            organizationId: 'org-1',
            entries: [entry('e1', 'user-a')],
        })).resolves.toBeUndefined();

        // Loudly, so a human can follow up on the person who was never told.
        expect(logged).toHaveBeenCalledWith(
            expect.stringContaining('[rejectionNotice] FAILED'),
            expect.any(Error),
        );
        logged.mockRestore();
    });

    it('keeps going for the second person when the first send fails', async () => {
        mockSendMail
            .mockRejectedValueOnce(new Error('SES refused the message'))
            .mockResolvedValueOnce(undefined);
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

        await dispatchRejectionNotices({
            organizationId: 'org-1',
            entries: [entry('e1', 'user-a'), entry('e2', 'user-b')],
        });

        expect(mockSendMail).toHaveBeenCalledTimes(2);
        logged.mockRestore();
    });

    it('does nothing at all with no transport configured, which is a normal dev state', async () => {
        mockGetMailProvider.mockReturnValue('none');

        await dispatchRejectionNotices({ organizationId: 'org-1', entries: [entry('e1', 'user-a')] });

        expect(prisma.user.findMany).not.toHaveBeenCalled();
        expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('short-circuits on an empty set', async () => {
        await dispatchRejectionNotices({ organizationId: 'org-1', entries: [] });
        expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
});
