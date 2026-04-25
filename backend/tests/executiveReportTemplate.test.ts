import {
    buildExecutiveReportModel,
    generateExecutiveReportPdf,
    getReportLogoAssets,
    type ExecutiveReportEntry,
} from '../src/services/executiveReportTemplate';

const entries: ExecutiveReportEntry[] = [
    {
        user: { email: 'ada@webforxtech.com', first_name: 'Ada', last_name: 'Lovelace' },
        project: { name: 'Platform Engineering' },
        task_description: 'Approved platform delivery work',
        duration: 7200,
        start_time: new Date('2026-04-06T09:00:00.000Z'),
        status: 'approved',
    },
    {
        user: { email: 'ada@webforxtech.com', first_name: 'Ada', last_name: 'Lovelace' },
        project: null,
        task_description: 'Pending cleanup assignment',
        duration: 1800,
        start_time: new Date('2026-04-07T09:00:00.000Z'),
        status: 'pending',
    },
    {
        user: { email: 'grace@webforxtech.com', first_name: 'Grace', last_name: 'Hopper' },
        project: { name: 'Yemba' },
        task_description: 'Rejected duplicate work block',
        duration: 3600,
        start_time: new Date('2026-04-08T09:00:00.000Z'),
        status: 'rejected',
    },
    {
        user: { email: 'zero@webforxtech.com', first_name: 'Zero', last_name: 'Hour' },
        project: { name: 'Yemba' },
        task_description: 'Zero duration noise',
        duration: 0,
        start_time: new Date('2026-04-09T09:00:00.000Z'),
        status: 'approved',
    },
];

describe('executive report template', () => {
    it('calculates deterministic total and status hours', () => {
        const model = buildExecutiveReportModel(
            'Weekly Summary Report - 2026-03-31 to 2026-04-06',
            entries,
            new Date('2026-04-10T12:00:00.000Z'),
        );

        expect(model.totals.totalHours).toBe(3.5);
        expect(model.totals.approvedHours).toBe(2);
        expect(model.totals.pendingHours).toBe(0.5);
        expect(model.totals.rejectedHours).toBe(1);
        expect(model.zeroHourEntries).toBe(1);
    });

    it('groups approved, rejected, and pending entries by employee', () => {
        const model = buildExecutiveReportModel('Weekly Summary Report - 2026-03-31 to 2026-04-06', entries);
        const ada = model.employees.find((employee) => employee.key === 'ada@webforxtech.com');
        const grace = model.employees.find((employee) => employee.key === 'grace@webforxtech.com');

        expect(ada).toMatchObject({
            approvedHours: 2,
            pendingHours: 0.5,
            rejectedHours: 0,
        });
        expect(grace).toMatchObject({
            approvedHours: 0,
            pendingHours: 0,
            rejectedHours: 1,
        });
    });

    it('groups unassigned and named projects separately', () => {
        const model = buildExecutiveReportModel('Weekly Summary Report - 2026-03-31 to 2026-04-06', entries);

        expect(model.projects.map((project) => project.label)).toEqual(expect.arrayContaining([
            'Platform Engineering',
            'Unassigned',
            'Yemba',
        ]));
        expect(model.projects.find((project) => project.label === 'Unassigned')?.pendingHours).toBe(0.5);
    });

    it('derives executive titles for weekly, monthly, and daily reports', () => {
        expect(buildExecutiveReportModel('Weekly Summary Report - 2026-03-31 to 2026-04-06', entries).displayTitle).toBe('Weekly Timesheet Executive Report');
        expect(buildExecutiveReportModel('Monthly Summary Report - 2026-04-01 to 2026-04-30', entries).displayTitle).toBe('Monthly Timesheet Executive Report');
        expect(buildExecutiveReportModel('Daily Autonomous Time Report - 2026-04-06', entries).displayTitle).toBe('Daily Timesheet Executive Report');
    });

    it('generates a non-empty PDF buffer', () => {
        const pdf = generateExecutiveReportPdf('Weekly Summary Report - 2026-03-31 to 2026-04-06', entries);
        const buffer = Buffer.from(pdf);

        expect(buffer.length).toBeGreaterThan(5000);
        expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('falls back cleanly when configured logos are missing', () => {
        const logos = getReportLogoAssets({
            companyLogoPath: '/tmp/missing-company-logo.png',
            appLogoPath: '/tmp/missing-app-logo.png',
            disableFallback: true,
        });
        const pdf = generateExecutiveReportPdf('Weekly Summary Report - 2026-03-31 to 2026-04-06', entries);

        expect(logos.companyLogo).toBeNull();
        expect(logos.appLogo).toBeNull();
        expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe('%PDF');
    });
});
