# Web Forx Time Tracker Deployment Guide

## 1. System Requirements
- Node.js 20.19+ or 22.12+
- PostgreSQL Database (running locally or remote)

## 2. Environment Configuration
Create a `.env` file in the `backend/` directory referencing your PostgreSQL database:
```
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
Update `frontend/.env` if your backend isn't running on localhost:5005:
```
VITE_API_URL="http://localhost:5005/api/v1"
```
If `INTEGRATION_SECRET` is omitted, the backend temporarily reuses `JWT_SECRET` only in non-production.
In production, `INTEGRATION_SECRET` is required.
For Google Calendar, add `http://localhost:5005/api/v1/calendar/callback` as an authorized redirect URI in Google Cloud Console.

## 3. Launching the Backend API
```bash
cd backend
npm install
# Push Schema to PostgreSQL
npx prisma db push
# Seed default roles, Admin accounts, and dummy projects
npx prisma db seed
# Run Development Server with Cron jobs enabled
npm run dev
```
The server will start on `http://localhost:5005`. Background active workers (Burnout detection, Idle tracking warnings) boot up instantly.

## 4. Launching the Frontend Web Application
```bash
cd frontend
npm install
npm run dev
```
The Vite React application will be available at `http://localhost:5173`.
Login using the Administrator credentials generated during seeding:
- **Email:** `admin@webforxtech.com`
- **Password:** set `SEED_ADMIN_PASSWORD` before seeding, or use the generated password printed during seed output.

Optional live-test users:
- **Manager:** `manager@webforxtech.com`
- **Employee:** `employee@webforxtech.com`

Legacy static demo passwords are only enabled when:
`ALLOW_DEFAULT_SEED_CREDENTIALS=true` and `NODE_ENV` is not `production`.

## 5. Launching the Native Desktop Tracker Wrapper
For users operating inside Desktop-specific environments, they can boot the Native wrapper to access system hardware Idle state integrations and window title matching.

```bash
cd desktop
npm install
npm start
```
This boots an Electron app bridging native OS interfaces down. Ensure the frontend is running on `:5173` prior to booting in Development!

---

## 6. Production Deployment (Vercel Frontend + Vercel Backend + Neon)

### 6.1 Authenticate CLIs
```bash
vercel login
npx -y neonctl auth
```

### 6.2 Create Neon Production Database
```bash
# Optional: select organization first if you have multiple orgs
npx -y neonctl orgs list

# Create project + database
npx -y neonctl projects create \
  --name webforx-time-tracker-prod \
  --region-id aws-us-east-1 \
  --database webforx_tracker \
  --set-context

# Generate Prisma-friendly pooled connection string
npx -y neonctl connection-string --prisma --pooled
```

Use the returned connection string as `DATABASE_URL` in the backend Vercel project.

### 6.3 Link and Deploy Backend Project (`vercel-backend`)
```bash
cd backend
vercel link --yes --project vercel-backend
```

Set production backend environment variables:
```bash
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
vercel env add INTEGRATION_SECRET production
vercel env add CRON_SECRET production
vercel env add CORS_ORIGIN production
vercel env add FRONTEND_URL production
vercel env add ENABLE_BACKGROUND_WORKERS production
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add GOOGLE_REDIRECT_URI production
```

Deploy backend:
```bash
vercel deploy --prod
```

### 6.4 Run Production Migrations + Seed (One-Time)
After `DATABASE_URL` points to Neon production:
```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
```

For deterministic admin credentials in production seeding, set:
`SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_EMPLOYEE_PASSWORD`.
Never rely on `ALLOW_DEFAULT_SEED_CREDENTIALS` for production.

### 6.5 Link and Deploy Frontend Project (`vercel`)
```bash
cd frontend
vercel link --yes --project vercel
vercel env add VITE_API_URL production
vercel deploy --prod
```

Set `VITE_API_URL` to your backend deployment URL, e.g.
`https://<backend-domain>/api/v1`.

### 6.6 Post-Deploy Checks
- Open `https://<backend-domain>/api/v1/health` and confirm status is `ok`.
- Log in through frontend production URL.
- Create a timer entry and confirm it persists.
- Verify reports page loads users and projects filters.
- Verify cron endpoints reject unauthenticated calls in production.

---

## Technical Summary of Sub-systems
- **Timesheet Approvals**: Built-in endpoints at `/api/v1/timers/approvals` for managers.
- **Background Cron Engines**: Runs independently on the Node backend identifying 50hr+ burnout risks and 15+ minute inactive sessions.
- **Budget Monitoring**: Calculates `$Cost Burn` inside `/api/v1/projects` using associated developer hourly targets in PostgreSQL.
- **AI Categorization**: Available via `POST /api/v1/ml/categorize` mapping fuzzy text context of OS window titles mapped against Project descriptions.
- **Integration Storage**: Taiga and Mattermost credentials are encrypted before persistence and managed through `/api/v1/integrations`.
