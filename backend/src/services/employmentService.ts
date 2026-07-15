import prisma from '../config/db';

/**
 * Worker classification ("employment type") is a dimension INDEPENDENT of the
 * access role (Admin / Manager / Member). It answers "what is this person's work
 * expectation?" and drives the minimum-weekly-hours compliance target.
 *
 * A user can be role=Manager (elevated access) + employment_type=intern
 * (10h expectation). Compliance targets must ALWAYS come from employment_type,
 * never from the access role — that separation is the whole point of this module.
 */

export const EMPLOYMENT_TYPES = ['employee', 'intern', 'contractor'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** Hard fallback used when an org has no configured override. */
export const DEFAULT_EMPLOYMENT_HOURS: Record<EmploymentType, number> = {
    employee: 40,
    intern: 10,
    contractor: 40,
};

/** Employment type assumed for reporting when a user is unclassified (NULL). */
export const FALLBACK_EMPLOYMENT_TYPE: EmploymentType = 'employee';

export type EmploymentHoursConfig = Record<EmploymentType, number>;

/**
 * Validate/canonicalise an arbitrary input into a known employment type.
 * Returns null for anything not in the allow-list (defense against injection
 * of arbitrary classification strings).
 */
export const normalizeEmploymentType = (value: unknown): EmploymentType | null => {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    return (EMPLOYMENT_TYPES as readonly string[]).includes(v) ? (v as EmploymentType) : null;
};

interface OrgSettingsShape {
    employment_hours?: Partial<Record<string, unknown>>;
    [key: string]: unknown;
}

const clampHours = (raw: unknown, fallback: number): number => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    // Guard against absurd values: 0–168 (hours in a week).
    return Math.min(Math.max(Math.round(n), 0), 168);
};

/**
 * Merge an org's stored `employment_hours` map with safe defaults. Every
 * employment type always resolves to a number, so callers never hit undefined.
 */
export const resolveEmploymentHours = (settings: unknown): EmploymentHoursConfig => {
    const stored = ((settings as OrgSettingsShape)?.employment_hours ?? {}) as Record<string, unknown>;
    const out = { ...DEFAULT_EMPLOYMENT_HOURS };
    for (const type of EMPLOYMENT_TYPES) {
        if (stored[type] !== undefined && stored[type] !== null) {
            out[type] = clampHours(stored[type], DEFAULT_EMPLOYMENT_HOURS[type]);
        }
    }
    return out;
};

/** Fetch and resolve the org-configured minimum-hours map. */
export const getOrgEmploymentHours = async (organizationId: string): Promise<EmploymentHoursConfig> => {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
    });
    return resolveEmploymentHours(org?.settings ?? {});
};

export interface MinHoursUserShape {
    employment_type?: string | null;
    min_weekly_hours?: number | null;
}

/**
 * Resolve a user's minimum weekly-hours target.
 * Order: per-user override -> org config for their employment type ->
 * org config for the fallback type. NULL employment_type is treated as the
 * fallback for reporting only (the stored record is never mutated).
 */
export const resolveMinWeeklyHours = (
    user: MinHoursUserShape,
    orgHours: EmploymentHoursConfig,
): number => {
    if (typeof user.min_weekly_hours === 'number' && Number.isFinite(user.min_weekly_hours)) {
        return clampHours(user.min_weekly_hours, 0);
    }
    const type = normalizeEmploymentType(user.employment_type) ?? FALLBACK_EMPLOYMENT_TYPE;
    return orgHours[type];
};
