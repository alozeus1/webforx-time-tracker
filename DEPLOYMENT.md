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
CORS_ORIGIN="http://localhost:5173,http://127.0.0.1:5173"
FRONTEND_URL="http://localhost:5173,http://127.0.0.1:5173"
ENABLE_BACKGROUND_WORKERS=true
IDLE_WARNING_MINUTES=15
HEARTBEAT_INTERVAL_MINUTES=3
HEARTBEAT_STALE_MINUTES=8
AUTO_STOP_GRACE_MINUTES=12
MAX_PAUSE_HOURS=4
MAX_ACTIVE_TIMER_HOURS=8
# Enhanced activity-aware idle detection (ActivityWatch-inspired). When true, background tabs
# that send fresh heartbeats (hidden_connected) are NOT paused — idleTracker owns their state.
# Set to true in production once verified. Must match VITE_TIMER_ENHANCED_ACTIVITY_DETECTION.
TIMER_ENHANCED_ACTIVITY_DETECTION=false
# Grace window (minutes) before a hidden_connected session triggers a soft idle warning.
# No timer pause — notification nudge only. Must match VITE_HIDDEN_CONNECTED_GRACE_MINUTES.
HIDDEN_CONNECTED_GRACE_MINUTES=10
RESEND_API_KEY="<RESEND_API_KEY>"
EMAIL_FROM="Web Forx Time Tracker <noreply@webforxtech.com>"
EXECUTIVE_REPORT_TEMPLATE_ENABLED=true
REPORT_COMPANY_LOGO_PATH="<OPTIONAL_ABSOLUTE_COMPANY_LOGO_PATH>"
REPORT_TIMER_APP_LOGO_PATH="<OPTIONAL_ABSOLUTE_TIMER_APP_LOGO_PATH>"
GOOGLE_CLIENT_ID="<GOOGLE_OAUTH_CLIENT_ID>"
GOOGLE_CLIENT_SECRET="<GOOGLE_OAUTH_CLIENT_SECRET>"
GOOGLE_REDIRECT_URI="http://localhost:5005/api/v1/calendar/callback"
# Optional private receipt storage. Expenses remain usable without these values,
# but receipt upload/view controls are disabled.
EXPENSE_RECEIPT_BUCKET="<PRIVATE_S3_BUCKET>"
EXPENSE_RECEIPT_REGION="us-east-1"
# Optional for S3-compatible providers such as MinIO or R2.
EXPENSE_RECEIPT_ENDPOINT=""
# The AWS SDK also needs standard scoped credentials when workload identity is unavailable:
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and optionally AWS_SESSION_TOKEN.
```
Update `frontend/.env` if your backend isn't running on localhost:5005:
```
VITE_API_URL="http://localhost:5005/api/v1"
VITE_HEARTBEAT_INTERVAL_MINUTES=3
VITE_IDLE_WARNING_MINUTES=15
VITE_MAX_ACTIVE_TIMER_HOURS=8
# Enhanced activity detection — must mirror backend TIMER_ENHANCED_ACTIVITY_DETECTION
VITE_TIMER_ENHANCED_ACTIVITY_DETECTION=false
# Grace window (minutes) for hidden_connected tabs — must mirror backend HIDDEN_CONNECTED_GRACE_MINUTES
VITE_HIDDEN_CONNECTED_GRACE_MINUTES=10
```
If `INTEGRATION_SECRET` is omitted, the backend temporarily reuses `JWT_SECRET` only in non-production.
In production, `INTEGRATION_SECRET` is required.
For Google Calendar, add `http://localhost:5005/api/v1/calendar/callback` as an authorized redirect URI in Google Cloud Console.
For receipt uploads, keep the bucket private, grant the backend principal only the required object permissions under the `expenses/` prefix, and allow browser `PUT` requests from the configured frontend origins in the bucket CORS policy.

For a sanitized engineering handoff that does not include production access, see [docs/engineering-handoff.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/engineering-handoff.md).

## 3. Launching the Backend API
```bash
cd backend
npm install
# Blocks boot if DB schema does not match prisma/schema.prisma
npm run schema:check
# Development-only schema sync for a local disposable database.
# Never run prisma db push against production or a shared database.
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

### 6.0 Required Release Gates Before Production Promotion

Production promotion must be blocked unless GitHub Actions job
`Verification Complete` from `.github/workflows/release-guards.yml` passes on the
exact commit being deployed.

Required repository settings:
- Protect `main`.
- Require pull request review before merge.
- Require status checks before merge.
- Mark `Verification Complete` as a required status check.
- Require branches to be up to date before merge.
- Restrict force pushes and branch deletion.

Required Vercel settings:
- Disable direct production promotion for commits that have not passed required
  GitHub checks, or deploy production only from the GitHub Actions release flow.
- Ensure frontend and backend projects both deploy the exact checked commit SHA.
- Keep Vercel Git integration preview deploys non-production until required
  GitHub checks pass.

These are operator-owned platform settings. Do not claim they are active unless
verified in GitHub and Vercel.

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
# Release preflight: fail fast if schema drift exists
npm run release:preflight
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
vercel env add RESEND_API_KEY production
vercel env add EMAIL_FROM production
vercel env add EXECUTIVE_REPORT_TEMPLATE_ENABLED production
vercel env add REPORT_COMPANY_LOGO_PATH production
vercel env add REPORT_TIMER_APP_LOGO_PATH production
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add GOOGLE_REDIRECT_URI production
vercel env add EXPENSE_RECEIPT_BUCKET production
vercel env add EXPENSE_RECEIPT_REGION production
# Set EXPENSE_RECEIPT_ENDPOINT only for an S3-compatible non-AWS provider.
```

Deploy backend:
```bash
vercel deploy --prod
```

### 6.4 Run Production Migrations + Seed (One-Time)
After `DATABASE_URL` points to Neon production:
```bash
cd backend
npm run release:migrate
# Verify runtime schema exactly matches expected Prisma schema after migration
npm run release:preflight
npx prisma db seed
```

For deterministic admin credentials in production seeding, set:
`SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_EMPLOYEE_PASSWORD`.
Never rely on `ALLOW_DEFAULT_SEED_CREDENTIALS` for production.

Legacy takeover note: if the target database was previously created with
`prisma db push` and has no `_prisma_migrations` ledger, first verify the schema
against `prisma/schema.prisma`, then mark the idempotent baseline as applied:

```bash
cd backend
npm run schema:check
npm run release:baseline-existing
npm run release:migrate
```

Do not use `release:baseline-existing` on an empty database; `release:migrate`
must create empty databases from migrations.

### 6.5 Link and Deploy Frontend Project (`vercel`)
```bash
cd frontend
vercel link --yes --project vercel
vercel env add VITE_API_URL production
vercel deploy --prod
```

Set `VITE_API_URL` to your backend deployment URL, e.g.
`https://api.dev.webforxtech.com/api/v1`.

### 6.6 Post-Deploy Checks
- Open `https://api.dev.webforxtech.com/api/v1/health` and confirm status is `ok` and `database` is `ok`.
- Run a login smoke check against the deployed backend:
```bash
cd backend
RELEASE_SMOKE_BASE_URL="https://api.dev.webforxtech.com" \
RELEASE_SMOKE_EMAIL="<smoke-user-email>" \
RELEASE_SMOKE_PASSWORD="<smoke-user-password>" \
npm run release:smoke:login
```
Or run the combined guard in one command:
```bash
RELEASE_SMOKE_BASE_URL="https://api.dev.webforxtech.com" \
RELEASE_SMOKE_EMAIL="<smoke-user-email>" \
RELEASE_SMOKE_PASSWORD="<smoke-user-password>" \
npm run release:verify
```
GitHub Actions runs `.github/workflows/release-guards.yml` on PRs and pushes to `main`; `Verification Complete` requires build, test, typecheck, lint, audit, migration drift, Playwright smoke, secret scan, CodeQL, and login smoke.
- Log in through frontend production URL.
- Create a timer entry and confirm it persists.
- Verify reports page loads users and projects filters.
- Verify cron endpoints reject unauthenticated calls in production.

## 7. Engineering-Owned Deployment

If a new engineering team is taking over this codebase without access to the existing Vercel projects:

- do not reuse the current production secrets
- create a new PostgreSQL database they control
- create a new backend deployment target they control
- create a new frontend deployment target they control
- point their frontend `VITE_API_URL` to their own backend `/api/v1` URL
- add their own CI/CD secrets in the new repository

The repo is structured so that a team can fully run and deploy it from source with:

```bash
cd backend
npm install
npm run schema:check
npm run release:baseline-existing # only for an existing db-push database with no migration ledger
npm run release:migrate
npx prisma db seed
npm run build
npm test

cd ../frontend
npm install
npm run build
npm run lint
npm run test:unit
```

---

## Technical Summary of Sub-systems
- **Timesheet Approvals**: Built-in endpoints at `/api/v1/timers/approvals` for managers.
- **Background Cron Engines**: Runs independently on the Node backend identifying 50hr+ burnout risks and enforcing the production idle policy: warning after 15 minutes, pause after 20 minutes.
- **Budget Monitoring**: Calculates `$Cost Burn` inside `/api/v1/projects` using associated developer hourly targets in PostgreSQL.
- **AI Categorization**: Available via `POST /api/v1/ml/categorize` mapping fuzzy text context of OS window titles mapped against Project descriptions.
- **Integration Storage**: Taiga and Mattermost credentials are encrypted before persistence and managed through `/api/v1/integrations`.
