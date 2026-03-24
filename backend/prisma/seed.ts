import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding...');

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

    // 2. Create the Admin User
    const adminRole = await prisma.role.findUnique({ where: { name: 'Admin' } });

    if (!adminRole) {
        throw new Error('Admin role not found after creation.');
    }

    const adminEmail = 'admin@webforxtech.com';
    const plainPassword = 'webforxtechng@';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const adminUser = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            password_hash: hashedPassword, // Update password if it already exists
        },
        create: {
            email: adminEmail,
            first_name: 'System',
            last_name: 'Administrator',
            password_hash: hashedPassword,
            role_id: adminRole.id,
            is_active: true,
        },
    });

    console.log(`✅ Admin user seeded: ${adminUser.email}`);

    const managerRole = await prisma.role.findUnique({ where: { name: 'Manager' } });

    if (managerRole) {
        const managerEmail = 'manager@webforxtech.com';
        const managerPassword = await bcrypt.hash('password123', 10);

        const managerUser = await prisma.user.upsert({
            where: { email: managerEmail },
            update: {
                password_hash: managerPassword,
            },
            create: {
                email: managerEmail,
                first_name: 'Team',
                last_name: 'Manager',
                password_hash: managerPassword,
                role_id: managerRole.id,
                is_active: true,
                hourly_rate: 85,
            },
        });

        console.log(`✅ Manager test user seeded: ${managerUser.email}`);
    }

    // 3. Create a Test Employee User
    const employeeRole = await prisma.role.findUnique({ where: { name: 'Employee' } });

    if (employeeRole) {
        const employeeEmail = 'employee@webforxtech.com';
        const employeePassword = await bcrypt.hash('password123', 10);

        const employeeUser = await prisma.user.upsert({
            where: { email: employeeEmail },
            update: {
                password_hash: employeePassword,
            },
            create: {
                email: employeeEmail,
                first_name: 'Test',
                last_name: 'Employee',
                password_hash: employeePassword,
                role_id: employeeRole.id,
                is_active: true,
                hourly_rate: 55,
            },
        });
        console.log(`✅ Employee test user seeded: ${employeeUser.email}`);
    }

    const initialProjects = [
        'EDUSUC',
        'LAFABAH',
        'Yemba',
        'Platform Engineering',
        'BA',
        'Webforx Website',
        'Web Forx Technology',
    ];

    for (const projectName of initialProjects) {
        await prisma.project.upsert({
            where: { name: projectName },
            update: { is_active: true },
            create: {
                name: projectName,
                description: `${projectName} seeded from MVP specification`,
                is_active: true,
            },
        });
    }

    console.log(`✅ Initial projects seeded: ${initialProjects.join(', ')}`);

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
