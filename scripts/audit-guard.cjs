#!/usr/bin/env node
/**
 * Production dependency audit with an explicit, auditable exception list.
 *
 * WHY THIS EXISTS
 * ----------------
 * The release gate previously ran bare `npm audit --omit=dev`. That is the right
 * default, but it has no way to record a reasoned exception, so a single
 * not-applicable advisory in a transitive package blocks every release with only
 * two escape hatches, both bad:
 *
 *   1. Raise --audit-level, which silently hides unrelated real findings.
 *   2. Take npm's suggested "fix", which is sometimes a DOWNGRADE that
 *      reintroduces vulnerabilities that were already patched.
 *
 * This script keeps the gate strict — any advisory not on the list below fails
 * the build — while making each accepted exception explicit, attributable, and
 * time-boxed. An expired exception fails the build on purpose, so exceptions
 * cannot quietly become permanent.
 *
 * ADDING AN EXCEPTION
 * --------------------
 * Only for advisories that are genuinely not applicable to this application, or
 * where no fixed version exists and the risk has been accepted by the CTO.
 * Every field is mandatory. "We are busy" is not a justification; if the finding
 * is real and unfixed, the honest options are to accept it in writing with an
 * owner and an expiry, or to fix it.
 *
 * Usage:  node ../scripts/audit-guard.cjs        (run from backend/ or frontend/)
 */

'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

/**
 * @typedef {Object} Exception
 * @property {string}   id          GHSA identifier as reported by npm audit.
 * @property {string}   package     Package the advisory is filed against.
 * @property {string}   reason      Why this does not apply, or why it is accepted.
 * @property {string}   evidence    How the claim was verified — must be checkable.
 * @property {string}   owner       Who accepted it.
 * @property {string}   reviewBy    ISO date. Build fails after this date.
 */

/** @type {Exception[]} */
const EXCEPTIONS = [
    {
        id: 'GHSA-qwww-vcr4-c8h2',
        package: 'react-router',
        reason:
            'CSRF bypass in React Router "RSC mode". The advisory states verbatim: "This only affects '
            + 'your application if you are using the unstable RSC APIs." This frontend is a Vite '
            + 'client-side SPA using declarative routing only — it does not use React Server '
            + 'Components, framework mode, or any unstable_ router API, so the vulnerable code path '
            + 'is never reached. No patched 7.x release exists (fixed only in react-router 8.3.0, and '
            + 'react-router-dom has no 8.x line), and npm audit\'s suggested remediation is a '
            + 'DOWNGRADE to react-router-dom@7.11.0, which would reintroduce CVE-2026-33245 and '
            + 'CVE-2026-34077 (client-side XSS, patched in 7.13.2). Accepting this advisory is '
            + 'strictly safer than the tool-suggested fix. Tracked for a deliberate react-router v8 '
            + 'migration rather than a reactive downgrade.',
        evidence:
            'https://github.com/advisories/GHSA-qwww-vcr4-c8h2 (see the "Note" in the description). '
            + 'App usage: frontend/src/App.tsx imports BrowserRouter/Routes/Route from react-router-dom. '
            + 'No @react-router/* framework packages in frontend/package.json. Verify with: '
            + 'grep -rn "unstable_\\|@react-router/\\|RSC" frontend/src frontend/package.json',
        owner: 'Godwill Ocheme (CTO)',
        reviewBy: '2026-11-03',
    },
];

const workspace = path.basename(process.cwd());
const fail = (message) => {
    console.error(`[audit-guard] ${message}`);
    process.exit(1);
};

// npm audit exits non-zero when vulnerabilities exist, so the throw is expected
// and the JSON payload still arrives on stdout.
let raw;
try {
    raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });
} catch (error) {
    raw = error.stdout;
    if (!raw) fail(`Unable to run npm audit: ${error.message}`);
}

let report;
try {
    report = JSON.parse(raw);
} catch (error) {
    fail(`Could not parse npm audit output as JSON: ${error.message}`);
}

const today = new Date().toISOString().slice(0, 10);
const byId = new Map(EXCEPTIONS.map((entry) => [entry.id, entry]));
const usedIds = new Set();

/** Collect every advisory id present in the audit, with its package. */
const found = [];
for (const [pkgName, vuln] of Object.entries(report.vulnerabilities || {})) {
    for (const via of vuln.via || []) {
        if (typeof via !== 'object') continue;
        const id = (via.url || '').split('/').pop() || via.source || 'UNKNOWN';
        found.push({
            id,
            package: pkgName,
            title: via.title || '(no title)',
            severity: via.severity || vuln.severity,
        });
    }
}

const blocking = [];
for (const advisory of found) {
    const exception = byId.get(advisory.id);
    if (!exception) {
        blocking.push(advisory);
        continue;
    }
    usedIds.add(advisory.id);
    if (today > exception.reviewBy) {
        fail(
            `Exception for ${advisory.id} (${exception.package}) expired on ${exception.reviewBy}. `
            + 'Re-verify that it still does not apply and extend reviewBy, or remediate. '
            + 'Exceptions are time-boxed deliberately so they cannot become permanent.',
        );
    }
    console.log(
        `[audit-guard] ACCEPTED ${advisory.id} (${advisory.package}, ${advisory.severity}) — `
        + `${exception.reason.slice(0, 110)}... [owner: ${exception.owner}, review by ${exception.reviewBy}]`,
    );
}

// An exception that no longer matches anything is stale — it means the finding
// was fixed or the dependency dropped. Warn so the list stays honest, but do not
// fail: a workspace legitimately does not carry the other workspace's deps.
for (const entry of EXCEPTIONS) {
    if (!usedIds.has(entry.id) && found.length > 0) {
        console.log(`[audit-guard] note: exception ${entry.id} did not match any advisory in ${workspace}/.`);
    }
}

if (blocking.length > 0) {
    console.error(`[audit-guard] ${blocking.length} unreviewed production advisory/advisories in ${workspace}/:`);
    for (const advisory of blocking) {
        console.error(`  - ${advisory.id} [${advisory.severity}] ${advisory.package}: ${advisory.title}`);
    }
    fail(
        'Fix these, or add a justified exception to scripts/audit-guard.cjs. '
        + 'Do not raise --audit-level and do not accept a downgrade that reintroduces a patched CVE.',
    );
}

const counts = (report.metadata && report.metadata.vulnerabilities) || {};
console.log(
    `[audit-guard] Production audit passed for ${workspace}/ `
    + `(${found.length} advisory reference(s), ${usedIds.size} accepted exception(s); `
    + `raw npm counts: ${JSON.stringify(counts)}).`,
);
