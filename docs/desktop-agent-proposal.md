# Desktop Agent Architecture Proposal
## webforx-timer-agent — Phase 2 Activity Detection

**Status:** Design only. Browser-side fix (Phase 1) ships first. Desktop agent is Phase 2.

---

## Why a Desktop Agent

The browser timer heartbeat continues even when the tab is hidden (Phase 1 fix), but the browser has
no OS-level visibility into what the user is actually doing on their computer. A lightweight desktop
companion agent closes this gap by reporting machine-level signals:

- OS idle seconds (no keyboard/mouse activity at the OS level)
- Screen lock state
- Active application name (e.g., "Visual Studio Code", "Terminal", "Chrome")
- Active window title (opt-in, privacy-gated)

This lets the backend make a better-informed decision:

| Browser signal       | Agent signal        | Decision                         |
|----------------------|---------------------|----------------------------------|
| Tab hidden           | OS active           | Keep timer running ✅             |
| Tab hidden           | OS idle > threshold | Mark idle_candidate ⚠️           |
| Tab hidden           | Screen locked       | Pause immediately or after grace |
| Tab hidden           | Agent offline       | Treat as hidden_connected (Phase 1 rules) |
| Tab visible          | OS active           | Active ✅                         |

---

## Reference Architecture (ActivityWatch-inspired)

ActivityWatch uses a "watcher + broker + event bucket" model:

```
[aw-watcher-afk]       ← OS idle/keyboard/mouse
[aw-watcher-window]    ← Active app + window title
[aw-watcher-web-*]     ← Browser extension per browser
        │
        ▼
[aw-server / broker]   ← Aggregates buckets, stores locally
        │
        ▼
[Remote API / sync]    ← Optional cloud sync
```

**Our adaptation** removes the local broker — the agent sends heartbeats directly to the
existing timer backend API (`/api/v1/timers/agent-ping`). This keeps the implementation
simple and avoids running a local server.

---

## Agent Name and Packages

```
webforx-timer-agent/
├── packages/
│   ├── agent-core/       # Cross-platform idle detection + heartbeat sender
│   ├── agent-macos/      # macOS native bridge (IOKit, CGSessionCopyCurrentDictionary)
│   ├── agent-windows/    # Windows native bridge (GetLastInputInfo, WTSQuerySessionInformation)
│   └── agent-linux/      # Linux bridge (XScreenSaver / logind idle)
├── apps/
│   ├── tray-macos/       # SwiftUI / Tauri macOS tray app
│   ├── tray-windows/     # WinUI 3 / Tauri Windows tray app
│   └── tray-linux/       # GTK / Tauri Linux tray app
└── installer/            # Per-platform installers + auto-update
```

Recommended implementation: **Tauri v2** (Rust core, web UI).
- Single codebase for all three platforms
- Native tray support
- Small binary (~8 MB vs Electron's ~120 MB)
- Rust is safe for system API calls

---

## Heartbeat Payload

```json
{
  "userId": "usr_abc123",
  "deviceId": "dev_xyz789",
  "timerSessionId": "timer_current_or_null",
  "timestamp": "2026-06-30T14:22:00.000Z",
  "source": "desktop_agent",
  "agentVersion": "0.1.0",
  "isActive": true,
  "idleSeconds": 12,
  "screenLocked": false,
  "activeApp": "Visual Studio Code",
  "activeWindowTitle": null
}
```

**Privacy rules embedded in payload design:**
- `activeWindowTitle` is `null` unless the user has enabled window title tracking
- No keystrokes, clipboard, file contents, or screenshots are ever captured or sent
- `activeApp` is a category label if `activeAppTrackingEnabled=false` (e.g., `"code_editor"`)

---

## Backend Endpoint: `POST /api/v1/timers/agent-ping`

**Auth:** Bearer JWT (same user token) + device registration check

**Rate limit:** Max 1 request per `heartbeatIntervalSeconds` (enforced server-side)

**Validation (Zod schema):**
```typescript
const AgentPingSchema = z.object({
  deviceId: z.string().uuid(),
  timerSessionId: z.string().uuid().nullable(),
  timestamp: z.string().datetime(),
  source: z.literal('desktop_agent'),
  agentVersion: z.string().max(32),
  isActive: z.boolean(),
  idleSeconds: z.number().int().min(0).max(86400),
  screenLocked: z.boolean(),
  activeApp: z.string().max(128).nullable(),
  activeWindowTitle: z.string().max(256).nullable(),
});
```

**Security checks before accepting:**
1. User auth + org boundary (`requireAuth` middleware)
2. Device registration: `deviceId` must exist in `registered_devices` for this user
3. Timestamp freshness: reject if `|now - timestamp| > 2 * heartbeatInterval`
4. Timer session ownership: if `timerSessionId` supplied, verify it belongs to this user
5. Rate limit: 429 if more frequent than `heartbeatIntervalSeconds`

**Effect:**
- Store agent heartbeat in `activity_heartbeats` table (ring buffer, 24h retention)
- If `screenLocked=true`: immediately pause the active timer (configurable)
- If `idleSeconds > idleThreshold AND !screenLocked`: mark `idle_candidate`
- If `isActive AND timerSession running`: keep session alive, reset idle clock

---

## Database Models (new tables, additive migration)

```prisma
model RegisteredDevice {
  id              String    @id @default(uuid())
  user_id         String
  organization_id String
  name            String    // e.g., "Godwill's MacBook Pro"
  platform        String    // "macos" | "windows" | "linux"
  agent_version   String
  device_key_hash String    // HMAC of device secret — never store raw secret
  is_active       Boolean   @default(true)
  last_seen_at    DateTime?
  registered_at   DateTime  @default(now())

  user User @relation(fields: [user_id], references: [id])

  @@index([user_id, organization_id])
}

model ActivityHeartbeat {
  id                String   @id @default(uuid())
  user_id           String
  organization_id   String
  device_id         String?
  source            String   // "browser" | "desktop_agent"
  timestamp         DateTime
  is_active         Boolean
  idle_seconds      Int?
  screen_locked     Boolean?
  active_app        String?
  active_window_title String?
  browser_activity_state String?
  created_at        DateTime @default(now())

  @@index([user_id, organization_id, timestamp])
  @@index([organization_id, source, timestamp])
}
```

**Retention:** `ActivityHeartbeat` rows older than `retentionDaysForActivityHeartbeats` (default: 1 day)
are deleted by a cron job. No long-term detailed activity history is stored.

---

## Device Registration Flow

```
1. User opens Settings → Activity Agent
2. User clicks "Register this device"
3. Frontend calls POST /api/v1/devices/register with { name, platform }
4. Backend creates RegisteredDevice record, returns { deviceId, deviceSecret (one-time) }
5. Frontend shows a one-time setup code or QR code
6. User enters the code into the installed desktop agent
7. Agent stores deviceId + deviceSecret securely (macOS Keychain / Windows Credential Manager / libsecret)
8. All future agent-ping calls include { deviceId } in payload
9. Backend verifies HMAC(deviceId + timestamp, deviceSecret) per request
```

The `deviceSecret` is shown once and never stored in plaintext on the server — only a hash.

---

## Admin Policy Settings (additions to TimerPolicyConfig)

```typescript
type AgentPolicy = {
  requireDesktopAgent: boolean;          // false — agent is always optional
  allowUserConfirmWorkGap: boolean;      // true — user can mark uncertain gaps as worked
  activeAppTrackingEnabled: boolean;     // true — store app name
  windowTitleTrackingEnabled: boolean;   // false — opt-in per user
  retentionDaysForActivityHeartbeats: number; // 1
  hiddenConnectedGraceMinutes: number;   // 10
  agentIdleThresholdMinutes: number;     // 5
  screenLockedPausesTimer: boolean;      // true
};
```

---

## Privacy Guardrails (Non-Negotiable)

| Signal          | Captured | Notes                                    |
|-----------------|----------|------------------------------------------|
| Keystrokes      | ❌ Never | Hard-blocked in agent code               |
| Screenshots     | ❌ Never | Hard-blocked in agent code               |
| Clipboard       | ❌ Never | Hard-blocked in agent code               |
| File contents   | ❌ Never | Hard-blocked in agent code               |
| Full URLs       | ❌ Default off | Requires explicit admin + user opt-in |
| Window title    | ❌ Default off | Requires explicit admin + user opt-in |
| Active app name | ✅ Default on | Category or full name per policy      |
| OS idle seconds | ✅ Always | Non-sensitive, required for function     |
| Screen locked   | ✅ Always | Non-sensitive, required for function     |

---

## UI Changes (when agent is installed)

```
Session Status card additions:
  ┌────────────────────────────────┐
  │ Activity Signal                │
  │ ● Browser active               │
  │ ● Desktop agent connected      │
  │   Last seen: 30s ago           │
  │   VS Code active               │
  └────────────────────────────────┘
```

When agent reports idle but browser is active:
> "Timer running. Desktop appears idle but browser is active."

When browser is hidden and agent confirms active:
> "Timer running in background. Desktop activity confirmed."

When neither signal confirms activity:
> "We couldn't confirm activity from 2:10 PM – 2:22 PM. Were you still working?"
> [Yes, keep the time] [Edit time] [Discard idle gap]

---

## Rollout Plan

| Phase | Description                              | Status     |
|-------|------------------------------------------|------------|
| 1     | Browser-only fix (hidden tab heartbeat)  | ✅ Shipped  |
| 2a    | Backend agent-ping endpoint + DB models  | Next       |
| 2b    | Tauri agent for macOS                    | After 2a   |
| 2c    | Windows + Linux agent                    | After 2b   |
| 3     | VS Code extension (sends activity pings) | Future     |
| 3     | Browser extension (more precise signals) | Future     |

---

## Rollback

If the desktop agent causes issues:
1. Set `requireDesktopAgent=false` in admin policy (already the default)
2. The timer app continues working with Phase 1 browser-only signals
3. No schema rollback needed — new tables are additive

---

## Security Review Checklist (Phase 2)

- [ ] Device registration uses one-time secret, server stores only hash
- [ ] Agent-ping endpoint verifies device ownership (user_id match)
- [ ] Agent-ping rate-limited server-side
- [ ] Timestamp freshness check on every ping
- [ ] No sensitive data (titles, URLs) stored unless admin + user both opt in
- [ ] Agent binary signed and notarised (macOS Gatekeeper, Windows SmartScreen)
- [ ] Auto-update uses signed manifests (Tauri updater with HTTPS + signature)
- [ ] `ActivityHeartbeat` rows purged after retention window
- [ ] Audit log entry for every automatic pause triggered by agent signal
