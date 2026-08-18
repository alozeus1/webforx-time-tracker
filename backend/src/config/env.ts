import 'dotenv/config';

const requireEnv = (name: string): string => {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
const jwtSecret = requireEnv('JWT_SECRET');
const parseMinutesEnv = (name: string, fallback: number) => {
    const raw = process.env[name]?.trim();
    if (!raw) {
        return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveIntegrationSecret = () => {
    const explicit = process.env.INTEGRATION_SECRET?.trim();
    if (explicit) {
        return explicit;
    }

    // Keep local onboarding simple, but never allow this fallback in production.
    if (nodeEnv !== 'production') {
        return jwtSecret;
    }

    throw new Error('Missing required environment variable: INTEGRATION_SECRET');
};

export const env = {
    nodeEnv,
    port: Number(process.env.PORT || 5005),
    databaseUrl: requireEnv('DATABASE_URL'),
    redisUrl: process.env.REDIS_URL?.trim() || 'redis://localhost:6379',
    jwtSecret,
    integrationSecret: resolveIntegrationSecret(),
    cronSecret: process.env.CRON_SECRET?.trim() || '',
    // Operational logs and ephemera older than this are purged by the retention cron.
    // Business records (time entries, invoices, expenses, leave, payroll) are never
    // touched by retention — see services/retentionService.ts.
    dataRetentionDays: (() => {
        const parsed = Number.parseInt(process.env.DATA_RETENTION_DAYS?.trim() || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
    })(),
    // Resolved timer correction requests older than this are eligible for purge.
    correctionRetentionDays: (() => {
        const parsed = Number.parseInt(process.env.CORRECTION_RETENTION_DAYS?.trim() || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
    })(),
    corsOrigin: process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173',
    frontendUrl: process.env.FRONTEND_URL?.trim() || process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173',
    enableBackgroundWorkers: process.env.ENABLE_BACKGROUND_WORKERS !== 'false',
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() || '',
    idleWarningMinutes: parseMinutesEnv('IDLE_WARNING_MINUTES', 5),
    heartbeatIntervalMinutes: parseMinutesEnv('HEARTBEAT_INTERVAL_MINUTES', 3),
    heartbeatStaleMinutes: parseMinutesEnv('HEARTBEAT_STALE_MINUTES', 8),
    autoStopGraceMinutes: parseMinutesEnv('AUTO_STOP_GRACE_MINUTES', 2),
    maxPauseHours: (() => {
        const raw = process.env.MAX_PAUSE_HOURS?.trim();
        const parsed = Number.parseFloat(raw || '');
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
    })(),
    maxActiveTimerHours: (() => {
        const raw = process.env.MAX_ACTIVE_TIMER_HOURS?.trim();
        const parsed = Number.parseFloat(raw || '');
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
    })(),
    // Ceiling on total time logged in one calendar day, in the user's timezone.
    // Distinct from maxActiveTimerHours, which caps a single continuous session.
    dailyCapHours: (() => {
        const raw = process.env.DAILY_CAP_HOURS?.trim();
        const parsed = Number.parseFloat(raw || '');
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
    })(),
    // Daily expectation for interns. Passing it triggers a soft, no-reason nudge;
    // it is a floor to reach, not a ceiling to enforce.
    internDailyFloorHours: (() => {
        const raw = process.env.INTERN_DAILY_FLOOR_HOURS?.trim();
        const parsed = Number.parseFloat(raw || '');
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2;
    })(),
    weeklyRecoveryLimit: (() => {
        const raw = process.env.WEEKLY_RECOVERY_LIMIT?.trim();
        const parsed = Number.parseInt(raw || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
    })(),
    // How long after the last heartbeat an abandoned timer is still credited before
    // the recorded end time is clamped back to that heartbeat.
    abandonedTimerGraceMinutes: parseMinutesEnv('ABANDONED_TIMER_GRACE_MINUTES', 15),
    authentikEnabled: process.env.AUTHENTIK_ENABLED?.trim().toLowerCase() === 'true',
    authentikIssuerUrl: process.env.AUTHENTIK_ISSUER_URL?.trim() || '',
    authentikClientId: process.env.AUTHENTIK_CLIENT_ID?.trim() || '',
    authentikClientSecret: process.env.AUTHENTIK_CLIENT_SECRET?.trim() || '',
    authentikRedirectUri: process.env.AUTHENTIK_REDIRECT_URI?.trim() || '',
    authentikPostLogoutRedirectUri: process.env.AUTHENTIK_POST_LOGOUT_REDIRECT_URI?.trim() || '',
    authentikScopes: process.env.AUTHENTIK_SCOPES?.trim() || 'openid profile email',
    // ── Outbound email ────────────────────────────────────────────────────────
    // AWS SES SMTP is the only transport for webforxtech.com and
    // dev.webforxtech.com. There is deliberately no fallback provider — see
    // services/mailer.ts for why the Resend fallback was removed. Variable names
    // match the SES console so the same keys can be pasted straight into Vercel.
    smtpHost: process.env.AWS_SES_SMTP_ENDPOINT?.trim() || '',
    smtpPort: (() => {
        const raw = process.env.AWS_SES_SMTP_PORT?.trim();
        const parsed = Number.parseInt(raw || '', 10);
        // 587 (STARTTLS) is the SES default and what the WFT account is provisioned for.
        return Number.isInteger(parsed) && parsed > 0 ? parsed : 587;
    })(),
    smtpUser: process.env.AWS_SMTP_USERNAME?.trim() || '',
    smtpPassword: process.env.AWS_SMTP_PASSWORD || '',
    emailFrom: process.env.EMAIL_FROM?.trim() || 'Web Forx Time Tracker <noreply@webforxtech.com>',
    executiveReportTemplateEnabled: process.env.EXECUTIVE_REPORT_TEMPLATE_ENABLED?.trim().toLowerCase() !== 'false',
    reportCompanyLogoPath: process.env.REPORT_COMPANY_LOGO_PATH?.trim() || '',
    reportTimerAppLogoPath: process.env.REPORT_TIMER_APP_LOGO_PATH?.trim() || '',
    expenseReceiptBucket: process.env.EXPENSE_RECEIPT_BUCKET?.trim() || '',
    expenseReceiptRegion: process.env.EXPENSE_RECEIPT_REGION?.trim() || process.env.AWS_REGION?.trim() || 'us-east-1',
    expenseReceiptEndpoint: process.env.EXPENSE_RECEIPT_ENDPOINT?.trim() || '',
    // Enhanced activity detection — treats "tab hidden but heartbeat arriving" as NOT idle.
    // Set to true in production to fix false idle detection when users work outside the browser tab.
    // When false (default), behavior is identical to the previous release.
    timerEnhancedActivityDetection: process.env.TIMER_ENHANCED_ACTIVITY_DETECTION?.trim().toLowerCase() === 'true',
    // Grace window (minutes) after which a hidden-connected session transitions to idle_candidate
    // when no desktop agent or stronger signal confirms activity.  Default: 10 minutes.
    hiddenConnectedGraceMinutes: parseMinutesEnv('HIDDEN_CONNECTED_GRACE_MINUTES', 10),
};

if (env.nodeEnv === 'production') {
    for (const name of ['DATABASE_URL', 'JWT_SECRET', 'INTEGRATION_SECRET', 'CRON_SECRET', 'CORS_ORIGIN', 'FRONTEND_URL', 'ENABLE_BACKGROUND_WORKERS']) {
        requireEnv(name);
    }
}

const credentialedCorsOrigins = [env.corsOrigin, env.frontendUrl]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim());

if (credentialedCorsOrigins.includes('*')) {
    throw new Error('Credentialed CORS cannot be configured with wildcard origin "*"');
}
