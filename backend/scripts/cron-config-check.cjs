#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', 'vercel.json');
const REQUIRED_IDLE_CRON_PATH = '/api/v1/cron/idle';

const fail = (message) => {
  console.error(`[release-guard] ${message}`);
  process.exit(1);
};

let raw;
try {
  raw = fs.readFileSync(CONFIG_PATH, 'utf8');
} catch (error) {
  fail(`Unable to read ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
}

let config;
try {
  config = JSON.parse(raw);
} catch (error) {
  fail(`Invalid JSON in ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
}

const crons = Array.isArray(config.crons) ? config.crons : [];
const idleCron = crons.find((entry) => entry && entry.path === REQUIRED_IDLE_CRON_PATH);

if (!idleCron) {
  fail(`Missing required idle guardrail cron path '${REQUIRED_IDLE_CRON_PATH}' in backend/vercel.json.`);
}

if (typeof idleCron.schedule !== 'string' || !idleCron.schedule.trim()) {
  fail(`Idle guardrail cron '${REQUIRED_IDLE_CRON_PATH}' must include a non-empty schedule.`);
}

console.log(`[release-guard] Cron check passed: ${REQUIRED_IDLE_CRON_PATH} (${idleCron.schedule}).`);
