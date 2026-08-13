#!/usr/bin/env bash
#
# The gauntlet — one command that decides whether the timer guardrail work is
# shippable.
#
# Every gate here has already caught something real: the migration check catches
# schema drift that would block boot (`schema:check` exits non-zero and refuses to
# start), the cron check catches a Vercel cron expression the Hobby plan will reject
# at deploy time, and the type checks catch the Prisma client going stale after a
# schema edit.
#
# Usage:
#   bash scripts/gauntlet.sh              # everything that can run without a database
#   bash scripts/gauntlet.sh --with-db    # also run the migration replay (needs Docker)
#   bash scripts/gauntlet.sh --with-e2e   # also run Playwright (needs a running stack)
#
# Exit code is non-zero if any gate fails. A summary table is always printed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WITH_DB=0
WITH_E2E=0
for arg in "$@"; do
    case "$arg" in
        --with-db)  WITH_DB=1 ;;
        --with-e2e) WITH_E2E=1 ;;
        *)
            echo "Unknown option: $arg" >&2
            echo "Usage: bash scripts/gauntlet.sh [--with-db] [--with-e2e]" >&2
            exit 2
            ;;
    esac
done

NAMES=()
RESULTS=()
FAILED=0

run_gate() {
    local name="$1"; shift
    local dir="$1"; shift

    printf '\n\033[1m▸ %s\033[0m\n' "$name"

    if (cd "$dir" && "$@"); then
        NAMES+=("$name"); RESULTS+=("PASS")
    else
        NAMES+=("$name"); RESULTS+=("FAIL")
        FAILED=1
    fi
}

# Same as run_gate, but retries once on failure.
#
# Reserved for the backend jest gate. That suite leaks a worker handle ("A worker
# process has failed to exit gracefully"), and when it runs straight after two tsc
# builds the teardown occasionally loses a race and exits non-zero even though every
# test passed — observed as 409/409 green with a non-zero status. A genuinely failing
# test fails both attempts, so this recovers the race without hiding a real break.
#
# Fix the leak and this can go back to plain run_gate.
run_gate_retry() {
    local name="$1"; shift
    local dir="$1"; shift

    printf '\n\033[1m▸ %s\033[0m\n' "$name"

    if (cd "$dir" && "$@"); then
        NAMES+=("$name"); RESULTS+=("PASS")
        return
    fi

    printf '\033[33m   retrying once (known teardown race)…\033[0m\n'
    if (cd "$dir" && "$@"); then
        NAMES+=("$name"); RESULTS+=("PASS")
    else
        NAMES+=("$name"); RESULTS+=("FAIL")
        FAILED=1
    fi
}

skip_gate() {
    NAMES+=("$1"); RESULTS+=("SKIP — $2")
}

# ── Backend ───────────────────────────────────────────────────────────────────
run_gate "backend: typecheck (src + tests)" backend npm run typecheck
run_gate "backend: build"                   backend npm run build
run_gate "backend: cron config"             backend npm run cron:check
# --forceExit: the suite leaves a worker handle open ("A worker process has failed to
# exit gracefully"). That leak pre-dates this work and does not affect any assertion,
# but it intermittently turns a fully-passing run into a non-zero exit — a flaky gate is
# worse than no gate. Fix the leak separately, then drop this flag.
run_gate_retry "backend: jest"              backend npx jest --silent --forceExit

# Replays every migration against a disposable Postgres and asserts zero drift against
# schema.prisma. Opt-in because it needs a database.
#
# Set MIGRATION_TEST_DATABASE_URL to point at an EMPTY throwaway database and Docker is
# not needed at all — useful when Docker Desktop's VM disk is full, which surfaces as
# `initdb: could not create directory .../pg_wal: No space left on device` even though
# the host has plenty free. A local Homebrew Postgres works:
#
#   psql -d postgres -c 'CREATE DATABASE wfx_migration_verify;'
#   MIGRATION_TEST_DATABASE_URL="postgresql://$USER@127.0.0.1:5432/wfx_migration_verify?schema=public" \
#       bash scripts/gauntlet.sh --with-db
if [ "$WITH_DB" -eq 1 ]; then
    if [ -n "${MIGRATION_TEST_DATABASE_URL:-}" ]; then
        run_gate "backend: migration replay" backend npm run verify:migrations
    elif docker info >/dev/null 2>&1; then
        run_gate "backend: migration replay" backend npm run verify:migrations
    else
        skip_gate "backend: migration replay" "no MIGRATION_TEST_DATABASE_URL and Docker is not running"
        FAILED=1
    fi
else
    skip_gate "backend: migration replay" "pass --with-db (needs a database)"
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
run_gate "frontend: lint"     frontend npm run lint
run_gate "frontend: build"    frontend npm run build
run_gate "frontend: vitest"   frontend npm run test:unit

if [ "$WITH_E2E" -eq 1 ]; then
    run_gate "frontend: playwright guards" frontend npm run test:e2e:release-guards
else
    skip_gate "frontend: playwright guards" "pass --with-e2e (needs a running stack)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
printf '\n\033[1m── Gauntlet summary ──────────────────────────────\033[0m\n'
for i in "${!NAMES[@]}"; do
    case "${RESULTS[$i]}" in
        PASS)  printf '  \033[32m✔\033[0m  %s\n' "${NAMES[$i]}" ;;
        FAIL)  printf '  \033[31m✘\033[0m  %s\n' "${NAMES[$i]}" ;;
        *)     printf '  \033[33m–\033[0m  %s  \033[2m(%s)\033[0m\n' "${NAMES[$i]}" "${RESULTS[$i]#SKIP — }" ;;
    esac
done

if [ "$FAILED" -ne 0 ]; then
    printf '\n\033[31mGauntlet failed.\033[0m\n'
    exit 1
fi

printf '\n\033[32mGauntlet passed.\033[0m\n'
