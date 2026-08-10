/**
 * Outbound mail transport selection and failure semantics.
 *
 * Context: on 2026-08-10 the weekly compliance report generated correctly, passed its
 * validation gates, and was then refused by Resend ("The webforxtech.com domain is not
 * verified"). Nothing was emailed, and the n8n workflow downstream published a
 * "0 members tracked" report off a stale PDF. WFT is moving to AWS SES SMTP.
 *
 * The behaviour that matters here is not "does it send" but "does a failure to send
 * reliably throw" — the Resend SDK reports API errors in its RESOLVED value, so an
 * awaited send succeeding is not evidence of delivery.
 */

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
const mockResendSend = jest.fn();

jest.mock('nodemailer', () => ({
    __esModule: true,
    default: { createTransport: (...args: unknown[]) => mockCreateTransport(...(args as [])) },
    createTransport: (...args: unknown[]) => mockCreateTransport(...(args as [])),
}));

jest.mock('resend', () => ({
    Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockResendSend } })),
}));

const ENV_KEYS = [
    'AWS_SES_SMTP_ENDPOINT',
    'AWS_SES_SMTP_PORT',
    'AWS_SMTP_USERNAME',
    'AWS_SMTP_PASSWORD',
    'RESEND_API_KEY',
    'EMAIL_FROM',
] as const;

const loadMailer = async () => {
    jest.resetModules();
    return import('../src/services/mailer');
};

let saved: Record<string, string | undefined>;

beforeEach(() => {
    jest.clearAllMocks();
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.EMAIL_FROM = 'Web Forx Reports <reports@webforxtech.com>';
    mockSendMail.mockResolvedValue({ messageId: 'ses-1' });
    mockResendSend.mockResolvedValue({ data: { id: 'r-1' }, error: null });
});

afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
});

const withSes = () => {
    process.env.AWS_SES_SMTP_ENDPOINT = 'smtp.example.amazonaws.com';
    process.env.AWS_SMTP_USERNAME = 'user';
    process.env.AWS_SMTP_PASSWORD = 'pass';
};

const message = { to: ['ops@webforxtech.com'], subject: 'Weekly', html: '<p>hi</p>' };

describe('provider selection', () => {
    it('prefers SES SMTP when SMTP credentials are present, even if Resend is also set', async () => {
        withSes();
        process.env.RESEND_API_KEY = 're_still_set';
        const mailer = await loadMailer();

        expect(mailer.getMailProvider()).toBe('ses-smtp');
        await mailer.sendMail(message);

        expect(mockSendMail).toHaveBeenCalledTimes(1);
        expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('falls back to Resend when SMTP is not configured, so the migration is reversible', async () => {
        process.env.RESEND_API_KEY = 're_test';
        const mailer = await loadMailer();

        expect(mailer.getMailProvider()).toBe('resend');
        await mailer.sendMail(message);

        expect(mockResendSend).toHaveBeenCalledTimes(1);
        expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('reports "none" and throws when neither is configured, rather than silently no-oping', async () => {
        const mailer = await loadMailer();

        expect(mailer.getMailProvider()).toBe('none');
        await expect(mailer.sendMail(message)).rejects.toThrow(/No email provider is configured/);
    });

    it('does not treat a partially configured SMTP block as usable', async () => {
        // Endpoint set but no credentials — this must NOT select SES and then fail at
        // send time with an opaque auth error.
        process.env.AWS_SES_SMTP_ENDPOINT = 'smtp.example.amazonaws.com';
        process.env.RESEND_API_KEY = 're_test';
        const mailer = await loadMailer();

        expect(mailer.getMailProvider()).toBe('resend');
    });
});

describe('SMTP transport configuration', () => {
    it('uses STARTTLS on 587 and requires the upgrade', async () => {
        withSes();
        process.env.AWS_SES_SMTP_PORT = '587';
        const mailer = await loadMailer();
        await mailer.sendMail(message);

        const config = mockCreateTransport.mock.calls[0][0] as unknown as Record<string, unknown>;
        expect(config.port).toBe(587);
        expect(config.secure).toBe(false);
        // Without requireTLS a downgrade would send SMTP credentials in the clear.
        expect(config.requireTLS).toBe(true);
    });

    it('uses implicit TLS on 465', async () => {
        withSes();
        process.env.AWS_SES_SMTP_PORT = '465';
        const mailer = await loadMailer();
        await mailer.sendMail(message);

        const config = mockCreateTransport.mock.calls[0][0] as unknown as Record<string, unknown>;
        expect(config.secure).toBe(true);
        expect(config.requireTLS).toBe(false);
    });

    it('defaults to 587 when the port is missing or unparseable', async () => {
        withSes();
        process.env.AWS_SES_SMTP_PORT = 'not-a-port';
        const mailer = await loadMailer();
        await mailer.sendMail(message);

        expect((mockCreateTransport.mock.calls[0][0] as unknown as Record<string, unknown>).port).toBe(587);
    });

    it('sends from EMAIL_FROM and forwards attachments as buffers', async () => {
        withSes();
        const mailer = await loadMailer();
        await mailer.sendMail({
            ...message,
            attachments: [{ filename: 'report.pdf', content: Buffer.from('pdf') }],
        });

        const sent = mockSendMail.mock.calls[0][0];
        expect(sent.from).toBe('Web Forx Reports <reports@webforxtech.com>');
        expect(sent.to).toEqual(['ops@webforxtech.com']);
        expect(sent.attachments).toEqual([{ filename: 'report.pdf', content: Buffer.from('pdf') }]);
    });
});

describe('failure semantics', () => {
    it('throws when SMTP rejects, naming the provider', async () => {
        withSes();
        mockSendMail.mockRejectedValueOnce(new Error('554 Message rejected: Email address is not verified'));
        const mailer = await loadMailer();

        await expect(mailer.sendMail(message)).rejects.toThrow(/SES SMTP error: 554 Message rejected/);
    });

    it('REGRESSION: throws when Resend reports an error in its RESOLVED value', async () => {
        // This is the exact shape of the 2026-08-10 outage. The promise resolves, so
        // without an explicit check the caller would record the report as delivered.
        process.env.RESEND_API_KEY = 're_test';
        mockResendSend.mockResolvedValueOnce({
            data: null,
            error: { name: 'validation_error', message: 'The webforxtech.com domain is not verified.' },
        });
        const mailer = await loadMailer();

        await expect(mailer.sendMail(message))
            .rejects.toThrow('Resend error [validation_error]: The webforxtech.com domain is not verified.');
    });
});
