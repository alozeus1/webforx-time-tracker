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
If `INTEGRATION_SECRET` is omitted, the backend will temporarily reuse `JWT_SECRET`, but a dedicated value is recommended before wider rollout.
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
- **Password:** `webforxtechng@`

Optional live-test users:
- **Manager:** `manager@webforxtech.com` / `password123`
- **Employee:** `employee@webforxtech.com` / `password123`

## 5. Launching the Native Desktop Tracker Wrapper
For users operating inside Desktop-specific environments, they can boot the Native wrapper to access system hardware Idle state integrations and window title matching.

```bash
cd desktop
npm install
npm start
```
This boots an Electron app bridging native OS interfaces down. Ensure the frontend is running on `:5173` prior to booting in Development!

---

## Technical Summary of Sub-systems
- **Timesheet Approvals**: Built-in endpoints at `/api/v1/timers/approvals` for managers.
- **Background Cron Engines**: Runs independently on the Node backend identifying 50hr+ burnout risks and 15+ minute inactive sessions.
- **Budget Monitoring**: Calculates `$Cost Burn` inside `/api/v1/projects` using associated developer hourly targets in PostgreSQL.
- **AI Categorization**: Available via `POST /api/v1/ml/categorize` mapping fuzzy text context of OS window titles mapped against Project descriptions.
- **Integration Storage**: Taiga and Mattermost credentials are encrypted before persistence and managed through `/api/v1/integrations`.
