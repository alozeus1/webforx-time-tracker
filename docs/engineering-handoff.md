# Engineering Handoff

Last updated: 2026-04-24

This document is the source of truth for handing this repository to an engineering team that does not have access to the existing production Vercel projects or secrets.

## Scope

What the new team receives:

- full application source for `frontend/`, `backend/`, and `desktop/`
- Prisma schema, seed logic, and local build/test scripts
- CI workflow definitions under `.github/workflows/`
- safe `.env.example` templates for backend and frontend

What the new team does not receive:

- existing Vercel project access
- existing production environment values
- existing database credentials
- local-only agent files, demo credential docs, or `.vercel/` linkage

## Runtime Summary

- Frontend: React + Vite in `frontend/`
- Backend: Express + Prisma + PostgreSQL in `backend/`
- Desktop wrapper: Electron in `desktop/`
- Database: PostgreSQL
- Node.js: `>=20.19.0 <21 || >=22.12.0`

## Repository Hygiene Decisions

This handoff branch intentionally excludes:

- `.vercel/`
- real `.env` files
- `backend/dist/` from version control
- local-only docs like `docs/demo-user.md`
- local-only agent notes like `AGENT_CONTEXT.md`

The backend still builds to `dist/` locally, but generated files are not tracked in the handoff set.

## Local Bootstrap

### 1. Install prerequisites

- Node.js `20.19.x` or `22.12.x+`
- npm
- PostgreSQL 14+ or compatible

Optional: Docker if the team prefers to run Postgres in a container.

Example local Postgres container:

```bash
docker run --name webforx-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=webforx_tracker \
  -p 5432:5432 \
  -d postgres:16
```

### 2. Configure env files

Copy examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Required backend values for local dev:

- `DATABASE_URL`
- `JWT_SECRET`
- `INTEGRATION_SECRET`

Recommended local values to set explicitly:

- `SEED_ADMIN_PASSWORD`
- `SEED_MANAGER_PASSWORD`
- `SEED_EMPLOYEE_PASSWORD`

Required frontend value:

- `VITE_API_URL`

### 3. Initialize the database

```bash
cd backend
npm install
npm run schema:check
npx prisma db push
npx prisma db seed
```

This will:

- validate runtime schema assumptions
- apply the Prisma schema to the local database
- seed roles, baseline users, and starter projects

### 4. Run the backend

```bash
cd backend
npm run dev
```

Backend URL:

- `http://localhost:5005`
- health check: `http://localhost:5005/api/v1/health`

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

- `http://localhost:5173`

### 6. Optional desktop wrapper

```bash
cd desktop
npm install
npm start
```

Use only after the frontend is already running locally.

## Seeded Local Accounts

Baseline seeded accounts:

- `admin@webforxtech.com`
- `manager@webforxtech.com`
- `employee@webforxtech.com`

Best practice for handoff environments:

- set `SEED_ADMIN_PASSWORD`
- set `SEED_MANAGER_PASSWORD`
- set `SEED_EMPLOYEE_PASSWORD`

That gives every engineer deterministic local credentials without exposing any existing production secrets.

## Prisma / Schema Notes

Source of truth:

- Prisma schema: [backend/prisma/schema.prisma](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/backend/prisma/schema.prisma)
- Seed logic: [backend/prisma/seed.ts](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/backend/prisma/seed.ts)

Common commands:

```bash
cd backend
npm run schema:check
npx prisma db push
npx prisma db seed
npx prisma migrate deploy
```

For local development in a clean engineering repo, `db push` is usually enough to start iterating. Use `migrate` when the team begins managing durable migration history for their own deployment target.

## Build And Test Commands

Backend:

```bash
cd backend
npm run build
npm test
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
npm run test:unit
```

Optional frontend E2E:

```bash
cd frontend
npm run test:e2e
```

## CI/CD

Current workflow file:

- [.github/workflows/release-guards.yml](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/.github/workflows/release-guards.yml)

What it currently does:

- frontend accessibility / release-guard checks
- backend schema drift guard
- optional post-deploy login smoke

Secrets required to fully enable the workflow in a new repo:

- `DATABASE_URL`
- `RELEASE_SMOKE_BASE_URL`
- `RELEASE_SMOKE_EMAIL`
- `RELEASE_SMOKE_PASSWORD`

Important:

- these secrets are not included in this handoff
- the new engineering repo must create its own secrets in GitHub Actions
- the smoke URL should point to the new team’s own backend deployment

## Deployment Guidance For The New Team

The new team should deploy their own environment, not reuse the current production setup.

Minimum deployment checklist:

1. Create a new PostgreSQL database.
2. Set backend env vars in their own host.
3. Run Prisma schema application and seed against that database.
4. Deploy backend.
5. Set frontend `VITE_API_URL` to the new backend’s `/api/v1`.
6. Deploy frontend.
7. Run login and timer smoke checks.

## Current Operational Notes

- The application includes idle timer enforcement and an 8-hour active timer cap.
- On Vercel Hobby, cron jobs cannot run every 5 minutes, so frequent server-only idle scheduling is limited by platform constraints.
- The current source compensates with request-time enforcement and frontend-assisted timer cap enforcement.

If the new team wants stronger server-only enforcement, they should use:

- Vercel Pro, or
- another host/scheduler that supports frequent recurring jobs

## Handoff Goal

The engineering team should be able to:

- clone the repo
- provision their own local Postgres database
- copy `.env.example` values into local `.env` files
- run Prisma bootstrap
- start backend and frontend locally
- run build/lint/test commands
- connect the same repo to their own CI/CD and deployment targets
