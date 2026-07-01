# Enhanced Activity-Aware Timer — Completion Review Report

**Reviewer:** Senior Full-Stack / QA / Security Review  
**Date:** 2026-06-30  
**Reference:** ActivityWatch (https://github.com/activitywatch/activitywatch)  
**Production URL:** https://timer.dev.webforxtech.com  

---

## 1. Executive Summary

**Status: PARTIALLY COMPLETE**

The enhanced activity-aware timer **is architecturally correct and safe to keep deployed behind the feature flag**. The primary goal — stopping the timer app from treating browser tab inactivity as user idleness when the user is working elsewhere — has been correctly implemented in the `idleTracker.ts` worker and `useActiveTimerHeartbeat.ts` hook.

However, there are **two production-grade bugs** that must be fixed before this can be signed off as complete:

1. `enforceTimerGuardrails()` in `timeEntryController.ts` ignores `TIMER_ENHANCED_ACTIVITY_DETECTION` — a `hidden_connected` timer can still be paused inline at ping time, defeating the feature's purpose.
2. `Layout.tsx`'s idle warning dialog always displays "No activity detected for **0** minute(s)" due to a property name mismatch (`inactiveForMs` fired, `inactiveForMinutes` consumed).

Additionally, the test suite has **8 broken tests** (mock/arity mismatches) and **4 required scenarios have no tests at all**.

The backend is currently **returning 500 on every endpoint** due to a second `ERR_REQUIRE_ESM` crash (`@noble/hashes@2.2.0`). A fix is staged in the working tree. **Run `bash push-noble-fix.sh` to commit and push it immediately.**

---

## 2. What Was Verified

**Files reviewed:**

| File | Purpose |
|---|---|
| `backend/src/config/env.ts` | Feature flag + grace window config |
| `backend/src/controllers/timeEntryController.ts` | pingTimer, startTimer, stopTimer, enforceTimerGuardrails |
| `backend/src/workers/idleTracker.ts` | Enhanced + legacy idle decision logic |
| `backend/src/services/activeTimerService.ts` | pauseActiveTimer, stopActiveTimerWithReason |
| `backend/src/services/timerPolicyService.ts` | getGlobalTimerPolicy |
| `backend/package.json` | npm overrides for ESM-only packages |
| `backend/prisma/schema.prisma` | ActiveTimer heartbeat fields |
| `backend/prisma/migrations/` | Migration history |
| `backend/tests/idleTracker.test.ts` | Test coverage |
| `backend/tests/activeTimerService.test.ts` | Test coverage |
| `backend/tests/timeEntry.test.ts` | Test coverage |
| `frontend/src/hooks/useActiveTimerHeartbeat.ts` | Browser-side heartbeat + state machine |
| `frontend/src/pages/Timer.tsx` | Idle warning banner + activity signal indicator |
| `frontend/src/components/Layout.tsx` | Global idle warning modal |
| `frontend/.env.example` | Frontend env var documentation |
| `docs/desktop-agent-proposal.md` | ActivityWatch-inspired Phase 2 architecture |
| `DEPLOYMENT.md` | Deployment documentation |
| `AGENT_HANDBOOK.md` | Ops handbook |
| Vercel runtime logs (via MCP) | Live deployment error diagnosis |

---

## 3. What Works Now

### ✅ Feature flag correctly gates behavior on both sides

**Backend (`env.ts` line 82):**
```ts
timerEnhancedActivityDetection: process.env.TIMER_ENHANCED_ACTIVITY_DETECTION?.trim().toLowerCase() === 'true',
```
Defaults `false`. The `idleTracker.ts` exports `checkIdleTimers` as a module-load-time ternary — legacy path is completely preserved when the flag is off.

**Frontend (`useActiveTimerHeartbeat.ts` line 20):**
```ts
const ENHANCED = import.meta.env.VITE_TIMER_ENHANCED_ACTIVITY_DETECTION === 'true';
```
Three separate early-return guards in `sendHeartbeat`, `idleCheckInterval`, and `refreshInterval` ensure the legacy behavior is byte-for-byte unchanged when `ENHANCED=false`.

### ✅ Heartbeat continues when tab is hidden (the core fix)

In ENHANCED mode, `sendHeartbeat()` removes the `!isDocumentVisible()` early return. The `setInterval` at line 326 fires unconditionally. Hidden tabs send heartbeats at the configured interval with `browser_activity_state: 'hidden_connected'` in the payload.

### ✅ Backend `idleTracker` correctly honors `hidden_connected`

`checkIdleTimersEnhanced` (lines 116–130): when `browserActivityState === 'hidden_connected'` AND `missedHeartbeats < missedHeartbeatPauseThreshold`, the function calls `continue` without ever calling `pauseActiveTimer`. The timer only pauses when heartbeats *actually stop arriving*, regardless of tab visibility.

### ✅ All four browser activity states are implemented

`computeBrowserActivityState()` in the hook implements `active`, `visible_inactive`, `hidden_connected`, `idle_candidate` correctly using Page Visibility API + `document.hasFocus()` + `Date.now() - lastActivityAtRef.current`.

### ✅ Timer.tsx UI is correct

- Amber warning banner with countdown (`Timer will pause in Xm Ys unless activity is detected`)
- `hidden_connected`-specific language ("Timer running in background — activity unconfirmed in this tab")
- "I'm still here" button dispatches `wfx:timer-force-heartbeat` which forces a heartbeat + resets idle state
- Activity Signal indicator shows `Browser active` (pulsing emerald) or `Activity unconfirmed` / `Tab in background` (amber) with correct states

### ✅ Privacy is clean

No keylogging, screenshots, clipboard reading, file scanning, webcam, or mic capture anywhere in the codebase. The `workSignals` feature stores app-internal route names only in `localStorage` — nothing sent to the backend.

### ✅ Database schema has all required fields

`ActiveTimer` has: `last_heartbeat_at`, `last_client_activity_at`, `client_visibility`, `client_has_focus`, `heartbeat_state`, `heartbeat_miss_count`. Two migrations confirm these were added properly.

### ✅ ActivityWatch architecture is correctly referenced

`docs/desktop-agent-proposal.md` maps ActivityWatch's watcher/heartbeat/AFK/event-model concepts to the implementation. The adaptation removes the local broker (agent sends directly to API), is marked optional, and has an explicit privacy guardrails table (keystrokes/screenshots/clipboard = Never).

### ✅ Rollback is safe

Setting `TIMER_ENHANCED_ACTIVITY_DETECTION=false` (or removing it) reverts to the legacy idle path without any code change or migration. No schema changes need to be rolled back for the enhanced mode.

---

## 4. What Remains Incomplete or Risky

### 🔴 CRITICAL — `enforceTimerGuardrails` ignores the enhanced flag

**Location:** `backend/src/controllers/timeEntryController.ts`, `enforceTimerGuardrails()` function  
**Impact:** A timer in `hidden_connected` state will have `visibilityState: 'hidden'` and `hasFocus: false` in its heartbeat payload. The guardrails function sets `browserExplicitlyInactive = true` and can pause the timer after `idleWarningAfterMinutes` of client inactivity — *even when `TIMER_ENHANCED_ACTIVITY_DETECTION=true`*. This directly contradicts the `idleTracker` enhanced path.

**Fix:** Add an early return in `enforceTimerGuardrails` when `env.timerEnhancedActivityDetection && browserActivityState === 'hidden_connected'`.

### 🔴 CRITICAL — `Layout.tsx` idle dialog always shows "0 minutes"

**Location:** `frontend/src/components/Layout.tsx`, `handleIdleWarning` handler  
**Root cause:** The hook fires `TIMER_IDLE_WARNING_EVENT` with `detail: { inactiveForMs }` (milliseconds). The Layout handler reads `detail?.inactiveForMinutes` — a property that doesn't exist. The dialog always displays "No activity detected for **0** minute(s)."  

**Fix:** Change the Layout handler to read `detail?.inactiveForMs` and convert: `Math.round((detail?.inactiveForMs ?? 0) / 60_000)`.

### 🟠 HIGH — Duplicate idle warnings on `/timer` route

**Location:** Both `Timer.tsx` (inline amber banner) and `Layout.tsx` (modal overlay) fire on `TIMER_IDLE_WARNING_EVENT`.  
**Impact:** On the timer page, the user sees a blocking modal AND an inline banner simultaneously. The modal blocks interaction with the banner's "I'm still here" button.  

**Fix:** In `Layout.tsx`, suppress the idle warning modal when `location.pathname === '/timer'` (or check `isRunning` context and let Timer.tsx own the warning on that route).

### 🟠 HIGH — 8 broken tests

**`activeTimerService.test.ts` (5 tests):** Mock defines `activeTimer.findUnique` but implementation uses `activeTimer.findFirst`. All 5 tests fail with `TypeError`.

**`idleTracker.test.ts` (3 tests):** Tests assert `pauseActiveTimer('user-1', reason)` (2-arg) but implementation calls `pauseActiveTimer(userId, organizationId, reason)` (3-arg). Tests cannot pass.

### 🟠 HIGH — No tests for the enhanced idle decision paths

Missing tests:
- Feature flag `true` → enhanced path selected
- Feature flag `false` → legacy path selected  
- `hidden_connected` with fresh heartbeat → no pause
- `idle_candidate` with stale activity → pause triggered
- Invalid `browser_activity_state` value → silently nulled, not stored

### 🟡 MEDIUM — No dedicated rate limiter on `/ping`

The heartbeat ping endpoint shares the global 300 req/15-min IP limiter. Expected legitimate rate is ~5 pings/15 min per user. A buggy client or attacker can fire 300 pings before cutoff with full DB impact per request.

**Fix:** Add `rateLimit({ windowMs: 15 * 60 * 1000, max: 60 })` as per-route middleware on the ping endpoint.

### 🟡 MEDIUM — `getGlobalTimerPolicy()` called twice per ping, no cache

Two DB round-trips occur on every ping (once in `pingTimer` setup, once in `enforceTimerGuardrails`). No Redis cache wraps the policy read despite Redis being configured in the project.

### 🟡 MEDIUM — `TIMER_ENHANCED_ACTIVITY_DETECTION` not documented in deployment docs

Neither `DEPLOYMENT.md` nor `AGENT_HANDBOOK.md` mentions the four new env vars:
- `TIMER_ENHANCED_ACTIVITY_DETECTION` (backend)
- `HIDDEN_CONNECTED_GRACE_MINUTES` (backend)
- `VITE_TIMER_ENHANCED_ACTIVITY_DETECTION` (frontend)
- `VITE_HIDDEN_CONNECTED_GRACE_MINUTES` (frontend)

`frontend/.env.example` is also missing these two entries.

### 🟡 MEDIUM — No `AuditLog` retention for `timer_heartbeat_received` rows

The `auditLog.create` call in `pingTimer` fires on every heartbeat (~every 3 min per active user). There is no cron job or TTL policy purging old audit log rows. This will accumulate silently at scale.

### 🟢 LOW — `wfx:timer-force-heartbeat` is a magic string, not a named export

Timer.tsx dispatches the event as a raw string literal. The hook listens with the same literal. No exported constant exists for the event name. Rename risk if either side is modified independently.

### 🟢 LOW — No `visible_inactive` intermediate state shown in Activity Signal indicator

The indicator jumps from pulsing green ("Browser active") to amber ("Activity unconfirmed") with no intermediate state for `visible_inactive` (tab visible, no recent input). Users cannot see when they've been slightly idle but not yet at the warning threshold.

---

## 5. Security and Privacy Findings

| Signal | Collected? | Notes |
|---|---|---|
| Keystrokes | ❌ No | Activity events are fired/counted, keystrokes not captured |
| Screenshots | ❌ No | Marketing page images only |
| Clipboard | ❌ No | Write-only (user-initiated copy-link buttons) |
| File contents | ❌ No | Not referenced |
| Window titles | ❌ Default off | App-internal route titles only, privacy-gated, localStorage only |
| Raw URLs | ❌ No | Not sent to backend |
| Full browsing history | ❌ No | Not referenced |
| Webcam / mic | ❌ No | Not referenced |
| Active app name | ❌ Not yet | Planned for Phase 2 desktop agent with opt-in |
| OS idle seconds | ❌ Not yet | Planned for Phase 2 desktop agent |

**Cross-user timer tampering:** Not possible. All DB lookups in `pingTimer` scope to `{ user_id, organization_id }` derived from the JWT — no caller-supplied IDs are trusted.

**Tenant isolation:** Enforced at every layer. `pauseActiveTimer` and `stopActiveTimerWithReason` accept `organizationId` from the DB row, never from the request body.

**One gap:** The `/ping` endpoint's global rate limit (300/15 min per IP) is too loose for a heartbeat endpoint. A dedicated tighter limit is needed.

---

## 6. Test Results

```
Backend test run: cd backend && npx jest --testPathPattern=idle|timer|heartbeat

idleTracker.test.ts:
  ✅ PASS  should pause timer after multiple missed heartbeats
  ✅ PASS  should stop timer if active too long
  ✅ PASS  should stop paused timer after max pause duration
  ✅ PASS  should update heartbeat_miss_count
  ✅ PASS  should not pause recently active timers
  ✅ PASS  should handle timer with no last heartbeat
  ❌ FAIL  should pause on browser_inactive (arity mismatch: called with 2 args, expected 3)
  ❌ FAIL  should pause on idle_timeout (arity mismatch)
  ❌ FAIL  should pause on missed_heartbeat_threshold (arity mismatch)

activeTimerService.test.ts:
  ❌ FAIL  5/5 tests — findUnique mocked, findFirst used in implementation

timeEntry.test.ts (heartbeat/staleness):
  ✅ PASS  rejects stale last_activity_at (> 2× heartbeat interval)
  ✅ PASS  rejects future last_activity_at (clock skew)
```

**Test coverage gaps for the enhanced idle feature:**
- Feature flag behavioral branching: No tests
- `hidden_connected` → no pause: No tests
- `idle_candidate` → pause: No tests
- Invalid `browser_activity_state` → nulled: No tests
- Cross-user ping blocked: No explicit test (structurally enforced)

---

## 7. Manual Verification Results

**Status: BLOCKED** — Backend is returning 500 (`FUNCTION_INVOCATION_FAILED`) on every endpoint due to `@otplib/plugin-crypto-noble` CJS-requiring `@noble/hashes@2.2.0` (ESM-only).

The fix is staged in the working tree (`backend/package.json` overrides + patched `package-lock.json`). The git push is blocked by stale lock files in `.git/`. 

**To unblock:** Run `bash push-noble-fix.sh` from the project root. This clears the stale git locks, commits, and pushes. Vercel will auto-deploy in ~90 seconds.

Once the backend is live, the following manual flows should be tested:

| Flow | Expected |
|---|---|
| Start timer, interact normally | Timer continues, Activity Signal shows "Browser active" |
| Start timer, switch to VS Code for 5 min | Timer does NOT pause; no idle warning should appear within HIDDEN_CONNECTED_GRACE_MINUTES |
| Start timer, hide tab for 2 min | Timer continues, Activity Signal shows "Timer running in background" |
| Start timer, go completely idle (no input) for >IDLE_WARNING_MINUTES | Amber warning banner appears with countdown |
| Click "I'm still here" on banner | Banner clears, heartbeat fires, timer continues |
| Start timer, hide tab + go idle for >IDLE_WARNING_MINUTES | idle_candidate detected, server eventually pauses |
| Start timer, close browser | Backend uses last heartbeat + missedHeartbeatPauseThreshold to pause gracefully |

---

## 8. ActivityWatch Framework Alignment

| AW Concept | Our Implementation | Alignment |
|---|---|---|
| **Watcher (aw-watcher-afk)** | `useActiveTimerHeartbeat.ts` — detects in-tab activity via pointer/key/scroll events | ✅ Direct analog |
| **Watcher (aw-watcher-window)** | Not implemented (Phase 2 desktop agent) | ⏳ Proposed, not built |
| **Heartbeat event model** | `POST /api/v1/timers/ping` with structured payload including `browser_activity_state` | ✅ Direct analog |
| **AFK state** | `idle_candidate` / `confirmed_idle` in policy; `hidden_connected` grace window mirrors AW's AFK tolerance | ✅ Well-aligned |
| **Local-first activity awareness** | Phase 1: browser-only. Phase 2: desktop agent sends to API directly (no local broker) | ✅ Deliberately simplified |
| **Privacy-aware collection** | Heartbeat contains activity presence, not content. No keystrokes, URLs, window titles by default | ✅ Aligned with AW's privacy goals |
| **Extensible watcher architecture** | Desktop agent proposal supports macOS/Windows/Linux via Tauri + per-platform native idle APIs | ✅ Ready for Phase 2 |

**What was correctly NOT copied from ActivityWatch:**
- No local `aw-server` broker (adds complexity, our backend API is the broker)
- No SQLite event-bucket storage (our DB handles state)
- No ActivityWatch UI/dashboard (separate product concerns)
- No large ActivityWatch dependencies added to the project

---

## 9. Deployment Recommendation

**Ready for staging only.**

Rationale:
1. The `enforceTimerGuardrails` bug can cause timer pauses in enhanced mode, undermining the feature's core promise. This must be fixed before production sign-off.
2. The backend is currently returning 500 (ESM crash). Push `push-noble-fix.sh` first.
3. The Layout.tsx "0 minutes" dialog bug is user-facing.
4. The duplicate idle warning modal is a UX defect.

The feature flag itself (`TIMER_ENHANCED_ACTIVITY_DETECTION=true`) is safe to keep set on Vercel — once the guardrails bug is fixed, the system will behave correctly.

---

## 10. Required Fixes Before Approval

### P0 — Must fix before sign-off

1. **Fix `enforceTimerGuardrails` to skip pause for `hidden_connected` in enhanced mode**
   ```ts
   // In enforceTimerGuardrails(), after parsing browserActivityState:
   if (env.timerEnhancedActivityDetection && browserActivityState === 'hidden_connected') {
     return; // Backend idleTracker owns this — no inline pause
   }
   ```

2. **Push the `@noble/hashes` ESM fix to unblock the backend**
   Run `bash push-noble-fix.sh` from the project root.

3. **Fix Layout.tsx idle dialog: `inactiveForMs` not `inactiveForMinutes`**
   ```ts
   const minutes = Math.round((detail?.inactiveForMs ?? 0) / 60_000);
   ```

4. **Fix duplicate idle warning: suppress Layout.tsx modal on `/timer` route**
   ```ts
   // In Layout.tsx handleIdleWarning:
   if (location.pathname === '/timer') return; // Timer.tsx owns warning on this route
   ```

### P1 — Fix before next sprint

5. **Fix 8 broken tests** (findUnique→findFirst mock; 3-arg arity in idleTracker tests)

6. **Add tests for enhanced idle paths** (feature flag branching, `hidden_connected` no-pause, `idle_candidate` pause, invalid state nulled)

7. **Document 4 new env vars in `DEPLOYMENT.md`, `AGENT_HANDBOOK.md`, and `frontend/.env.example`**

### P2 — Backlog

8. Add dedicated rate limiter on `/ping` endpoint (60 req/15 min per IP)
9. Cache `getGlobalTimerPolicy()` with 60s TTL
10. Add `AuditLog` retention policy for `timer_heartbeat_received` rows
11. Export `TIMER_FORCE_HEARTBEAT_EVENT` constant from the hook (remove magic string)
12. Add intermediate `visible_inactive` state to Activity Signal indicator

---

## 11. Recommended Next Phase

Once P0 and P1 items are resolved and manual tests pass:

**Phase 2a — Backend desktop agent endpoint**
Implement `POST /api/v1/timers/agent-ping` as specified in `docs/desktop-agent-proposal.md`. Add `RegisteredDevice` and `ActivityHeartbeat` Prisma models with migrations. This is purely additive and does not change any existing behavior.

**Phase 2b — macOS Tauri agent (prototype)**
Minimal tray app that reports `idleSeconds`, `isActive`, and `screenLocked` to the backend. No window title or app-name tracking in the first release. Rate-limited to one ping per `heartbeatIntervalSeconds`.

**Phase 3 — VS Code extension**
Sends activity pings when the user is typing in VS Code. This is the most impactful "working elsewhere" signal for developers and is far simpler than a full OS-level agent.

**Phase 3 — Better admin controls**
Per-org `hiddenConnectedGraceMinutes`, `agentIdleThresholdMinutes`, and `screenLockedPausesTimer` settings surfaced in the Admin panel.

---

*This report was generated from live code review, automated agent analysis, and Vercel runtime log inspection on 2026-06-30. The timer app's enhanced idle detection is architecturally sound; the remaining issues are fixable and well-scoped.*
