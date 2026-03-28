import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
const allowDefaultSeedCredentials =
    process.env.ALLOW_DEFAULT_SEED_CREDENTIALS === 'true' && nodeEnv !== 'production';

type SeedPassword = {
    value: string;
    rotateExisting: boolean;
    source: 'env' | 'default-dev' | 'generated';
};

const resolveSeedPassword = (
    label: string,
    envVar: string,
    defaultPassword: string,
): SeedPassword => {
    const explicit = process.env[envVar]?.trim();

    if (explicit) {
        console.log(`[seed] ${label}: using password from ${envVar}`);
        return { value: explicit, rotateExisting: true, source: 'env' };
    }

    if (allowDefaultSeedCredentials) {
        console.warn(
            `[seed] ${label}: using development default credential because ALLOW_DEFAULT_SEED_CREDENTIALS=true`,
        );
        return { value: defaultPassword, rotateExisting: true, source: 'default-dev' };
    }

    const generated = crypto.randomBytes(18).toString('base64url');
    console.log(`[seed] ${label}: generated password for newly created users -> ${generated}`);
    return { value: generated, rotateExisting: false, source: 'generated' };
};

async function main() {
    console.log('Start seeding...');

    if (!allowDefaultSeedCredentials) {
        console.log(
            '[seed] Static default credentials are disabled. Set ALLOW_DEFAULT_SEED_CREDENTIALS=true (non-production only) to enable them.',
        );
    }

    // 1. Create Roles
    const roles = ['Admin', 'Manager', 'Employee', 'Intern'];

    for (const roleName of roles) {
        await prisma.role.upsert({
            where: { name: roleName },
            update: {},
            create: {
                name: roleName,
            },
        });
    }

    console.log(`✅ Roles seeded: ${roles.join(', ')}`);

    const adminRole = await prisma.role.findUnique({ where: { name: 'Admin' } });
    const managerRole = await prisma.role.findUnique({ where: { name: 'Manager' } });
    const employeeRole = await prisma.role.findUnique({ where: { name: 'Employee' } });

    if (!adminRole) {
        throw new Error('Admin role not found after creation.');
    }

    const adminPassword = resolveSeedPassword(
        'Admin account',
        'SEED_ADMIN_PASSWORD',
        'webforxtechng@',
    );
    const managerPassword = resolveSeedPassword(
        'Manager account',
        'SEED_MANAGER_PASSWORD',
        'password123',
    );
    const employeePassword = resolveSeedPassword(
        'Employee account',
        'SEED_EMPLOYEE_PASSWORD',
        'password123',
    );

    const adminUser = await prisma.user.upsert({
        where: { email: 'admin@webforxtech.com' },
        update: {
            first_name: 'Amina',
            last_name: 'Bello',
            role_id: adminRole.id,
            is_active: true,
            ...(adminPassword.rotateExisting ? { password_hash: await bcrypt.hash(adminPassword.value, 10) } : {}),
        },
        create: {
            email: 'admin@webforxtech.com',
            first_name: 'Amina',
            last_name: 'Bello',
            password_hash: await bcrypt.hash(adminPassword.value, 10),
            role_id: adminRole.id,
            is_active: true,
        },
    });

    console.log(`✅ Admin user seeded: ${adminUser.email}`);

    if (managerRole) {
        const managerUser = await prisma.user.upsert({
            where: { email: 'manager@webforxtech.com' },
            update: {
                first_name: 'Maya',
                last_name: 'Okafor',
                role_id: managerRole.id,
                is_active: true,
                hourly_rate: 85,
                ...(managerPassword.rotateExisting ? { password_hash: await bcrypt.hash(managerPassword.value, 10) } : {}),
            },
            create: {
                email: 'manager@webforxtech.com',
                first_name: 'Maya',
                last_name: 'Okafor',
                password_hash: await bcrypt.hash(managerPassword.value, 10),
                role_id: managerRole.id,
                is_active: true,
                hourly_rate: 85,
            },
        });

        console.log(`✅ Manager user seeded: ${managerUser.email}`);
    }

    if (employeeRole) {
        const employeeUser = await prisma.user.upsert({
            where: { email: 'employee@webforxtech.com' },
            update: {
                first_name: 'Chris',
                last_name: 'Adewale',
                role_id: employeeRole.id,
                is_active: true,
                hourly_rate: 55,
                ...(employeePassword.rotateExisting ? { password_hash: await bcrypt.hash(employeePassword.value, 10) } : {}),
            },
            create: {
                email: 'employee@webforxtech.com',
                first_name: 'Chris',
                last_name: 'Adewale',
                password_hash: await bcrypt.hash(employeePassword.value, 10),
                role_id: employeeRole.id,
                is_active: true,
                hourly_rate: 55,
            },
        });
        console.log(`✅ Employee user seeded: ${employeeUser.email}`);
    }

    const initialProjects = [
        {
            name: 'EDUSUC',
            description: 'Education partnership delivery and product support for the EDUSUC client account.',
        },
        {
            name: 'LAFABAH',
            description: 'Implementation and time tracking for the LAFABAH program rollout.',
        },
        {
            name: 'Yemba',
            description: 'Cross-functional execution for the Yemba platform and client onboarding work.',
        },
        {
            name: 'Platform Engineering',
            description: 'Shared infrastructure, developer experience, and internal tooling for Web Forx teams.',
        },
        {
            name: 'Business Analytics (BA)',
            description: 'Reporting, operational analytics, and performance insights for leadership stakeholders.',
        },
        {
            name: 'Web Forx Website',
            description: 'Marketing site improvements, content updates, and conversion-focused web operations.',
        },
        {
            name: 'Web Forx Technology',
            description: 'Internal company initiatives, enablement, and strategic delivery across the organization.',
        },
    ];

    for (const project of initialProjects) {
        await prisma.project.upsert({
            where: { name: project.name },
            update: {
                description: project.description,
                is_active: true,
            },
            create: {
                name: project.name,
                description: project.description,
                is_active: true,
            },
        });
    }

    console.log(`✅ Initial projects seeded: ${initialProjects.map((project) => project.name).join(', ')}`);

    if (adminPassword.source === 'generated') {
        console.log('[seed] Admin password was generated. Persist it now or set SEED_ADMIN_PASSWORD for stable credentials.');
    }
    if (managerPassword.source === 'generated') {
        console.log('[seed] Manager password was generated. Persist it now or set SEED_MANAGER_PASSWORD for stable credentials.');
    }
    if (employeePassword.source === 'generated') {
        console.log('[seed] Employee password was generated. Persist it now or set SEED_EMPLOYEE_PASSWORD for stable credentials.');
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
