"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPasswordResetEmail = exports.sendWelcomeEmail = void 0;
const resend_1 = require("resend");
const env_1 = require("../config/env");
let resendClient = null;
const getClient = () => {
    if (!env_1.env.resendApiKey)
        return null;
    if (!resendClient) {
        resendClient = new resend_1.Resend(env_1.env.resendApiKey);
    }
    return resendClient;
};
/**
 * Resend SDK v3+ returns { data, error } instead of throwing.
 * This helper checks the result and throws if error is present,
 * so callers can rely on standard async/await error handling.
 */
const send = (client, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { error } = yield client.emails.send(payload);
    if (error) {
        throw new Error(`Resend error [${error.name}]: ${error.message}`);
    }
});
// ─── Shared brand colours / layout ────────────────────────────────────────────
const BASE_HTML = (title, body) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#354ac0 0%,#4f46e5 100%);padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.65);">Web Forx</p>
              <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:#ffffff;">Time Tracker</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                This email was sent by Web Forx Time Tracker. If you did not expect it, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
const BTN = (href, label) => `<a href="${href}" style="display:inline-block;margin-top:24px;padding:14px 32px;background:linear-gradient(135deg,#354ac0 0%,#4f46e5 100%);color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.01em;">${label}</a>`;
const MUTED = (text) => `<p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">${text}</p>`;
const sendWelcomeEmail = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    const client = getClient();
    if (!client) {
        if (env_1.env.nodeEnv === 'development') {
            console.log(`[email:dev] Welcome email → ${opts.to} (password: ${opts.defaultPassword})`);
        }
        return;
    }
    const body = `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0f172a;">Welcome, ${opts.firstName}!</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
        Your Web Forx Time Tracker account has been created. You can log in right away using the credentials below.
      </p>

      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;width:100%;margin-bottom:4px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Your login details</p>
            <p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>Email:</strong> ${opts.to}</p>
            <p style="margin:0;font-size:14px;color:#0f172a;"><strong>Temporary password:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:13px;">${opts.defaultPassword}</code></p>
          </td>
        </tr>
      </table>

      ${BTN(opts.loginUrl, 'Log In Now')}

      ${MUTED('For your security, please change your password after your first login. Go to <strong>Profile → Change Password</strong>.')}
      ${MUTED(`Login URL: <a href="${opts.loginUrl}" style="color:#354ac0;">${opts.loginUrl}</a>`)}
    `;
    yield send(client, {
        from: env_1.env.emailFrom,
        to: opts.to,
        subject: 'Your Web Forx Time Tracker account is ready',
        html: BASE_HTML('Welcome to Web Forx Time Tracker', body),
    });
});
exports.sendWelcomeEmail = sendWelcomeEmail;
const sendPasswordResetEmail = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    const client = getClient();
    if (!client) {
        if (env_1.env.nodeEnv === 'development') {
            console.log(`[email:dev] Password reset code for ${opts.to}: ${opts.resetCode}`);
        }
        return;
    }
    const body = `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0f172a;">Reset your password</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
        Hi ${opts.firstName}, we received a request to reset the password for your account. Click the button below to set a new password.
      </p>

      ${BTN(opts.resetUrl, 'Reset Password')}

      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;width:100%;margin-top:24px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Or enter this code manually</p>
            <p style="margin:0;font-size:24px;font-weight:800;letter-spacing:0.18em;color:#354ac0;">${opts.resetCode}</p>
          </td>
        </tr>
      </table>

      ${MUTED('This link and code expire in <strong>30 minutes</strong>. If you did not request a password reset, no action is needed.')}
    `;
    yield send(client, {
        from: env_1.env.emailFrom,
        to: opts.to,
        subject: 'Reset your Web Forx Time Tracker password',
        html: BASE_HTML('Password Reset', body),
    });
});
exports.sendPasswordResetEmail = sendPasswordResetEmail;
