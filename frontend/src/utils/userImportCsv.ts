export interface UserImportCsvRow {
    email: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    role?: string;
    user_type?: string;
    type?: string;
    password?: string;
    project_ids?: string;
    projects?: string;
    project?: string;
    team?: string;
}

export interface ParseUserImportCsvResult {
    rows: UserImportCsvRow[];
    errors: string[];
}

const HEADER_ALIAS_TO_KEY: Record<string, keyof UserImportCsvRow> = {
    email: 'email',
    first: 'first_name',
    firstname: 'first_name',
    first_name: 'first_name',
    last: 'last_name',
    lastname: 'last_name',
    last_name: 'last_name',
    name: 'full_name',
    fullname: 'full_name',
    full_name: 'full_name',
    role: 'role',
    usertype: 'user_type',
    user_type: 'user_type',
    type: 'type',
    password: 'password',
    temp_password: 'password',
    temporary_password: 'password',
    project_id: 'project_ids',
    project_ids: 'project_ids',
    projectids: 'project_ids',
    projects: 'projects',
    project: 'project',
    team: 'team',
};

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const normalizeCell = (value: string): string => value.trim();
const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const parseCsvMatrix = (csvText: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
        const char = csvText[index];
        const nextChar = csvText[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                index += 1;
            }

            currentRow.push(currentCell);
            currentCell = '';

            const hasAnyValue = currentRow.some((cell) => normalizeCell(cell).length > 0);
            if (hasAnyValue) {
                rows.push(currentRow);
            }
            currentRow = [];
            continue;
        }

        currentCell += char;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell);
        const hasAnyValue = currentRow.some((cell) => normalizeCell(cell).length > 0);
        if (hasAnyValue) {
            rows.push(currentRow);
        }
    }

    return rows;
};

export const parseUserImportCsv = (csvText: string): ParseUserImportCsvResult => {
    const trimmed = csvText.trim();
    if (!trimmed) {
        return { rows: [], errors: ['The selected CSV file is empty.'] };
    }

    const matrix = parseCsvMatrix(trimmed);
    if (matrix.length < 2) {
        return { rows: [], errors: ['CSV must include a header row and at least one data row.'] };
    }

    const headerRow = matrix[0];
    const mappedHeaders: Array<{ index: number; key: keyof UserImportCsvRow }> = [];

    headerRow.forEach((rawHeader, index) => {
        const normalizedHeader = normalizeHeader(rawHeader);
        const mappedKey = HEADER_ALIAS_TO_KEY[normalizedHeader];
        if (mappedKey) {
            mappedHeaders.push({ index, key: mappedKey });
        }
    });

    const hasEmailColumn = mappedHeaders.some((header) => header.key === 'email');
    if (!hasEmailColumn) {
        return {
            rows: [],
            errors: ['CSV must include an email column (accepted headers: email, Email, EMAIL).'],
        };
    }

    const rows: UserImportCsvRow[] = [];
    const errors: string[] = [];

    matrix.slice(1).forEach((cells, rowIndex) => {
        const sourceRow = rowIndex + 2;
        const record: Partial<UserImportCsvRow> = {};
        let hasAnyMappedData = false;

        mappedHeaders.forEach(({ index, key }) => {
            const normalizedValue = normalizeCell(cells[index] ?? '');
            if (!normalizedValue) {
                return;
            }

            record[key] = key === 'email' ? normalizeEmail(normalizedValue) : normalizedValue;
            hasAnyMappedData = true;
        });

        if (!hasAnyMappedData) {
            return;
        }

        const email = typeof record.email === 'string' ? record.email : '';
        if (!email) {
            errors.push(`Row ${sourceRow}: missing email.`);
            return;
        }

        if (!isValidEmail(email)) {
            errors.push(`Row ${sourceRow}: invalid email "${email}".`);
            return;
        }

        rows.push(record as UserImportCsvRow);
    });

    if (rows.length === 0 && errors.length === 0) {
        errors.push('No importable data rows were found in the CSV.');
    }

    return { rows, errors };
};
