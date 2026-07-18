import prisma from '../src/config/db';
import { encryptSecret, looksEncryptedConfig } from '../src/utils/crypto';

const run = async () => {
    const users = await prisma.user.findMany({
        where: { mfa_secret: { not: null } },
        select: { id: true, mfa_secret: true },
    });

    let encryptedMfaSecrets = 0;
    for (const user of users) {
        if (!user.mfa_secret || looksEncryptedConfig(user.mfa_secret)) continue;
        await prisma.user.update({
            where: { id: user.id },
            data: { mfa_secret: encryptSecret(user.mfa_secret) },
        });
        encryptedMfaSecrets += 1;
    }

    const calendarConnections = await prisma.calendarConnection.findMany({
        select: { id: true, refresh_token: true },
    });

    let encryptedCalendarTokens = 0;
    for (const connection of calendarConnections) {
        if (looksEncryptedConfig(connection.refresh_token)) continue;
        await prisma.calendarConnection.update({
            where: { id: connection.id },
            data: { refresh_token: encryptSecret(connection.refresh_token) },
        });
        encryptedCalendarTokens += 1;
    }

    console.log(`[secret-backfill] MFA secrets encrypted: ${encryptedMfaSecrets}`);
    console.log(`[secret-backfill] Calendar refresh tokens encrypted: ${encryptedCalendarTokens}`);
};

run()
    .catch((error) => {
        console.error('[secret-backfill] Failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
