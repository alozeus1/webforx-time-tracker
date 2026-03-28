import { describe, expect, it } from 'vitest';
import { parseUserImportCsv } from './userImportCsv';

describe('parseUserImportCsv', () => {
    it('parses valid rows and normalizes email', () => {
        const csv = [
            'Email,First Name,Last Name,User Type,Projects',
            'ADA@Example.com,Ada,Lovelace,Manager,"Platform Engineering"',
            'sam@example.com,Sam,Lee,Intern,"EDUSUC;Yemba"',
        ].join('\n');

        const result = parseUserImportCsv(csv);

        expect(result.errors).toHaveLength(0);
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].email).toBe('ada@example.com');
        expect(result.rows[0].user_type).toBe('Manager');
        expect(result.rows[1].projects).toBe('EDUSUC;Yemba');
    });

    it('returns parsing errors for missing or invalid emails', () => {
        const csv = [
            'email,first_name,last_name,user_type',
            ',NoEmail,Person,employee',
            'bad-email,Ada,Lovelace,manager',
        ].join('\n');

        const result = parseUserImportCsv(csv);

        expect(result.rows).toHaveLength(0);
        expect(result.errors).toHaveLength(2);
        expect(result.errors[0]).toContain('missing email');
        expect(result.errors[1]).toContain('invalid email');
    });

    it('supports quoted fields with commas', () => {
        const csv = [
            'email,full_name,projects',
            'jane@example.com,"Jane Doe","Platform Engineering, Web Forx Technology"',
        ].join('\n');

        const result = parseUserImportCsv(csv);

        expect(result.errors).toHaveLength(0);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].projects).toBe('Platform Engineering, Web Forx Technology');
    });
});
