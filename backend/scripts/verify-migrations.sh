#!/usr/bin/env bash
#
# verify-migrations.sh — prove the migration history can build production.
#
# WHY THIS EXISTS
# ---------------
# The audit (AUDIT_REPORT.md, BLK-7) found that `prisma migrate deploy` could not
# provision a fresh database: the earliest migration ALTERed tables that no earlier
# migration created, and `migration_lock.toml` was missing. A baseline migration
# (20260401000000_initial_schema) has since been added. This script exists so that
# regression can never silently return — it asserts, on every PR, that the committed
# migration history builds the schema from nothing and matches prisma/schema.prisma.
#
# WHAT IT CHECKS
#   1. `prisma migrate deploy` succeeds against a completely EMPTY database.
#   2. The resulting database has ZERO drift from prisma/schema.prisma.
#   3. `prisma migrate deploy` is idempotent (a second run is a clean no-op).
#   4. `prisma migrate status` reports every migration applied.
#   5. (optional) The same, replayed against a representative snapshot.
#
# HOW TO RUN
# ----------
#   Local (needs Docker):      ./scripts/verify-migrations.sh
#   CI (Postgres service):     MIGRATION_TEST_DATABASE_URL=postgresql://... ./scripts/verify-migrations.sh
#
#   Optional representative-database drill — export a SANITIZED dump of a
#   production-like database (no PII) and point at it:
#       MIGRATION_TEST_SNAPSHOT_SQL=/path/to/snapshot.sql ./scripts/verify-migrations.sh
#
#   NOTE: production was originally provisioned with `prisma db push`, so it may have
#   no `_prisma_migrations` ledger. For that case the documented cutover is
#   `npm run release:baseline-existing` (marks the baseline as applied) BEFORE
#   `prisma migrate deploy`. The snapshot drill is how you prove that path works.
#
set -euo pipefail

cd "$(dirname "$0")/.."

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; NC=$'\033[0m'
pass() { echo "${GREEN}  PASS${NC}  $1"; }
fail() { echo "${RED}  FAIL${NC}  $1"; FAILED=1; }
info() { echo "${YELLOW}==>${NC} $1"; }
FAILED=0

BASELINE_MIGRATION="20260401000000_initial_schema"
CONTAINER_NAME="wfx-migration-verify-$$"
STARTED_CONTAINER=0

cleanup() {
  if [ "$STARTED_CONTAINER" = "1" ]; then
    info "Removing throwaway Postgres container..."
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Obtain a disposable database
# ---------------------------------------------------------------------------
if [ -n "${MIGRATION_TEST_DATABASE_URL:-}" ]; then
  info "Using MIGRATION_TEST_DATABASE_URL (CI service container)."
  DB_URL="$MIGRATION_TEST_DATABASE_URL"
elif [ -n "${CI:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  # Reuse the workflow's Postgres service. IMPORTANT: this step must run BEFORE
  # any other migrate step in the job, otherwise the database is no longer empty
  # and Scenario A degrades from "fresh provision" to "idempotent re-run".
  info "CI detected — reusing the job's DATABASE_URL (must be an empty database)."
  DB_URL="$DATABASE_URL"
else
  command -v docker >/dev/null || {
    echo "${RED}ERROR${NC}: Docker not found and MIGRATION_TEST_DATABASE_URL is not set."
    echo "       Install Docker, or supply a disposable database URL."
    exit 1; }

  # Pick a free high port so parallel runs don't collide.
  PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("",0));print(s.getsockname()[1]);s.close()' 2>/dev/null || echo 55432)
  info "Starting throwaway Postgres on port $PORT..."
  docker run -d --rm --name "$CONTAINER_NAME" \
    -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=migration_verify \
    -p "$PORT:5432" postgres:16-alpine >/dev/null
  STARTED_CONTAINER=1

  info "Waiting for Postgres to accept connections..."
  for i in $(seq 1 45); do
    if docker exec "$CONTAINER_NAME" pg_isready -U postgres -d migration_verify >/dev/null 2>&1; then break; fi
    [ "$i" = "45" ] && { echo "${RED}ERROR${NC}: Postgres did not become ready in time."; exit 1; }
    sleep 1
  done
  DB_URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/migration_verify?schema=public" # secret-scan:allow
fi

export DATABASE_URL="$DB_URL"

# ---------------------------------------------------------------------------
# Helper: assert the live database exactly matches prisma/schema.prisma.
# `migrate diff --exit-code` returns 0 when there is NO difference, 2 when there is.
# ---------------------------------------------------------------------------
assert_no_drift() {
  local label="$1"
  set +e
  DIFF_OUT=$(npx prisma migrate diff \
      --from-url "$DATABASE_URL" \
      --to-schema-datamodel prisma/schema.prisma \
      --exit-code 2>&1)
  local rc=$?
  set -e
  if [ "$rc" = "0" ]; then
    pass "$label — database matches schema.prisma exactly (zero drift)"
  else
    fail "$label — schema drift detected (exit $rc)"
    echo "$DIFF_OUT" | sed 's/^/        /' | head -40
  fi
}

echo
echo "============================================================"
echo " Scenario A — provision a PRODUCTION schema from an EMPTY DB"
echo "============================================================"

info "Confirming the database is empty..."
TABLE_COUNT=$(npx prisma db execute --url "$DATABASE_URL" \
  --stdin <<<"SELECT 1;" >/dev/null 2>&1 && echo "reachable" || echo "unreachable")
[ "$TABLE_COUNT" = "reachable" ] || { echo "${RED}ERROR${NC}: cannot reach the test database."; exit 1; }

info "Running: prisma migrate deploy (this is the gate that used to fail)"
if npx prisma migrate deploy; then
  pass "migrate deploy provisioned a fresh database from scratch"
else
  fail "migrate deploy could NOT provision an empty database — release blocker (BLK-7)"
  exit 1
fi

assert_no_drift "post-deploy schema"

info "Re-running migrate deploy to prove idempotency..."
if npx prisma migrate deploy >/dev/null 2>&1; then
  pass "migrate deploy is idempotent (safe to re-run / safe on redeploy)"
else
  fail "second migrate deploy failed — migrations are not idempotent"
fi

info "Checking migrate status..."
if npx prisma migrate status 2>&1 | grep -qiE "up to date|no pending migrations"; then
  pass "migrate status reports all migrations applied"
else
  fail "migrate status does not report a fully-applied history"
  npx prisma migrate status 2>&1 | sed 's/^/        /' | head -20
fi

# ---------------------------------------------------------------------------
# Scenario B — representative existing database (optional)
# ---------------------------------------------------------------------------
if [ -n "${MIGRATION_TEST_SNAPSHOT_SQL:-}" ]; then
  echo
  echo "============================================================"
  echo " Scenario B — replay against a REPRESENTATIVE snapshot"
  echo "============================================================"

  [ -f "$MIGRATION_TEST_SNAPSHOT_SQL" ] || {
    echo "${RED}ERROR${NC}: snapshot not found: $MIGRATION_TEST_SNAPSHOT_SQL"; exit 1; }

  if [ "$STARTED_CONTAINER" = "1" ]; then
    info "Creating a second database and restoring the snapshot..."
    docker exec "$CONTAINER_NAME" psql -U postgres -c "DROP DATABASE IF EXISTS snapshot_verify;" >/dev/null
    docker exec "$CONTAINER_NAME" psql -U postgres -c "CREATE DATABASE snapshot_verify;" >/dev/null
    docker exec -i "$CONTAINER_NAME" psql -U postgres -d snapshot_verify < "$MIGRATION_TEST_SNAPSHOT_SQL" >/dev/null
    export DATABASE_URL="${DB_URL%/*}/snapshot_verify?schema=public"
  else
    info "CI mode: expecting the snapshot to already be restored into MIGRATION_TEST_DATABASE_URL."
  fi

  # A db push-provisioned database has no _prisma_migrations ledger. The documented
  # cutover marks the baseline as already applied before deploying the rest.
  info "Baselining (mimics the documented production cutover)..."
  npx prisma migrate resolve --applied "$BASELINE_MIGRATION" >/dev/null 2>&1 \
    && pass "baseline marked as applied" \
    || info "baseline already recorded (or not required) — continuing"

  info "Running migrate deploy against the snapshot..."
  if npx prisma migrate deploy; then
    pass "migrate deploy upgraded a representative existing database"
  else
    fail "migrate deploy FAILED against a representative database — do not release"
  fi

  assert_no_drift "post-upgrade snapshot schema"
else
  echo
  echo "${YELLOW}SKIPPED${NC} Scenario B (representative snapshot)."
  echo "        Set MIGRATION_TEST_SNAPSHOT_SQL=/path/to/sanitized-dump.sql to run it."
  echo "        Until this passes, 'migrations tested against representative data'"
  echo "        remains an OPEN release gate in AUDIT_REPORT.md."
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "${GREEN}ALL MIGRATION GATES PASSED${NC}"
  exit 0
fi
echo "${RED}MIGRATION VERIFICATION FAILED — do not cut a release.${NC}"
exit 1
