/**
 * Outbound email transport.
 *
 * WHY THIS EXISTS
 * ----------------
 * Delivery used to call the Resend SDK directly from two services. On 2026-08-10 the
 * weekly compliance report was generated correctly, passed its validation gates, and
 * was then refused at the door:
 *
 *     Resend error [validation_error]: The webforxtech.com domain is not verified.
 *
 * Nothing was emailed, so the n8n workflow downstream had no fresh PDF and published a
 * "0 members tracked" report to the whole organisation. WFT is moving all
 * webforxtech.com and dev.webforxtech.com mail to AWS SES.
 *
 * Rather than swapping one hard-coded vendor for another, delivery now goes through
 * this single seam. SMTP (SES) is preferred; Resend remains as a fallback so the
 * migration can be rolled back with an environment variable rather than a deploy, and
 * so a half-configured environment fails loudly instead of silently sending nothing.
 *
 * CREDENTIALS
 * -----------
 * SMTP credentials live in environment variables only — never in the repo. See
 * DEPLOYMENT.md. The SES SMTP password is not an AWS secret access key; it is derived
 * from one and is specific to the SES SMTP endpoint.
 */

import nodemailer, { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { env } from '../config/env';

export type MailAttachment = {
    filename: string;
    content: Buffer;
};

export type MailMessage = {
    to: string[];
    subject: string;
    html: string;
    attachments?: MailAttachment[];
};

export type MailProvider = 'ses-smtp' | 'resend' | 'none';

let smtpTransport: Transporter | null = null;
let resendClient: Resend | null = null;

const hasSmtpConfig = (): boolean =>
    Boolean(env.smtpHost && env.smtpUser && env.smtpPassword);

/**
 * Which provider will actually be used. Exposed so health checks and startup logging
 * can surface "email is not configured" before a report silently fails to send.
 */
export const getMailProvider = (): MailProvider => {
    if (hasSmtpConfig()) return 'ses-smtp';
    if (env.resendApiKey) return 'resend';
    return 'none';
};

const getSmtpTransport = (): Transporter => {
    if (!smtpTransport) {
        smtpTransport = nodemailer.createTransport({
            host: env.smtpHost,
            port: env.smtpPort,
            // Port 587 is STARTTLS: the connection opens in the clear and is upgraded.
            // `secure` must therefore be false, and `requireTLS` makes the upgrade
            // mandatory so a downgrade cannot silently send credentials in plaintext.
            // Port 465 is implicit TLS and sets `secure` true.
            secure: env.smtpPort === 465,
            requireTLS: env.smtpPort !== 465,
            auth: { user: env.smtpUser, pass: env.smtpPassword },
            // SES drops idle connections; keep the pool small and let it re-dial.
            pool: true,
            maxConnections: 2,
            connectionTimeout: 15_000,
            greetingTimeout: 15_000,
            socketTimeout: 30_000,
        });
    }
    return smtpTransport;
};

const getResendClient = (): Resend | null => {
    if (!env.resendApiKey) return null;
    if (!resendClient) resendClient = new Resend(env.resendApiKey);
    return resendClient;
};

export class MailNotConfiguredError extends Error {
    constructor() {
        super(
            'No email provider is configured. Set AWS_SES_SMTP_ENDPOINT, AWS_SMTP_USERNAME and '
            + 'AWS_SMTP_PASSWORD (preferred), or RESEND_API_KEY as a fallback.',
        );
        this.name = 'MailNotConfiguredError';
    }
}

/**
 * Send an email. Throws on any failure — including provider-level rejections that do
 * not reject the underlying promise.
 *
 * That last point is the trap this function exists to close: the Resend SDK reports
 * API errors in its RESOLVED value, so `await client.emails.send(...)` succeeding is
 * not evidence anything was delivered. Both branches below normalise to "throw on
 * failure" so callers can rely on ordinary async error handling.
 */
export const sendMail = async (message: MailMessage): Promise<void> => {
    const provider = getMailProvider();

    if (provider === 'none') throw new MailNotConfiguredError();

    if (provider === 'ses-smtp') {
        try {
            await getSmtpTransport().sendMail({
                from: env.emailFrom,
                to: message.to,
                subject: message.subject,
                html: message.html,
                attachments: message.attachments?.map((attachment) => ({
                    filename: attachment.filename,
                    content: attachment.content,
                })),
            });
            return;
        } catch (error) {
            // SES rejections are frequently about identity verification rather than
            // transport, and the raw error is cryptic. Keep the original message but
            // name the provider so the log points at the right console.
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`SES SMTP error: ${detail}`);
        }
    }

    const client = getResendClient();
    /* istanbul ignore next — provider === 'resend' guarantees a client. */
    if (!client) throw new MailNotConfiguredError();

    const { error } = await client.emails.send({
        from: env.emailFrom,
        to: message.to,
        subject: message.subject,
        html: message.html,
        attachments: message.attachments?.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
        })),
    });

    if (error) throw new Error(`Resend error [${error.name}]: ${error.message}`);
};

/** Test seam — clears memoised clients so env changes take effect. */
export const resetMailTransports = (): void => {
    smtpTransport = null;
    resendClient = null;
};
