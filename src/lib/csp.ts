/**
 * The Content-Security-Policy — ONE place that says what the browser may load and run.
 *
 * Built per request by the proxy (src/proxy.ts) with a fresh nonce: Next.js reads the nonce from the
 * request's CSP header and stamps it on every script it renders, and 'strict-dynamic' lets those
 * trusted scripts load their own chunks (the lazy three.js spin view, model-viewer). Nothing else
 * runs: no inline script without the nonce, no eval, no script from another site.
 *
 * Why each source is allowed (keep this list honest — the PR + tests check it):
 *  - 'self'           our own pages, chunks, fonts (@fontsource files are bundled into
 *                     /_next/static), images, the /api routes, the web manifest.
 *  - storage origin   the PRIVATE bucket's host, derived from the S3_* env. Short-lived signed
 *                     URLs (minted after an authz check) are shown as <img> (img-src), and a
 *                     direct upload PUTs the bytes straight to it (connect-src).
 *  - data:            img-src: server-composed mockups + magic-edit masks come back as PNG data
 *                     URLs, and the height-chart ruler is an SVG data URL. connect-src: the
 *                     upload flow turns its local data URL back into a Blob with fetch().
 *  - blob:            img-src: the instant local preview of a picked photo. connect-src: the
 *                     AR viewer's client-built GLB is a blob: URL its loader fetches.
 *  - style 'unsafe-inline'  SOFTER EDGE, on purpose: React `style={…}` props render as style=""
 *                     attributes in server HTML, and the AR viewer styles its element inline.
 *                     A nonce can't cover attributes, and adding one would switch
 *                     'unsafe-inline' off. Scripts stay strict; this only allows CSS.
 *  - worker-src 'self'  ONE worker: our own service worker, /sw.js (public/sw.js — it caches only
 *                     build assets, brand files and the offline page; never a page, an API
 *                     response or a child's picture). No blob:/data: workers, nothing off-site.
 * Not allowed at all: any third-party script (Stripe Checkout is a full-page redirect — no
 * Stripe.js, no Stripe frame), frames, plugins, other workers, <base>, off-site forms, being framed.
 *
 * WebAssembly is refused too (no 'wasm-unsafe-eval'). The AR viewer's model-viewer bundles three's
 * meshopt mesh decoder and compiles it on import; that compile is refused and logs one error, but
 * our client-built GLB is never meshopt-compressed, so the model still loads (checked 22 Oct
 * against a production build). If a compressed model is ever used, add 'wasm-unsafe-eval' to
 * script-src — it allows compiling WASM only, never eval of JS.
 */

export type CspMode = 'production' | 'development';

/**
 * Everything dev mode relaxes, in one place. Next's dev server (React Refresh + webpack's
 * eval-source-map) needs eval, and hot reload talks over a websocket. A production build never
 * gets any of this — a unit test holds that line.
 */
export const DEV_RELAXATIONS = {
  script: ["'unsafe-eval'"],
  connect: ['ws:', 'wss:'],
} as const;

export interface CspInput {
  nonce: string;
  mode: CspMode;
  /** Exact origins of the private bucket (from {@link storageOrigins}). */
  storageOrigins: readonly string[];
}

/** A nonce must be base64 (what {@link newNonce} makes) — refuse anything that could break out
 * of the header or the quoted source. */
const NONCE_RE = /^[A-Za-z0-9+/]{16,}={0,2}$/;

export function buildCsp({ nonce, mode, storageOrigins }: CspInput): string {
  if (!NONCE_RE.test(nonce)) throw new Error('CSP nonce must be base64 (16+ chars)');
  for (const o of storageOrigins) {
    if (o !== exactOrigin(o)) throw new Error(`CSP storage origin must be a bare http(s) origin: ${o}`);
  }
  const dev = mode === 'development';
  const storage = [...new Set(storageOrigins)];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? DEV_RELAXATIONS.script : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...storage],
    'font-src': ["'self'"],
    'connect-src': ["'self'", 'data:', 'blob:', ...storage, ...(dev ? DEV_RELAXATIONS.connect : [])],
    'manifest-src': ["'self'"],
    'frame-src': ["'none'"],
    'worker-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

/** 128 random bits, base64. Web Crypto only, so it runs anywhere (the proxy, the browser, tests). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** `http(s)://host[:port]` for a URL, or '' if it isn't one. */
function exactOrigin(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

type Env = Record<string, string | undefined>;

/** S3's rule for a bucket name it may put in the hostname (virtual-hosted style). */
const DNS_BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const IP_HOST = /^(\d{1,3}\.){3}\d{1,3}$|^\[/;

/**
 * The exact origin the browser sees in a signed URL for the private bucket — the same choice the
 * AWS SDK makes when it signs (src/storage/client.ts): path-style keeps the endpoint's host;
 * virtual-hosted puts the bucket in front of it. No endpoint = real AWS S3 in S3_REGION.
 * Not configured → no origin (signed URLs can't exist, so nothing to allow).
 */
export function storageOrigins(env: Env = process.env): string[] {
  const bucket = env.S3_BUCKET;
  if (!bucket) return [];
  const pathStyle = env.S3_FORCE_PATH_STYLE === 'true';
  if (env.S3_ENDPOINT) {
    const origin = exactOrigin(env.S3_ENDPOINT);
    if (!origin) return [];
    const u = new URL(origin);
    if (pathStyle || !DNS_BUCKET.test(bucket) || IP_HOST.test(u.hostname)) return [origin];
    return [`${u.protocol}//${bucket}.${u.host}`];
  }
  const region = env.S3_REGION ?? 'eu-west-2';
  if (!/^[a-z0-9-]+$/.test(region)) return [];
  if (pathStyle || !DNS_BUCKET.test(bucket)) return [`https://s3.${region}.amazonaws.com`];
  return [`https://${bucket}.s3.${region}.amazonaws.com`];
}

/** The mode the running server is in. Only `next dev` relaxes. */
export function cspMode(env: Env = process.env): CspMode {
  return env.NODE_ENV === 'development' ? 'development' : 'production';
}
