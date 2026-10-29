/**
 * TEST SITE mode (founder, 2026-10-16): a password-locked copy of the shop on Netlify + Supabase,
 * for trying things out before the real AWS home (D18) is built. `SITE_MODE=test`.
 *
 * What test mode changes — and ONLY in test mode:
 *  - pictures may be stored with the storage provider's own at-rest encryption (Supabase) instead
 *    of our customer-managed KMS keys;
 *  - the whole site sits behind a shared password, is never indexed, and shows a banner asking
 *    for test drawings only.
 *
 * What it can NEVER do (refused at boot — {@link testSiteProblems}): take real money (live Stripe
 * key), print for real (POD_MODE=LIVE), or open the children's-pictures-to-the-printer gate (LG3).
 * PRIVATE LIVE mode (founder, 29 Oct 2026): `SITE_MODE=private`, the founder's end-to-end test. The
 * site keeps the password and is never indexed, exactly like the test site, but it is otherwise the
 * REAL shop: live Stripe, real printing (POD_MODE=LIVE) and the LG3 gate are ALLOWED, our own KMS
 * keys are REQUIRED (no storage relaxation), and the season preview date is REFUSED (a real order
 * must see real dates). Every launch gate in the code still applies on its own: the POD egress gate
 * (LG3 + the processor register), the content-safety gate (IWF + moderation) and the margin guard.
 * Only the people holding the password can reach it.
 *
 * Any other SITE_MODE value refuses to start: a typo must never quietly turn the lock off.
 * Edge-safe: no Node imports, so the proxy (src/proxy.ts) can use it.
 */
type Env = Record<string, string | undefined>;

export function isTestSite(env: Env = process.env): boolean {
  return env.SITE_MODE === 'test';
}

/** PRIVATE LIVE: the real shop behind the shared password (see above). */
export function isPrivateLive(env: Env = process.env): boolean {
  return env.SITE_MODE === 'private';
}

/** Behind the shared password and never indexed: the test site OR the private live site. */
export function isPasswordLocked(env: Env = process.env): boolean {
  return isTestSite(env) || isPrivateLive(env);
}

const KNOWN_MODES = new Set(['test', 'private']);

/** Everything that would make a private live site unsafe. Empty = safe to run. */
export function privateLiveProblems(env: Env = process.env): string[] {
  if (!isPrivateLive(env)) return [];
  const problems: string[] = [];
  if (!env.TEST_SITE_PASSWORD || env.TEST_SITE_PASSWORD.length < 10) problems.push('TEST_SITE_PASSWORD must be set (10+ characters) — the private site is password-locked');
  if (!env.AUTH_SECRET) problems.push('AUTH_SECRET must be set');
  if (env.SEASON_PREVIEW_DATE || env.NEXT_PUBLIC_SEASON_PREVIEW_DATE) problems.push('SEASON_PREVIEW_DATE is set — a private live site takes real orders, so it must see the real date');
  return problems;
}

/** Everything that would make a "test" site not a test site. Empty = safe to run. */
export function testSiteProblems(env: Env = process.env): string[] {
  if (!isTestSite(env)) return [];
  const problems: string[] = [];
  if ((env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live') || (env.STRIPE_SECRET_KEY ?? '').startsWith('rk_live')) {
    problems.push('a LIVE Stripe key is set — a test site only ever uses test keys');
  }
  if (env.POD_MODE === 'LIVE') problems.push('POD_MODE=LIVE — a test site never prints for real');
  if (env.LG3_TRANSFER_ASSESSMENT_SIGNED_OFF === 'true') problems.push('the LG3 gate is open — never on a test site');
  if (!env.TEST_SITE_PASSWORD || env.TEST_SITE_PASSWORD.length < 10) problems.push('TEST_SITE_PASSWORD must be set (10+ characters)');
  if (!env.AUTH_SECRET) problems.push('AUTH_SECRET must be set');
  return problems;
}

export function assertTestSiteSafe(env: Env = process.env): void {
  if (env.SITE_MODE && !KNOWN_MODES.has(env.SITE_MODE)) {
    throw new Error(`refusing to start: SITE_MODE="${env.SITE_MODE}" is not "test" or "private" — a typo must never turn the password lock off (unset it for the public site)`);
  }
  const problems = testSiteProblems(env);
  if (problems.length) throw new Error(`refusing to start the test site: ${problems.join('; ')}`);
  const priv = privateLiveProblems(env);
  if (priv.length) throw new Error(`refusing to start the private live site: ${priv.join('; ')}`);
}

// ── the password lock ─────────────────────────────────────────────────────────────────────

export const TEST_GATE_COOKIE = 'sd_test_gate';
export const TEST_GATE_DAYS = 30;

/** Paths that must work without the password: the lock itself, provider webhooks and the
 * scheduled jobs (each carries its own signature / secret), the health check the deploy and the
 * uptime alarm ask (it says only "ok" + the build; its render check needs the jobs secret), and
 * static assets. */
export function isGateExempt(pathname: string): boolean {
  return (
    pathname === '/test-gate' ||
    pathname.startsWith('/api/test-gate') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/api/jobs/') ||
    pathname === '/api/health' ||
    pathname.startsWith('/api/health/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/brand/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/manifest.webmanifest' ||
    // static brand files only — never an API route that happens to end in .png
    (!pathname.startsWith('/api/') && /\.(png|jpe?g|webp|svg|ico|woff2?)$/.test(pathname))
  );
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The cookie value that proves the password was given: HMAC(AUTH_SECRET, password). Changing
 * the password (or the secret) locks everyone out again. */
export async function gateToken(env: Env = process.env): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_SECRET ?? ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`test-gate:${env.TEST_SITE_PASSWORD ?? ''}`)));
}

/** Constant-time string compare (no early exit on the first differing character). */
export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function gateCookieValid(cookie: string | undefined, env: Env = process.env): Promise<boolean> {
  if (!cookie || !env.TEST_SITE_PASSWORD || !env.AUTH_SECRET) return false;
  return sameString(cookie, await gateToken(env));
}

/** Where to go after the password: a path on THIS site only. Resolved the way a browser would
 * (so `//x`, `/\x`, `https://x` can't slip out), then checked by origin. */
export function sameSitePath(raw: string, base: string): string {
  try {
    const origin = new URL(base).origin;
    const u = new URL(raw, origin);
    return u.origin === origin ? `${u.pathname}${u.search}` : '/';
  } catch {
    return '/';
  }
}
