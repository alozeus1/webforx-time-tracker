# Lighthouse SEO Audit Fix - Timer App

Date: 2026-04-25

Production URL: https://timer.dev.webforxtech.com/login

## Lighthouse Baseline

- Performance: 98
- Accessibility: 100
- Best Practices: 100
- SEO: 61

## Findings

- `noindex,nofollow` meta tag was blocking indexing on the public login page.
- `/robots.txt` was serving the React/Vite HTML app shell instead of plain robots text, causing Lighthouse robots.txt syntax errors.

## Files Changed

- `frontend/src/pages/Login.tsx`: made the public login route indexable and updated title, description, canonical, Open Graph, and Twitter metadata.
- `frontend/src/hooks/usePageMetadata.ts`: added Twitter card metadata support while preserving existing route metadata behavior.
- `frontend/src/components/Layout.tsx`: kept authenticated workspace routes non-indexable at the metadata layer.
- `frontend/public/robots.txt`: added a static robots file that allows public routes and disallows authenticated app/API paths.
- `frontend/public/sitemap.xml`: added a sitemap containing only the public login URL.

## Validation Commands Run

- `npm run lint` from `frontend/`: passed.
- `npm run build` from `frontend/`: passed, including `tsc -b`; Vite emitted the existing large bundle warning.
- `npm run test` from `frontend/`: did not complete because Vitest hit a Node heap out-of-memory after 11 of 12 test files passed and 53 of 56 tests passed.
- `npm run preview -- --host 127.0.0.1 --port 4173` from `frontend/`: used for local built-app verification.
- `curl -i --max-time 10 http://127.0.0.1:4173/robots.txt`: returned `200 OK`, `Content-Type: text/plain`, and valid robots text.
- `curl -i --max-time 10 http://127.0.0.1:4173/sitemap.xml`: returned `200 OK`, `Content-Type: text/xml`, and valid XML containing only `/login`.
- `curl -I --max-time 10 http://127.0.0.1:4173/login`: returned `200 OK`.
- Headless Playwright rendered `/login` and confirmed title, description, canonical, Open Graph title, Twitter card, `robots=index, follow`, and presence of the password input.
- Headless Playwright confirmed `/dashboard` redirects to `/login` without a token and uses `robots=noindex, nofollow` with a token.

## Remaining Risks

- The app is a client-rendered Vite SPA, so crawlers that do not execute JavaScript may only see static `index.html` metadata before route metadata is applied.
- `robots.txt` depends on the frontend host serving Vite `public/` files before the SPA fallback rewrite. This should be verified after deployment at `https://timer.dev.webforxtech.com/robots.txt`.
- Public pages beyond `/login` exist (`/`, `/request-access`, `/privacy`, `/terms`, `/demo`, `/share/:token`), but this fix intentionally keeps the sitemap minimal to avoid indexing private or tokenized content by mistake.
- Full frontend unit validation is limited by the current Vitest heap failure.

## Follow-Up Recommendations

- Run Lighthouse against production after deploy and confirm SEO score improves.
- Consider server-side/static per-route metadata if SEO for public marketing pages becomes a goal.
- Add a post-deploy smoke check for `/robots.txt` content type/body and `/sitemap.xml` XML body.
- Decide whether public marketing pages such as `/`, `/privacy`, `/terms`, `/request-access`, and `/demo` should be included in a later sitemap expansion.

## Related Notes And Runbooks

- [Agent Handbook](../../AGENT_HANDBOOK.md)
- [MVP Spec](../../docs/mvp.md)
- [Application Route Map](../../docs/app-route.md)
- [Deployment Guide](../../DEPLOYMENT.md)
- [SEO Metadata Spec](../../docs/seo.md)
