import 'dotenv/config';

const requireEnv = (name: string): string => {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

export const env = {
    nodeEnv: process.env.NODE_ENV?.trim() || 'development',
    port: Number(process.env.PORT || 5005),
    databaseUrl: requireEnv('DATABASE_URL'),
    jwtSecret: requireEnv('JWT_SECRET'),
    integrationSecret: requireEnv('INTEGRATION_SECRET'),
    corsOrigin: process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173',
    frontendUrl: process.env.FRONTEND_URL?.trim() || process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173',
    enableBackgroundWorkers: process.env.ENABLE_BACKGROUND_WORKERS !== 'false',
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() || '',
};
