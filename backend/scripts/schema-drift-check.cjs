#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');
const envFiles = ['.env', '.env.local'];

for (const fileName of envFiles) {
  const envPath = path.join(projectRoot, fileName);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[release-guard] DATABASE_URL is required for schema drift checks.');
  process.exit(1);
}

const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  'prisma',
  'migrate',
  'diff',
  '--from-url',
  databaseUrl,
  '--to-schema-datamodel',
  'prisma/schema.prisma',
  '--exit-code',
];

const result = spawnSync(npxBin, args, {
  cwd: projectRoot,
  stdio: 'pipe',
  env: process.env,
  encoding: 'utf8',
});

if (result.error) {
  console.error('[release-guard] Failed to execute Prisma schema drift check.');
  console.error(result.error.message);
  process.exit(1);
}

if (result.status === 0) {
  console.log('[release-guard] Schema check passed: database schema matches prisma/schema.prisma.');
  process.exit(0);
}

if (result.status === 2) {
  console.error('[release-guard] Schema drift detected. Deployment/startup is blocked until schema is aligned.');
  if (result.stdout?.trim()) {
    console.error(result.stdout.trim());
  }
  if (result.stderr?.trim()) {
    console.error(result.stderr.trim());
  }
  process.exit(1);
}

console.error('[release-guard] Prisma schema check failed with an unexpected error.');
if (result.stdout?.trim()) {
  console.error(result.stdout.trim());
}
if (result.stderr?.trim()) {
  console.error(result.stderr.trim());
}
process.exit(1);
