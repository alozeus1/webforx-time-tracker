#!/bin/bash
# Push ALL pending changes to GitHub → Vercel (enhanced idle detection + P0 fixes)
# Run: bash push-p0-fixes.sh
set -e
cd "$(dirname "$0")"
rm -f .git/*.lock

# Stage enhanced idle detection core files (were uncommitted from previous sessions)
git add \
  backend/src/config/env.ts \
  backend/src/workers/idleTracker.ts \
  frontend/src/hooks/useActiveTimerHeartbeat.ts \
  frontend/src/pages/Timer.tsx \
  docs/desktop-agent-proposal.md \
  docs/enhanced-idle-detection-review.md \
  frontend/tests/feature-e2e.spec.ts

git commit -m "feat: enhanced activity-aware idle detection (ActivityWatch-inspired)

backend/src/config/env.ts:
- Add timerEnhancedActivityDetection flag (TIMER_ENHANCED_ACTIVITY_DETECTION)
- Add hiddenConnectedGraceMinutes (HIDDEN_CONNECTED_GRACE_MINUTES, default 10)

backend/src/workers/idleTracker.ts:
- Implement checkIdleTimersEnhanced: distinguishes 4 browser states:
  hidden_connected (background tab + fresh heartbeat → NOT paused),
  idle_candidate, active, visible_inactive
- hidden_connected sessions skip all pause logic; warnings fire after grace
  period or when heartbeats start slipping
- Export checkIdleTimers routes to enhanced or legacy based on env flag

frontend/src/hooks/useActiveTimerHeartbeat.ts:
- In ENHANCED mode: send heartbeats even when tab is hidden (background)
- computeBrowserActivityState() implements all 4 states client-side
- Fire TIMER_IDLE_WARNING_EVENT with inactiveForMs (ms, not minutes)
- Client-side hidden_connected grace window check

frontend/src/pages/Timer.tsx:
- Amber warning banner with countdown replaces legacy modal approach
- 'I'm still here' button fires ping + dismisses banner
- Activity Signal indicator: pulsing emerald (active) or amber (hidden)
- Banner language adapts for hidden_connected vs explicit idle states

docs/desktop-agent-proposal.md:
- Phase 2 Tauri desktop agent architecture proposal
- ActivityWatch watcher integration design, privacy guardrail table

docs/enhanced-idle-detection-review.md:
- Comprehensive 13-domain review: PARTIALLY COMPLETE with 2 P0 bugs
  (fixed in subsequent commit)"

echo "Enhanced idle detection committed — now pushing all commits..."
git push origin main
echo "Pushed. Vercel will auto-deploy both projects — allow ~2 minutes for READY."
