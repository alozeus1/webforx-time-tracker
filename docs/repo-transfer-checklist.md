# Repository Transfer Checklist

Last reviewed: 2026-04-23

Use this before pushing Web Forx Time Tracker to a new repository for additional feature work.

## Current Source

- Local path: `/Users/ocheme/Desktop/WebForx/Projects/time-tracker`
- Current remote: `https://github.com/alozeus1/webforx-time-tracker`
- Current branch reviewed: `main`
- Current production docs: [AGENT_HANDBOOK.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/AGENT_HANDBOOK.md), [DEPLOYMENT.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/DEPLOYMENT.md)
- Vault source of truth: `/Users/ocheme/Desktop/webforx-brain`

## Do Not Commit

- `.env`, `.env.*`, `backend/.env.production`, or any environment file with real values
- `.vercel/` project linkage
- `.superpowers/` scratch/output state
- `node_modules/`
- Playwright reports and test output
- Generated Remotion output under `video/out/`
- Marketing assets, PDFs, screenshots, and generated launch packages unless the new repo is intentionally private and assets are needed

## Current Worktree Items To Triage

- `backend/dist/*` has tracked generated changes. Decide whether to keep or untrack generated backend output.
- `AGENT_CONTEXT.md`, `docs/demo-user.md`, `docs/releases/`, `frontend/public/screenshots/`, and `marketing-assets/` are untracked and need explicit include/exclude decisions.
- `backend/.env.production` is untracked and must remain uncommitted.

## Repo Visibility Decision

Choose one before creating the new remote:

- Private internal repo: internal names, demo credentials docs, screenshots, and launch assets may be acceptable if intentionally included.
- Public or partner-visible repo: remove demo credentials, internal emails, private project names where required, generated marketing PDFs, Vercel linkage, and all env files.

## Generated File Decision

`backend/dist` is currently tracked. Before transfer, decide one:

- Keep tracked: commit `dist` only when source and built output are intentionally synchronized.
- Stop tracking: add/keep ignore rules, remove `backend/dist` from the index with `git rm --cached -r backend/dist`, and rely on build scripts/deployment to compile from source.

Do not remove generated files from disk unless explicitly cleaning local output.

## Documentation Tasks

- [x] Refresh [docs/current-status.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/current-status.md)
- [x] Refresh [docs/app-route.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/docs/app-route.md)
- [x] Add this transfer checklist
- [ ] Decide whether `docs/demo-user.md` belongs in the new repo
- [ ] If deployment topology changes, update [AGENT_HANDBOOK.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/AGENT_HANDBOOK.md) and [DEPLOYMENT.md](/Users/ocheme/Desktop/WebForx/Projects/time-tracker/DEPLOYMENT.md)

## Pre-Push Checks

Run from the repo root:

```bash
git status --short --untracked-files=all
git diff --stat
```

Run verification:

```bash
cd backend && npm run build && npm test
cd ../frontend && npm run build && npm run lint && npm run test:unit
```

Recommended if dependencies and browser setup are healthy:

```bash
cd frontend && npm run test:e2e
```

## New Remote Options

Preserve history:

```bash
git remote add new-origin <new-repo-url>
git push new-origin main:main
```

Clean first commit:

```bash
cp -R /Users/ocheme/Desktop/WebForx/Projects/time-tracker /tmp/time-tracker-transfer
cd /tmp/time-tracker-transfer
rm -rf .git
git init
git add .
git commit -m "chore: initialize time tracker repo"
git remote add origin <new-repo-url>
git push -u origin main
```

## Feature Branch Convention

After the transfer, use focused branches:

```bash
git switch -c feat/<feature-name>
```

Recommended first feature-prep branch:

```bash
git switch -c chore/repo-transfer-prep
```

## Final Gate

- [ ] No secrets are staged
- [ ] New repo visibility decision is documented
- [ ] `backend/dist` decision is documented
- [ ] `git status` contains only intentional files
- [ ] Build/test checks pass or known failures are documented
- [ ] New remote is confirmed before any push
