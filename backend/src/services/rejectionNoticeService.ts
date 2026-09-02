import prisma from '../config/db';
import { env } from '../config/env';
import { getMailProvider, sendMail } from './mailer';
import { rejectionReasonLabel } from '../constants/rejectionReasons';

/**
 * Tells people their time was rejected, and why.
 *
 * WHY BATCHED
 * -----------
 * A manager clearing a Monday backlog can reject twenty entries in one click. Twenty
 * emails is a mailbox flood that gets filtered, and a filtered rejection notice is the
 * same as no rejection notice — which is the failure this whole change exists to fix.
 * One reviewer action therefore produces at most one message per affected person,
 * listing every entry that was rejected.
 *
 * WHY IT CANNOT ROLL BACK THE REJECTION
 * -------------------------------------
 * Sending runs after the database transaction has committed and swallows its own
 * errors. SES being down must not leave a manager unable to reject a timesheet, and it
 * must not silently half-apply one either. Failures are logged at error level with the
 * affected user and entry ids so a human can follow up; nothing here throws.
 */

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export interface RejectedEntryNotice {
    id: string;
    task_description: string;
    start_time: Date;
    duration: number;
    rejection_reason_code: string | null;
    rejection_reason_note: string | null;
}

interface DispatchArgs {
    organizationId: string;
    /** Every entry rejected by one reviewer action, in any user order. */
    entries: (RejectedEntryNotice & { user_id: string })[];
}

const formatHours = (seconds: number): string => `${(seconds / 3600).toFixed(2)}h`;

const formatDate = (value: Date): string =>
    new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
        .format(value);

const buildEntryRows = (entries: RejectedEntryNotice[]): string =>
    entries
        .map((entry) => {
            const label = rejectionReasonLabel(entry.rejection_reason_code) ?? 'No reason recorded';
            const note = entry.rejection_reason_note
                ? `<p style="margin:8px 0 0;font-size:13px;color:#475569;font-style:italic;">“${escapeHtml(entry.rejection_reason_note)}”</p>`
                : '';

            return `
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;font-size:13px;color:#64748b;">${escapeHtml(formatDate(entry.start_time))} · ${escapeHtml(formatHours(entry.duration))}</p>
          <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(entry.task_description)}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#b91c1c;"><strong>Reason:</strong> ${escapeHtml(label)}</p>
          ${note}
        </td>
      </tr>`;
        })
        .join('');

const buildHtml = (firstName: string, entries: RejectedEntryNotice[]): string => {
    const rejectedSeconds = entries.reduce((sum, entry) => sum + entry.duration, 0);
    const count = entries.length;
    const timesheetUrl = `${env.frontendUrl.replace(/\/$/, '')}/timesheet`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Time entries were not approved</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#354ac0 0%,#4f46e5 100%);padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.65);">Web Forx</p>
              <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:#ffffff;">Time Tracker</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 8px;">
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0f172a;">
                ${escapeHtml(count === 1 ? 'A time entry was not approved' : `${count} time entries were not approved`)}
              </h2>
              <p style="margin:0 0 4px;font-size:15px;color:#475569;line-height:1.6;">
                Hi ${escapeHtml(firstName)}, your manager reviewed your timesheet and did not approve
                ${escapeHtml(formatHours(rejectedSeconds))} of logged time. Rejected hours do <strong>not</strong>
                count toward your weekly minimum.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 0;">
              <table cellpadding="0" cellspacing="0" style="width:100%;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
                ${buildEntryRows(entries)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 0;">
              <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a;">What to do next</p>
              <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">
                Fix what the reason describes and log the time again — a clearer task description and the
                right project are the two most common fixes. If the time was genuinely worked and you
                cannot re-log it, raise a <strong>correction request</strong> from the Timeline screen and
                your manager will review it.
              </p>
              <a href="${escapeHtml(timesheetUrl)}" style="display:inline-block;margin-top:24px;padding:14px 32px;background:linear-gradient(135deg,#354ac0 0%,#4f46e5 100%);color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;">Open my timesheet</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px;border-top:1px solid #e2e8f0;margin-top:24px;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                This email was sent by Web Forx Time Tracker.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * One email per affected person, summarising everything one reviewer action rejected.
 *
 * Never throws. Call it after the transaction commits.
 */
export const dispatchRejectionNotices = async ({ organizationId, entries }: DispatchArgs): Promise<void> => {
    if (entries.length === 0) return;

    try {
        const byUser = new Map<string, RejectedEntryNotice[]>();
        for (const entry of entries) {
            const bucket = byUser.get(entry.user_id);
            if (bucket) bucket.push(entry);
            else byUser.set(entry.user_id, [entry]);
        }

        if (getMailProvider() === 'none') {
            // Matches every other sender in this codebase: no transport configured is a
            // normal local/dev state, not an incident.
            if (env.nodeEnv === 'development') {
                console.log(`[rejectionNotice:dev] would notify ${byUser.size} user(s) about ${entries.length} rejected entries`);
            }
            return;
        }

        const users = await prisma.user.findMany({
            where: { id: { in: [...byUser.keys()] }, organization_id: organizationId },
            select: { id: true, email: true, first_name: true },
        });

        for (const user of users) {
            const userEntries = byUser.get(user.id) ?? [];
            if (userEntries.length === 0 || !user.email) continue;

            // Newest first, so the most recent rejection is the one they read first.
            userEntries.sort((a, b) => b.start_time.getTime() - a.start_time.getTime());

            try {
                await sendMail({
                    to: [user.email],
                    subject: userEntries.length === 1
                        ? 'A time entry was not approved'
                        : `${userEntries.length} time entries were not approved`,
                    html: buildHtml(user.first_name || 'there', userEntries),
                });
            } catch (error) {
                console.error(
                    `[rejectionNotice] FAILED to email rejection notice to user ${user.id} for entries [${userEntries.map((e) => e.id).join(', ')}] — the rejection itself stands:`,
                    error,
                );
            }
        }
    } catch (error) {
        // Nothing above may propagate: the rejection has already been committed.
        console.error('[rejectionNotice] FAILED to dispatch rejection notices — the rejections themselves stand:', error);
    }
};
