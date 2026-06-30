import prisma from '../config/db';

export type RoundingDirection = 'nearest' | 'up' | 'down';

interface RoundingRule {
    increment: number;          // minutes: 1, 5, 6, 10, 15, 30, 60
    direction: RoundingDirection;
}

interface OrgSettings {
    time_rounding?: RoundingRule;
    [key: string]: unknown;
}

/**
 * Fetch the org's rounding rule from `Organization.settings.time_rounding`.
 * Returns null if none configured.
 */
export const getOrgRoundingRule = async (organizationId: string): Promise<RoundingRule | null> => {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
    });
    const settings = (org?.settings as OrgSettings) ?? {};
    const rule = settings.time_rounding;
    if (!rule || !rule.increment || !rule.direction) return null;
    const validIncrements = [1, 5, 6, 10, 15, 30, 60];
    if (!validIncrements.includes(rule.increment)) return null;
    if (!['nearest', 'up', 'down'].includes(rule.direction)) return null;
    return rule;
};

/**
 * Round a Date to the nearest increment based on direction.
 *
 * @param time   The raw datetime
 * @param type   'start' or 'end' — used when direction is ambiguous
 * @param rule   Rounding rule to apply
 */
export const roundTime = (time: Date, _type: 'start' | 'end', rule: RoundingRule): Date => {
    const incrementMs = rule.increment * 60 * 1000;
    const ms = time.getTime();
    let rounded: number;

    if (rule.direction === 'up') {
        rounded = Math.ceil(ms / incrementMs) * incrementMs;
    } else if (rule.direction === 'down') {
        rounded = Math.floor(ms / incrementMs) * incrementMs;
    } else {
        // nearest
        rounded = Math.round(ms / incrementMs) * incrementMs;
    }

    return new Date(rounded);
};

/**
 * Apply the org's rounding rule to `time`, or return it unchanged if no rule exists.
 */
export const applyRounding = async (
    organizationId: string,
    time: Date,
    type: 'start' | 'end',
): Promise<Date> => {
    const rule = await getOrgRoundingRule(organizationId);
    if (!rule) return time;
    return roundTime(time, type, rule);
};
