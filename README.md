# Web Forx Time Tracker

An enterprise-grade time tracking application consisting of a React frontend, Node/Express backend, and a native Electron desktop wrapper.

## Project Structure

- `frontend/`: React Vite application (Manager, Admin, Employee dashboards, reports, and timeline)
- `backend/`: Express + Prisma backend with Postgres integration. Includes cron workers for Burnout and Idle Time detection.
- `desktop/`: Electron wrapper for deep OS integrations like idle states and window title tracking.
- `docs/`: Product specification, application routes, and development statuses.

## Quick Start Requirements

- Node.js 20.19+ or 22.12+
- PostgreSQL Database

## Environment Configuration

Create a `.env` file in the `backend/` directory:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/webforx_tracker"
JWT_SECRET="<YOUR_SECURE_SECRET>"
INTEGRATION_SECRET="<A_SECOND_SECURE_SECRET>"
CRON_SECRET="<A_LONG_RANDOM_SECRET_FOR_CRON_ENDPOINTS>"
PORT=5005
CORS_ORIGIN="http://localhost:5173"
FRONTEND_URL="http://localhost:5173"
ENABLE_BACKGROUND_WORKERS=true
GOOGLE_CLIENT_ID="<GOOGLE_OAUTH_CLIENT_ID>"
GOOGLE_CLIENT_SECRET="<GOOGLE_OAUTH_CLIENT_SECRET>"
GOOGLE_REDIRECT_URI="http://localhost:5005/api/v1/calendar/callback"
```

Create a `.env` in `frontend/`:

```env
VITE_API_URL="http://localhost:5005/api/v1"
```

`INTEGRATION_SECRET` may fall back to `JWT_SECRET` in non-production for local onboarding, but it is required in production.

## Running the Application Locally

**1. Database and Backend:**
```bash
cd backend
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

**2. Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**3. Desktop Wrapper:**
Ensure the frontend is running on `:5173` before starting the Electron app in development format:
```bash
cd desktop
npm install
npm start
```

## Seeded Users

By default, `npx prisma db seed` creates these users:
- **Admin**: `admin@webforxtech.com`
- **Manager**: `manager@webforxtech.com`
- **Employee**: `employee@webforxtech.com`

Password behavior is explicit:
- Set `SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, and `SEED_EMPLOYEE_PASSWORD` to control credentials.
- Or set `ALLOW_DEFAULT_SEED_CREDENTIALS=true` (non-production only) to use the legacy demo passwords.
- Otherwise, secure random passwords are generated and printed during seeding.

## Tests

To run the automated test suite across the project:
```bash
cd backend && npm test
cd frontend && npm run test:unit
cd frontend && npm run test:e2e
```

Please refer to `DEPLOYMENT.md` for production deployment instructions.
