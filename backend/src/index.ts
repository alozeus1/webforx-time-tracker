import express from 'express';
import cors from 'cors';
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
import { notificationWorker } from './workers/notificationWorker';
import { startIdleTracker } from './workers/idleTracker';
import { startBurnoutTracker } from './workers/burnoutTracker';
import prisma from './config/db';
import { env } from './config/env';

dotenv.config();

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/timers', timeEntryRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/ml', mlRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/cron', cronRoutes);

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
