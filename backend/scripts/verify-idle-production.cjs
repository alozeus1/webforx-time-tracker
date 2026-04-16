#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
dotenv.config();

const baseUrl = (process.env.IDLE_VERIFY_BASE_URL || process.env.BACKEND_URL || 'https://vercel-backend-xi-three.vercel.app').replace(/\/+$/, '');
const cronSecret = process.env.CRON_SECRET;

if (!cronSecret) {
  console.error('Missing CRON_SECRET in environment (.env.production or process env).');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment (.env.production or process env).');
  process.exit(1);
}

const prisma = new PrismaClient();

const ms = {
  minute: 60_000,
  hour: 3_600_000,
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const thresholds = {
  heartbeatStaleMinutes: parsePositiveInt(process.env.HEARTBEAT_STALE_MINUTES, 8),
  autoStopGraceMinutes: parsePositiveInt(process.env.AUTO_STOP_GRACE_MINUTES, 2),
  longRunningHours: parsePositiveInt(process.env.IDLE_VERIFY_LONG_RUNNING_HOURS, 8),
  longEntriesWindowHours: parsePositiveInt(process.env.IDLE_VERIFY_LONG_ENTRIES_WINDOW_HOURS, 48),
};

const autoStopThresholdMs = (thresholds.heartbeatStaleMinutes + thresholds.autoStopGraceMinutes) * ms.minute;

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = { raw: await response.text().catch(() => '') };
  }
  return { status: response.status, ok: response.ok, body };
};

const run = async () => {
  const now = Date.now();

  const health = await fetchJson(`${baseUrl}/api/v1/health`, { method: 'GET' });
  const idleCron = await fetchJson(`${baseUrl}/api/v1/cron/idle`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cronSecret}` },
  });

  const activeTimers = await prisma.activeTimer.findMany({
    select: {
      id: true,
      user_id: true,
      task_description: true,
      start_time: true,
      is_paused: true,
      paused_at: true,
      last_heartbeat_at: true,
      last_client_activity_at: true,
      client_visibility: true,
      client_has_focus: true,
    },
  });

  const longRunningActive = activeTimers.filter((timer) =>
    !timer.is_paused && (now - new Date(timer.start_time).getTime()) >= thresholds.longRunningHours * ms.hour
  );

  const staleUnattendedActive = activeTimers.filter((timer) => {
    if (timer.is_paused) return false;
    const lastActivityMs = timer.last_client_activity_at ? new Date(timer.last_client_activity_at).getTime() : null;
    const lastHeartbeatMs = timer.last_heartbeat_at ? new Date(timer.last_heartbeat_at).getTime() : null;
    const activityAge = lastActivityMs ? now - lastActivityMs : Number.POSITIVE_INFINITY;
    const heartbeatAge = lastHeartbeatMs ? now - lastHeartbeatMs : Number.POSITIVE_INFINITY;
    return activityAge >= autoStopThresholdMs || heartbeatAge >= autoStopThresholdMs;
  });

  const longTimerEntries = await prisma.timeEntry.findMany({
    where: {
      entry_type: 'timer',
      duration: { gte: thresholds.longRunningHours * 3600 },
      start_time: { gte: new Date(now - thresholds.longEntriesWindowHours * ms.hour) },
    },
    select: {
      id: true,
      user_id: true,
      task_description: true,
      start_time: true,
      end_time: true,
      duration: true,
      auto_stopped: true,
      stop_reason: true,
    },
    orderBy: { start_time: 'desc' },
    take: 50,
  });

  const report = {
    checked_at: new Date(now).toISOString(),
    base_url: baseUrl,
    thresholds: {
      auto_stop_threshold_minutes: autoStopThresholdMs / ms.minute,
      long_running_hours: thresholds.longRunningHours,
      long_entries_window_hours: thresholds.longEntriesWindowHours,
    },
    http_checks: {
      health,
      idle_cron: idleCron,
    },
    active_timer_totals: {
      total: activeTimers.length,
      long_running_active_count: longRunningActive.length,
      stale_unattended_active_count: staleUnattendedActive.length,
    },
    long_running_active: longRunningActive,
    stale_unattended_active: staleUnattendedActive,
    long_timer_entries_last_window_count: longTimerEntries.length,
    long_timer_entries_last_window: longTimerEntries,
  };

  console.log(JSON.stringify(report, null, 2));

  const hasHttpFailure = !health.ok || !idleCron.ok;
  const hasActiveTimerAnomaly = longRunningActive.length > 0 || staleUnattendedActive.length > 0;
  process.exit(hasHttpFailure || hasActiveTimerAnomaly ? 2 : 0);
};

run()
  .catch((error) => {
    console.error('verify-idle-production failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
