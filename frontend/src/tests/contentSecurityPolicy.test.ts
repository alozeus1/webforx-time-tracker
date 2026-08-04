import { describe, expect, it } from 'vitest';
// Loaded through Vite's `?raw` loader rather than node:fs. `tsconfig.app.json` type-checks
// everything under src/ with `"types": ["vite/client"]` and no Node types, so importing
// node:fs here compiles under vitest but breaks `tsc -b`, which is what the production
// build runs. `vite/client` declares `*?raw`, so this needs no tsconfig change.
import vercelConfigRaw from '../../vercel.json?raw';

/**
 * Guards the CSP that the /schedule page depends on.
 *
 * THE BUG THIS PREVENTS
 * ----------------------
 * `style-src 'self'` (no 'unsafe-inline', no nonce) shipped to production and broke
 * /schedule for every user, every time.
 *
 * FullCalendar v6 ships **no CSS files at all** — verified: there is not a single .css
 * in node_modules/@fullcalendar. All of its styling is injected at runtime by creating a
 * `<style>` element and calling `sheet.insertRule(...)`. Under `style-src 'self'` the
 * browser allows that element into the DOM but refuses to apply it, so `styleEl.sheet`
 * is `null`. FullCalendar's `injectStyles` then iterates its `styleEls` Map and reads
 * `sheet.cssRules.length` without a null check, throwing
 *
 *     TypeError: Cannot read properties of null (reading 'cssRules')
 *
 * which unmounted the React tree and left a blank page.
 *
 * This was production-only: the Vite dev server does not apply vercel.json headers, so
 * it worked perfectly on localhost and in CI.
 *
 * WHY A TEST RATHER THAN A COMMENT
 * ---------------------------------
 * vercel.json is JSON and cannot carry a comment, and the obvious "security hardening"
 * instinct is to delete 'unsafe-inline' from style-src. Doing that silently re-breaks the
 * calendar in production only. This test makes that regression fail in CI instead.
 *
 * If you need to remove 'unsafe-inline', you must first stop FullCalendar injecting
 * styles at runtime — either by extracting its CSS at build time into a real stylesheet,
 * or by supplying a per-request nonce (which needs a server, not static hosting; a
 * build-time constant nonce is equivalent to 'unsafe-inline' and buys nothing).
 */

const readCsp = (): string => {
    const config = JSON.parse(vercelConfigRaw) as {
        headers?: Array<{ headers?: Array<{ key: string; value: string }> }>;
    };

    for (const rule of config.headers ?? []) {
        for (const header of rule.headers ?? []) {
            if (header.key.toLowerCase() === 'content-security-policy') return header.value;
        }
    }
    throw new Error('No Content-Security-Policy header found in frontend/vercel.json');
};

const directive = (csp: string, name: string): string[] => {
    const found = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
    return found ? found.split(/\s+/).slice(1) : [];
};

describe('production Content-Security-Policy', () => {
    const csp = readCsp();

    it('permits the runtime style injection FullCalendar requires', () => {
        const styleSrc = directive(csp, 'style-src');
        const allowsInline = styleSrc.includes("'unsafe-inline'") || styleSrc.some((s) => s.startsWith("'nonce-"));

        expect(
            allowsInline,
            "style-src must allow inline styles or FullCalendar's injected <style> is blocked, "
            + "styleEl.sheet becomes null, and /schedule crashes with "
            + "\"Cannot read properties of null (reading 'cssRules')\". See this file's header.",
        ).toBe(true);
    });

    it('still refuses inline and remote scripts', () => {
        // Loosening style-src must not become an excuse to loosen script-src, which is
        // where the real XSS risk lives.
        const scriptSrc = directive(csp, 'script-src');
        expect(scriptSrc).toContain("'self'");
        expect(scriptSrc).not.toContain("'unsafe-inline'");
        expect(scriptSrc).not.toContain("'unsafe-eval'");
        expect(scriptSrc).not.toContain('*');
    });

    it('keeps the other hardening directives intact', () => {
        expect(directive(csp, 'default-src')).toEqual(["'self'"]);
        expect(directive(csp, 'object-src')).toEqual(["'none'"]);
        expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
        expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
        expect(directive(csp, 'form-action')).toEqual(["'self'"]);
    });

    it('allows the API origin it needs and nothing wildcard', () => {
        const connectSrc = directive(csp, 'connect-src');
        expect(connectSrc).toContain("'self'");
        expect(connectSrc).toContain('https://api.dev.webforxtech.com');
        expect(connectSrc).not.toContain('*');
    });
});
