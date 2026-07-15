import {
    normalizeEmploymentType,
    resolveEmploymentHours,
    resolveMinWeeklyHours,
    DEFAULT_EMPLOYMENT_HOURS,
} from '../src/services/employmentService';

describe('normalizeEmploymentType', () => {
    it('accepts known types case-insensitively', () => {
        expect(normalizeEmploymentType('intern')).toBe('intern');
        expect(normalizeEmploymentType('Contractor')).toBe('contractor');
        expect(normalizeEmploymentType('  EMPLOYEE ')).toBe('employee');
    });

    it('rejects unknown / non-string values', () => {
        expect(normalizeEmploymentType('admin')).toBeNull();
        expect(normalizeEmploymentType('staff')).toBeNull();
        expect(normalizeEmploymentType(null)).toBeNull();
        expect(normalizeEmploymentType(42)).toBeNull();
    });
});

describe('resolveEmploymentHours', () => {
    it('returns defaults when nothing is configured', () => {
        expect(resolveEmploymentHours({})).toEqual(DEFAULT_EMPLOYMENT_HOURS);
        expect(resolveEmploymentHours(undefined)).toEqual(DEFAULT_EMPLOYMENT_HOURS);
    });

    it('merges configured overrides over defaults', () => {
        const cfg = resolveEmploymentHours({ employment_hours: { intern: 15 } });
        expect(cfg.intern).toBe(15);
        expect(cfg.employee).toBe(40);
        expect(cfg.contractor).toBe(40);
    });

    it('clamps out-of-range values and ignores unknown keys', () => {
        const cfg = resolveEmploymentHours({
            employment_hours: { employee: 999, intern: -5, ceo: 80 },
        });
        expect(cfg.employee).toBe(168);
        expect(cfg.intern).toBe(0);
        expect((cfg as Record<string, unknown>).ceo).toBeUndefined();
    });
});

describe('resolveMinWeeklyHours', () => {
    const orgHours = resolveEmploymentHours({ employment_hours: { intern: 10 } });

    it('honours a per-user override before the org config', () => {
        expect(resolveMinWeeklyHours({ employment_type: 'intern', min_weekly_hours: 25 }, orgHours)).toBe(25);
    });

    it('uses the employment-type target — an intern is judged at the intern minimum', () => {
        expect(resolveMinWeeklyHours({ employment_type: 'intern' }, orgHours)).toBe(10);
        expect(resolveMinWeeklyHours({ employment_type: 'contractor' }, orgHours)).toBe(40);
    });

    it('falls back to the employee target when unclassified (NULL)', () => {
        expect(resolveMinWeeklyHours({ employment_type: null }, orgHours)).toBe(40);
        expect(resolveMinWeeklyHours({}, orgHours)).toBe(40);
    });
});
