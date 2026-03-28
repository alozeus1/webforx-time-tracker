"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const projectRoutes_1 = __importDefault(require("./routes/projectRoutes"));
const timeEntryRoutes_1 = __importDefault(require("./routes/timeEntryRoutes"));
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const integrationRoutes_1 = __importDefault(require("./routes/integrationRoutes"));
const calendarRoutes_1 = __importDefault(require("./routes/calendarRoutes"));
const mlRoutes_1 = __importDefault(require("./routes/mlRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const cronRoutes_1 = __importDefault(require("./routes/cronRoutes"));
const tagRoutes_1 = __importDefault(require("./routes/tagRoutes"));
const webhookRoutes_1 = __importDefault(require("./routes/webhookRoutes"));
const invoiceRoutes_1 = __importDefault(require("./routes/invoiceRoutes"));
const templateRoutes_1 = __importDefault(require("./routes/templateRoutes"));
const scheduledReportRoutes_1 = __importDefault(require("./routes/scheduledReportRoutes"));
const notificationWorker_1 = require("./workers/notificationWorker");
const idleTracker_1 = require("./workers/idleTracker");
const burnoutTracker_1 = require("./workers/burnoutTracker");
const db_1 = __importDefault(require("./config/db"));
const env_1 = require("./config/env");
dotenv_1.default.config({ quiet: true });
const app = (0, express_1.default)();
app.set('trust proxy', process.env.VERCEL === '1' ? 1 : false);
const expandOriginAliases = (origin) => {
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
    }
    catch (_a) {
        // Ignore invalid origins here; the explicit value will still be evaluated as-is.
    }
    return aliases;
};
const allowedOrigins = Array.from(new Set([env_1.env.corsOrigin, env_1.env.frontendUrl]
    .flatMap((value) => value.split(','))
    .flatMap((value) => expandOriginAliases(value))
    .filter(Boolean)));
const allowAnyOrigin = allowedOrigins.includes('*');
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests without an Origin header (for server-to-server calls, health checks, etc).
        if (!origin || allowAnyOrigin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
}));
app.use((0, helmet_1.default)());
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);
app.use(express_1.default.json({ limit: '10mb' }));
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts, please try again later.' },
});
// Routes
app.use('/api/v1/auth', authLimiter, authRoutes_1.default);
app.use('/api/v1/users', userRoutes_1.default);
app.use('/api/v1/projects', projectRoutes_1.default);
app.use('/api/v1/timers', timeEntryRoutes_1.default);
app.use('/api/v1/reports', reportRoutes_1.default);
app.use('/api/v1/integrations', integrationRoutes_1.default);
app.use('/api/v1/calendar', calendarRoutes_1.default);
app.use('/api/v1/ml', mlRoutes_1.default);
app.use('/api/v1/admin', adminRoutes_1.default);
app.use('/api/v1/cron', cronRoutes_1.default);
app.use('/api/v1/tags', tagRoutes_1.default);
app.use('/api/v1/webhooks', webhookRoutes_1.default);
app.use('/api/v1/invoices', invoiceRoutes_1.default);
app.use('/api/v1/templates', templateRoutes_1.default);
app.use('/api/v1/scheduled-reports', scheduledReportRoutes_1.default);
const swaggerSpec = (0, swagger_jsdoc_1.default)({
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
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec));
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
const bootstrap = () => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.default.$connect();
    if (env_1.env.enableBackgroundWorkers) {
        notificationWorker_1.notificationWorker.start();
        (0, idleTracker_1.startIdleTracker)();
        (0, burnoutTracker_1.startBurnoutTracker)();
    }
    if (process.env.VERCEL !== '1') {
        const server = app.listen(env_1.env.port, () => {
            console.log(`Server running on port ${env_1.env.port}`);
        });
        const shutdown = (signal) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`Received ${signal}. Closing server...`);
            server.close(() => __awaiter(void 0, void 0, void 0, function* () {
                yield db_1.default.$disconnect();
                process.exit(0);
            }));
        });
        process.on('SIGINT', () => {
            void shutdown('SIGINT');
        });
        process.on('SIGTERM', () => {
            void shutdown('SIGTERM');
        });
    }
});
if (process.env.VERCEL !== '1') {
    void bootstrap().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
        console.error('Failed to start server:', error);
        yield db_1.default.$disconnect();
        process.exit(1);
    }));
}
else {
    // Ensure DB connects in serverless environment
    void db_1.default.$connect();
}
exports.default = app;
