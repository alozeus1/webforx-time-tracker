import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import projectRoutes from './routes/projectRoutes';
import timeEntryRoutes from './routes/timeEntryRoutes';
import reportRoutes from './routes/reportRoutes';
import integrationRoutes from './routes/integrationRoutes';
import calendarRoutes from './routes/calendarRoutes';
import mlRoutes from './routes/mlRoutes';
import adminRoutes from './routes/adminRoutes';
import cronRoutes from './routes/cronRoutes';
import tagRoutes from './routes/tagRoutes';
import webhookRoutes from './routes/webhookRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import templateRoutes from './routes/templateRoutes';
import scheduledReportRoutes from './routes/scheduledReportRoutes';
import publicRoutes from './routes/publicRoutes';
import { logAuthEvent } from './services/authEventService';
import { notificationWorker } from './workers/notificationWorker';
import { startIdleTracker } from './workers/idleTracker';
import { startBurnoutTracker } from './workers/burnoutTracker';
import prisma from './config/db';
import { env } from './config/env';

dotenv.config({ quiet: true });

const app = express();
app.set('trust proxy', process.env.VERCEL === '1' ? 1 : false);

const expandOriginAliases = (origin: string) => {
    const normalized = origin.trim();
    if (!normalized) {
        return [];
    }

    const aliases = [normalized];

    try {
        const url = new URL(normalized);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
            const counterpart = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
            aliases.push(`${url.protocol}//${counterpart}${url.port ? `:${url.port}` : ''}`);
        }
    } catch {
        // Ignore invalid origins here; the explicit value will still be evaluated as-is.
    }

    return aliases;
};

const allowedOrigins = Array.from(
    new Set(
        [env.corsOrigin, env.frontendUrl]
            .flatMap((value) => value.split(','))
            .flatMap((value) => expandOriginAliases(value))
            .filter(Boolean),
    ),
);
const allowAnyOrigin = allowedOrigins.includes('*');

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests without an Origin header (for server-to-server calls, health checks, etc).
            if (!origin || allowAnyOrigin || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(new Error(`Origin not allowed by CORS: ${origin}`));
        },
    }),
);

app.use(helmet());

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts, please try again later.' },
    handler: (req, res, _next, options) => {
        const eventType = req.path.includes('forgot-password')
            ? 'password_reset_request'
            : req.path.includes('reset-password')
                ? 'password_reset_completion'
                : req.path.includes('refresh')
                    ? 'token_refresh'
                    : 'login_attempt';

        void logAuthEvent(req, {
            email: typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null,
            eventType,
            outcome: 'failure',
            reason: 'rate_limited',
            metadata: {
                path: req.path,
            },
        });

        res.status(options.statusCode).json(options.message);
    },
});

// Routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/timers', timeEntryRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/ml', mlRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/cron', cronRoutes);
app.use('/api/v1/tags', tagRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/scheduled-reports', scheduledReportRoutes);

const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: { title: 'Web Forx Time Tracker API', version: '1.0.0', description: 'API documentation for the Web Forx Time Tracker' },
        servers: [{ url: '/api/v1' }],
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: ['./src/routes/*.ts'],
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/', (_req, res) => {
    res.status(200).json({
        name: 'Web Forx Time Tracker API',
        status: 'ok',
        docs_hint: 'Use the frontend at http://localhost:5173 and the API under /api/v1',
        health: '/api/v1/health',
    });
});

app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Time Tracker API is running' });
});

app.get('/api/v1', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Web Forx Time Tracker API base path',
        health: '/api/v1/health',
        docs: '/api-docs',
    });
});

app.use('/api/v1', (_req, res) => {
    res.status(404).json({ message: 'API route not found' });
});

const bootstrap = async () => {
    await prisma.$connect();

    if (env.enableBackgroundWorkers) {
        notificationWorker.start();
        startIdleTracker();
        startBurnoutTracker();
    }

    if (process.env.VERCEL !== '1') {
        const server = app.listen(env.port, () => {
            console.log(`Server running on port ${env.port}`);
        });

        const shutdown = async (signal: string) => {
            console.log(`Received ${signal}. Closing server...`);
            server.close(async () => {
                await prisma.$disconnect();
                process.exit(0);
            });
        };

        process.on('SIGINT', () => {
            void shutdown('SIGINT');
        });

        process.on('SIGTERM', () => {
            void shutdown('SIGTERM');
        });
    }
};

if (process.env.VERCEL !== '1') {
    void bootstrap().catch(async (error) => {
        console.error('Failed to start server:', error);
        await prisma.$disconnect();
        process.exit(1);
    });
} else {
    // Ensure DB connects in serverless environment
    void prisma.$connect();
}

export default app;
