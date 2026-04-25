process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://preview:preview@localhost:5432/preview';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'preview-jwt-secret';
process.env.INTEGRATION_SECRET = process.env.INTEGRATION_SECRET || 'preview-integration-secret';
process.env.EXECUTIVE_REPORT_TEMPLATE_ENABLED = process.env.EXECUTIVE_REPORT_TEMPLATE_ENABLED || 'true';

import fs from 'fs';
import path from 'path';
import { generateExecutiveReportPdf, type ExecutiveReportEntry } from '../src/services/executiveReportTemplate';

const outputPath = process.argv[2] || path.resolve(process.cwd(), 'executive-timesheet-preview.pdf');

const sampleEntries: ExecutiveReportEntry[] = [
    {
        user: { email: 'ada@webforxtech.com', first_name: 'Ada', last_name: 'Lovelace' },
        project: { name: 'Platform Engineering' },
        task_description: 'Reviewed release readiness, closed deployment blockers, and validated production smoke checklist.',
        duration: 16200,
        start_time: new Date('2026-04-20T09:00:00.000Z'),
        status: 'approved',
    },
    {
        user: { email: 'grace@webforxtech.com', first_name: 'Grace', last_name: 'Hopper' },
        project: { name: 'Yemba' },
        task_description: 'Implemented dashboard fixes and coordinated QA feedback for the sprint milestone.',
        duration: 12600,
        start_time: new Date('2026-04-21T10:00:00.000Z'),
        status: 'approved',
    },
    {
        user: { email: 'alan@webforxtech.com', first_name: 'Alan', last_name: 'Turing' },
        project: { name: 'LAFABAH' },
        task_description: 'Resolved form submission issue and prepared client-facing validation notes.',
        duration: 7200,
        start_time: new Date('2026-04-22T13:00:00.000Z'),
        status: 'pending',
    },
    {
        user: { email: 'ada@webforxtech.com', first_name: 'Ada', last_name: 'Lovelace' },
        project: null,
        task_description: 'Recovered work block requiring project assignment cleanup.',
        duration: 3600,
        start_time: new Date('2026-04-23T15:00:00.000Z'),
        status: 'rejected',
    },
    {
        user: { email: 'marjorie@webforxtech.com', first_name: 'Marjorie', last_name: 'Echu' },
        project: { name: 'Web Forx Technology' },
        task_description: 'Prepared weekly operations notes and reviewed time approval exceptions.',
        duration: 9000,
        start_time: new Date('2026-04-24T11:00:00.000Z'),
        status: 'approved',
    },
    {
        user: { email: 'zero@webforxtech.com', first_name: 'Zero', last_name: 'Hour' },
        project: { name: 'Platform Engineering' },
        task_description: 'Zero duration test entry excluded from detail tables.',
        duration: 0,
        start_time: new Date('2026-04-24T18:00:00.000Z'),
        status: 'pending',
    },
];

const pdf = generateExecutiveReportPdf('Weekly Summary Report - 2026-04-20 to 2026-04-26', sampleEntries);
fs.writeFileSync(outputPath, Buffer.from(pdf));
console.log(`Executive report preview generated: ${outputPath}`);
