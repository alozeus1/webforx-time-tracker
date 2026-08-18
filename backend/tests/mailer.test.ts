/**
 * Outbound mail transport selection and failure semantics.
 *
 * Context: on 2026-08-10 the weekly compliance report generated correctly, passed its
 * validation gates, and was then refused by Resend ("The webforxtech.com domain is not
 * verified"). Nothing was emailed, and the n8n workflow downstream published a
 * "0 members tracked" report off a stale PDF.
 *
 * The SES migration that followed kept Resend as a fallback, and THAT is what cost the
 * 2026-08-10 and 2026-08-17 windows: the SES variables were never added to the deployed
 * environment, so `getMailProvider()` quietly fell through to Resend and hit the same
 * rejection. The fallback made a missing-config bug look like a vendor bug.
 *
 * SES SMTP is now the only transport. The behaviours pinned below are therefore:
 * (a) missing or partial SMTP config resolves to 'none' and THROWS — never to
 * something that looks configured, and never a silent no-op; and (b) a stale
 * RESEND_API_KEY in the environment changes nothing.
 */

type SmtpConfig = Record<string, unknown>;

const mockSendMail = jest.fn();

// The transport config is captured here rather than read back off
// `mockCreateTransport.mock.calls[0][0]`. A zero-arg `jest.fn()` types its arguments as
// an EMPTY TUPLE, so indexing it is a compile error (TS2493) — and the backend
// tsconfig only includes `src/**`, so `tsc --noEmit` never type-checks this file.
// Only ts-jest catches it, which meant CI was the first thing to see the mistake.
let lastTransportConfig: SmtpConfig | undefined;
const mockCreateTransport = jest.fn((config: SmtpConfig) => {
    lastTransportConfig = config;
    return { sendMail: mockSendMail };
});

jest.mock('nodemailer', () => ({
    __esModule: true,
    default: { createTransport: (config: SmtpConfig) => mockCreateTransport(config) },
    createTransport: (config: SmtpConfig) => mockCreateTransport(config),
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
    lastTransportConfig = undefined;
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.EMAIL_FROM = 'Web Forx Reports <reports@webforxtech.com>';
    mockSendMail.mockResolvedValue({ messageId: 'ses-1' });
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

describe('transport selection', () => {
    it('selects SES SMTP when all three SMTP credentials are present', async () => {
        withSes();
        const mailer = await loadMailer();

        expect(mailer.getMailProvider()).toBe('ses-smtp');
        await mailer.sendMail(message);

        expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it('reports "none" and throws when SMTP is not configured, rather than silently no-oping', async () => {
        const mailer = await loadMailer();

        expect(mailer.getMailProvider()).toBe('none');
        await expect(mailer.sendMail(message)).rejects.toThrow(/No email transport is configured/);
    });

    it('REGRESSION: a leftover RESEND_API_KEY does not make an unconfigured env look usable', async () => {
        // The 2026-08-17 defect in one assertion. With the old fallback this returned
        // 'resend' and the weekly report died against an unverified domain, so the
        // symptom pointed at a vendor instead of at four missing Vercel variables.
        // There is no fallback now: no SMTP config means no transport, loudly.
        process.env.RESEND_API_KEY = 're_left_over_from_the_old_vendor';
        const mailer = await loadMailer();

        expect(mailer.getMailProvider()).toBe('none');
        await expect(mailer.sendMail(message)).rejects.toThrow(/No email transport is configured/);
        expect(mockSendMail).not.toHaveBeenCalled();
    });

    it.each([
        ['endpoint only', { AWS_SES_SMTP_ENDPOINT: 'smtp.example.amazonaws.com' }],
        ['endpoint + username, no password', { AWS_SES_SMTP_ENDPOINT: 'smtp.example.amazonaws.com', AWS_SMTP_USERNAME: 'user' }],
        ['credentials but no endpoint', { AWS_SMTP_USERNAME: 'user', AWS_SMTP_PASSWORD: 'pass' }],
    ])('does not treat a partially configured SMTP block as usable (%s)', async (_label, vars) => {
        // A half-filled block must not select SES and then fail at send time with an
        // opaque auth or DNS error — that is much harder to diagnose than "not configured".
        Object.assign(process.env, vars);
        const mailer = await loadMailer();

        expect(mailer.getMailProvider()).toBe('none');
    });
});

describe('SMTP transport configuration', () => {
    it('uses STARTTLS on 587 and requires the upgrade', async () => {
        withSes();
        process.env.AWS_SES_SMTP_PORT = '587';
        const mailer = await loadMailer();
        await mailer.sendMail(message);

        expect(lastTransportConfig).toBeDefined();
        expect(lastTransportConfig!.port).toBe(587);
        expect(lastTransportConfig!.secure).toBe(false);
        // Without requireTLS a downgrade would send SMTP credentials in the clear.
        expect(lastTransportConfig!.requireTLS).toBe(true);
    });

    it('uses implicit TLS on 465', async () => {
        withSes();
        process.env.AWS_SES_SMTP_PORT = '465';
        const mailer = await loadMailer();
        await mailer.sendMail(message);

        expect(lastTransportConfig!.secure).toBe(true);
        expect(lastTransportConfig!.requireTLS).toBe(false);
    });

    it('defaults to 587 when the port is missing or unparseable', async () => {
        withSes();
        process.env.AWS_SES_SMTP_PORT = 'not-a-port';
        const mailer = await loadMailer();
        await mailer.sendMail(message);

        expect(lastTransportConfig!.port).toBe(587);
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

    it('surfaces a 535 auth failure verbatim, since it usually means the wrong SES password', async () => {
        // The SES SMTP password is derived from an AWS secret access key, not equal to
        // one. Pasting the secret key yields exactly this, and it reads like a network
        // fault unless the original text survives.
        withSes();
        mockSendMail.mockRejectedValueOnce(new Error('535 Authentication Credentials Invalid'));
        const mailer = await loadMailer();

        await expect(mailer.sendMail(message))
            .rejects.toThrow('SES SMTP error: 535 Authentication Credentials Invalid');
    });

    it('resolves only when SES accepted the message', async () => {
        withSes();
        const mailer = await loadMailer();

        await expect(mailer.sendMail(message)).resolves.toBeUndefined();
        expect(mockSendMail).toHaveBeenCalledTimes(1);
    });
});
