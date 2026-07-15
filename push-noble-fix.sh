#!/bin/bash
# One-time helper: clear stale git locks and push the @noble/hashes ESM fix
# Run: bash push-noble-fix.sh
set -e
cd "$(dirname "$0")"
rm -f .git/*.lock
git add backend/package.json backend/package-lock.json
git commit -m "fix: pin @noble/hashes to 1.8.0 to resolve second ERR_REQUIRE_ESM crash

@otplib/plugin-crypto-noble@13.4.1 declares '@noble/hashes': '^2.2.0' which
resolved to 2.2.0 (pure ESM) nested under its own node_modules. Removed the
nested 2.2.0 lockfile entry so npm uses top-level @noble/hashes@1.8.0 (CJS).
Also added npm overrides for @scure/base and @noble/hashes as belt-and-
suspenders to prevent future installs from re-introducing ESM versions."
git push origin main
echo "Pushed. Vercel will auto-deploy — backend should be healthy in ~90 seconds."
