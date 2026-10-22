# Security review — 22 Oct 2026 (branch `claude/brave-bohr-dv13jo`)

Scope: every way in from outside (19 API routes, 21 server-action files, the middleware/test-site
lock, auth, uploads, payments, links), dependencies, secrets in code + git history, response headers
on a production build. Plus the full test suite (825 pass; the 3 known environment-only failures).

## Fixed in this branch
| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | Known vulnerabilities in shipped libraries: Next.js (server-action DoS, cache poisoning, image-optimiser RCE), Auth.js (magic-link email homoglyph bypass), **sharp** (libvips/libheif/librsvg CVEs — sharp decodes every untrusted upload), PostCSS, nanoid | Critical/High | Patched in range (415fc0d). Build + e2e re-run. |
| 2 | **No security headers at all** — pages could be framed (clickjacking the keepsake home, checkout, gift links, admin), no HSTS, no nosniff, tokens could leak via Referer | High | Headers on every response + noindex on the private app (d24bdf8). |
| 3 | **Decompression bomb**: a tiny upload declaring 16000×16000 px (~1 GB to decode) was accepted — one request could knock a server over | High | Uploads over 50 MP refused from the header, before decoding. |
| 4 | Dev-only `/api/dev/capture` wrote to **any path** the caller named — dangerous on a dev server opened to the home network | Medium (dev only) | Writes only into `.dev-captures/`. |
| 5 | A fake connection string in a test fixture looked like a real Supabase secret | Low | Uses `example.invalid`. |

## Checked and sound
- **Permissions**: every server action and route resolves the caller server-side and goes through
  `src/authz` (the launch-gate matrix passes). The batch mockup route re-checks every item.
- **Payments**: Stripe webhooks verify the signature and are idempotent; prices are server-side.
- **Links**: gift/invite tokens are 192-bit random, revocable, expiring (gift links 14 days).
- **Secrets**: none in code or git history; `.env*` ignored; job endpoints use a constant-time secret.
- **Production refuses to run unsafely**: unencrypted originals and a short `AUTH_SECRET` both stop
  the server (seen during this review); the test site refuses live Stripe / live printing.
- **Admin**: review needs admin + two-step login; every look is logged.

## Open — need a decision or a bigger piece of work
| # | Gap | Risk | Recommendation |
|---|---|---|---|
| A | **No rate limiting anywhere** | High | One small Postgres-backed limiter (no new service), applied to: magic-link requests (email bombing / cost), guest uploads (storage + moderation cost), the test-site password, the admin two-step code (6 digits can be ground down), complaints/invites/gift links, and the mockup/batch routes (CPU). ~1 day incl. tests; needs one migration. |
| B | **Netlify functions run in the US** (default region) while children's pictures are composed there | High for real data; OK for test drawings | Before any real child image: set Functions region to London (Site configuration → Functions — a paid-plan setting) or move to the AWS London home (D18). Also makes the shop much faster. |
| C | No script-level Content-Security-Policy (only framing/base/object/form rules today) | Medium | Add a nonce-based `script-src` via the middleware; needs a careful pass over the 3D/AR viewer. |
| D | Magic sign-in links last 24 h | Low–Medium | 1 hour is the common norm; 24 h is kinder to parents. Founder call. |
| E | Dev-only test tools have known issues (vitest/tinypool/esbuild) | Low (never shipped) | Upgrade vitest 2 → 4 in a tooling PR. |
| F | Next.js bundles an old PostCSS (build-time, our own CSS only — not reachable by visitors) | Low | Goes with the Next 16 upgrade. |
