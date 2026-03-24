process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.INTEGRATION_SECRET = process.env.INTEGRATION_SECRET || 'test-integration-secret';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
