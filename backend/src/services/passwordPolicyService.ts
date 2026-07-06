import prisma from '../config/db';

// ---------------------------------------------------------------------------
// Admin-configurable password policy, stored on Organization.settings under
// the `password_policy` key. Defaults preserve current production behavior
// exactly: min 12 characters, no character-class rules, expiration disabled.
// ---------------------------------------------------------------------------

export interface PasswordPolicy {
    min_length: number;
    require_uppercase: boolean;
    require_lowercase: boolean;
    require_number: boolean;
    require_symbol: boolean;
    /** 0 = expiration disabled */
    expiration_days: number;
    expiry_warning_days: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
    min_length: 12,
    require_uppercase: false,
    require_lowercase: false,
    require_number: false,
    require_symbol: false,
    expiration_days: 0,
    expiry_warning_days: 7,
};

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(num)));
};

const asBool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

/**
 * Safe-parse `settings.password_policy` from an Organization.settings JSON
 * blob. Unknown/malformed input always resolves to the defaults; numeric
 * fields are clamped to sane ranges.
 */
export const resolvePasswordPolicy = (settings: unknown): PasswordPolicy => {
    const raw = (settings as { password_policy?: unknown } | null | undefined)?.password_policy;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ...DEFAULT_PASSWORD_POLICY };
    }

    const policy = raw as Record<string, unknown>;
    return {
        min_length: clampInt(policy.min_length, 8, 128, DEFAULT_PASSWORD_POLICY.min_length),
        require_uppercase: asBool(policy.require_uppercase, DEFAULT_PASSWORD_POLICY.require_uppercase),
        require_lowercase: asBool(policy.require_lowercase, DEFAULT_PASSWORD_POLICY.require_lowercase),
        require_number: asBool(policy.require_number, DEFAULT_PASSWORD_POLICY.require_number),
        require_symbol: asBool(policy.require_symbol, DEFAULT_PASSWORD_POLICY.require_symbol),
        expiration_days: clampInt(policy.expiration_days, 0, 3650, DEFAULT_PASSWORD_POLICY.expiration_days),
        expiry_warning_days: clampInt(policy.expiry_warning_days, 1, 90, DEFAULT_PASSWORD_POLICY.expiry_warning_days),
    };
};

export const getOrgPasswordPolicy = async (organizationId: string): Promise<PasswordPolicy> => {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
    });
    return resolvePasswordPolicy(org?.settings);
};

/**
 * Returns the list of unmet, human-readable requirements for a candidate
 * password. Empty array = password satisfies the policy.
 */
export const validatePasswordAgainstPolicy = (password: string, policy: PasswordPolicy): string[] => {
    const unmet: string[] = [];
    if (password.length < policy.min_length) {
        unmet.push(`At least ${policy.min_length} characters`);
    }
    if (policy.require_uppercase && !/[A-Z]/.test(password)) {
        unmet.push('At least one uppercase letter (A-Z)');
    }
    if (policy.require_lowercase && !/[a-z]/.test(password)) {
        unmet.push('At least one lowercase letter (a-z)');
    }
    if (policy.require_number && !/[0-9]/.test(password)) {
        unmet.push('At least one number (0-9)');
    }
    if (policy.require_symbol && !/[^A-Za-z0-9]/.test(password)) {
        unmet.push('At least one symbol (e.g. !@#$%)');
    }
    return unmet;
};

/** Full requirement list for UI display, regardless of any candidate password. */
export const describePolicyRequirements = (policy: PasswordPolicy): string[] => {
    const requirements: string[] = [`At least ${policy.min_length} characters`];
    if (policy.require_uppercase) requirements.push('At least one uppercase letter (A-Z)');
    if (policy.require_lowercase) requirements.push('At least one lowercase letter (a-z)');
    if (policy.require_number) requirements.push('At least one number (0-9)');
    if (policy.require_symbol) requirements.push('At least one symbol (e.g. !@#$%)');
    return requirements;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Password expiry status for a user. `days_until_expiry` is null when
 * expiration is disabled for the org. The clock starts at
 * `password_changed_at`, falling back to account creation for users who
 * have never changed their password since the column was introduced.
 */
export const getPasswordExpiryInfo = (
    user: { password_changed_at: Date | null; created_at: Date },
    policy: PasswordPolicy,
): { expired: boolean; days_until_expiry: number | null } => {
    if (!policy.expiration_days || policy.expiration_days <= 0) {
        return { expired: false, days_until_expiry: null };
    }
    const changedAt = user.password_changed_at ?? user.created_at;
    const expiresAtMs = changedAt.getTime() + policy.expiration_days * MS_PER_DAY;
    const msRemaining = expiresAtMs - Date.now();
    return {
        expired: msRemaining <= 0,
        days_until_expiry: Math.ceil(msRemaining / MS_PER_DAY),
    };
};
