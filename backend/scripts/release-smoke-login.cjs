#!/usr/bin/env node

const resolveApiBase = (rawBaseUrl) => {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/api/v1')) {
    return trimmed;
  }
  return `${trimmed}/api/v1`;
};

const fail = (message) => {
  console.error(`[release-smoke] ${message}`);
  process.exit(1);
};

const baseUrl = process.env.RELEASE_SMOKE_BASE_URL;
const email = process.env.RELEASE_SMOKE_EMAIL;
const password = process.env.RELEASE_SMOKE_PASSWORD;

if (!baseUrl) {
  fail('Missing RELEASE_SMOKE_BASE_URL.');
}
if (!email) {
  fail('Missing RELEASE_SMOKE_EMAIL.');
}
if (!password) {
  fail('Missing RELEASE_SMOKE_PASSWORD.');
}

const apiBase = resolveApiBase(baseUrl);
const loginUrl = `${apiBase}/auth/login`;
const userProfileUrl = `${apiBase}/users/me`;

const run = async () => {
  console.log(`[release-smoke] Verifying login flow against ${apiBase}`);

  const loginResponse = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!loginResponse.ok) {
    const body = await loginResponse.text();
    fail(`Login request failed (${loginResponse.status}). Response: ${body.slice(0, 300)}`);
  }

  const payload = await loginResponse.json().catch(() => null);
  if (!payload || typeof payload.token !== 'string' || !payload.user) {
    fail('Login response did not include a token + user payload.');
  }

  const profileResponse = await fetch(userProfileUrl, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${payload.token}`,
    },
  });

  if (!profileResponse.ok) {
    const body = await profileResponse.text();
    fail(`Authenticated profile check failed (${profileResponse.status}). Response: ${body.slice(0, 300)}`);
  }

  console.log('[release-smoke] Login smoke check passed.');
};

run().catch((error) => {
  fail(`Unexpected smoke failure: ${error instanceof Error ? error.message : String(error)}`);
});
