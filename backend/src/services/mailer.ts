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
 * Rather than swapping one hard-coded vendor for another, delivery goes through this
 * single seam. AWS SES SMTP is now the only transport.
 *
 * WHY RESEND IS GONE
 * -------------------
 * The seam originally kept Resend as a fallback so the migration could be reverted
 * with an environment variable rather than a deploy. That safety net turned out to be
 * the hazard: because `getMailProvider()` fell through to Resend whenever the SMTP
 * variables were absent, a deployment that simply never received the SES credentials
 * looked *configured*. It resolved to Resend, hit the same unverified-domain
 * rejection, and lost the 2026-08-10 and 2026-08-17 weekly windows — visible only as
 * a red CI tick on Mondays, because the weekly job is the only caller that runs then.
 *
 * With one transport there is no fall-through: missing credentials resolve to 'none'
 * and throw MailNotConfiguredError on the first send, which is loud, immediate, and
 * points at the actual defect. Rollback is now "put the SES variables back", not
 * "switch vendors".
 *
 * CREDENTIALS
 * -----------
 * SMTP credentials live in environment variables only — never in the repo. See
 * DEPLOYMENT.md. The SES SMTP password is not an AWS secret access key; it is derived
 * from one and is specific to the SES SMTP endpoint.
 */

import nodemailer, { Transporter } from 'nodemailer';
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

export type MailProvider = 'ses-smtp' | 'none';

let smtpTransport: Transporter | null = null;

/**
 * All three are required together. A partially-filled set (host but no password, say)
 * must resolve to 'none' rather than to a transport that will fail at connect time —
 * a half-configured environment should be indistinguishable from an unconfigured one.
 */
const hasSmtpConfig = (): boolean =>
    Boolean(env.smtpHost && env.smtpUser && env.smtpPassword);

/**
 * Which provider will actually be used. Exposed so health checks and startup logging
 * can surface "email is not configured" before a report silently fails to send.
 */
export const getMailProvider = (): MailProvider => (hasSmtpConfig() ? 'ses-smtp' : 'none');

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

export class MailNotConfiguredError extends Error {
    constructor() {
        super(
            'No email transport is configured. Set AWS_SES_SMTP_ENDPOINT, AWS_SMTP_USERNAME '
            + 'and AWS_SMTP_PASSWORD. There is no fallback provider by design — see '
            + 'services/mailer.ts.',
        );
        this.name = 'MailNotConfiguredError';
    }
}

/**
 * Send an email. Throws on any failure.
 *
 * Callers rely on ordinary async error handling: a resolved promise means SES accepted
 * the message. (The previous Resend branch needed extra care here because that SDK
 * reported API errors in its RESOLVED value, so `await send()` succeeding was not
 * evidence of delivery. nodemailer rejects properly, so the hazard is gone with it.)
 */
export const sendMail = async (message: MailMessage): Promise<void> => {
    if (getMailProvider() === 'none') throw new MailNotConfiguredError();

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
    } catch (error) {
        // SES rejections are frequently about identity verification rather than
        // transport, and the raw error is cryptic. Keep the original message but
        // name the provider so the log points at the right console.
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`SES SMTP error: ${detail}`);
    }
};

/** Test seam — clears the memoised transport so env changes take effect. */
export const resetMailTransports = (): void => {
    smtpTransport = null;
};
