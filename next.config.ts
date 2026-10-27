import type { NextConfig } from 'next';

/**
 * Browser security headers on EVERY response (they cost nothing and close whole classes of attack):
 *  - frame-ancestors 'none' + X-Frame-Options: nobody can frame our pages (clickjacking on the
 *    keepsake home, checkout, gift links, admin review);
 *  - base-uri / object-src / form-action: an injected <base>, plugin or off-site form can't hijack
 *    a page (the test gate, sign-in and sign-out forms all post to ourselves; Stripe is a plain
 *    navigation, not a form);
 *  - nosniff: an uploaded file is never sniffed into something executable;
 *  - Referrer-Policy: a gift-link / invite token in a URL never leaks to another site;
 *  - Permissions-Policy: the camera is ours only (CameraCapture); no mic, location or payment API;
 *  - HSTS: HTTPS only, for a year (no includeSubDomains/preload until every subdomain is HTTPS).
 * The Content-Security-Policy itself (scripts by per-request nonce, plus the framing/base/object/
 * form rules) is set by the proxy (src/proxy.ts) — src/lib/csp.ts builds it. The only responses the
 * proxy skips are Next's hashed static files and the image optimiser; they get the strict
 * baseline below (no HTML is ever served there, so nothing needs to run).
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

/** For the paths the proxy doesn't see (/_next/static, /_next/image): run nothing, frame nothing. */
const STATIC_ASSET_CSP = "default-src 'none'; img-src 'self'; style-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** The private app (anything a child's drawing can appear on) is never indexed — only the
 * marketing pages are. Belt and braces: these pages are behind sign-in or a token anyway. */
const NOINDEX_PATHS = ['/home', '/family', '/account', '/checkout', '/orders', '/customize', '/studio', '/start-creating', '/share-wish', '/admin', '/g', '/join', '/login', '/api'];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      ...['/_next/static/:path*', '/_next/image'].map((source) => ({ source, headers: [{ key: 'Content-Security-Policy', value: STATIC_ASSET_CSP }] })),
      ...NOINDEX_PATHS.flatMap((p) => [
        { source: p, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
        { source: `${p}/:path*`, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      ]),
    ];
  },
  // Allow an isolated build dir (e.g. e2e) so a production build can't clobber a
  // running `next dev`'s .next (they cannot safely share one). Defaults to .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Native/binary server-only deps must NOT be bundled (Turbopack, or webpack with --webpack) — require them at runtime.
  // @resvg/resvg-js ships a platform .node binary (the card's inside-message + back-badge print
  // renderer, reached via src/server/print/render.ts → the print-preview server action); sharp
  // likewise. Without this, the bundler tries to parse the .node binary and the route 500s.
  // onnxruntime-node (the self-hosted print-sharp upscaler, src/ml/superRes.ts) likewise.
  serverExternalPackages: ['@resvg/resvg-js', 'sharp', 'onnxruntime-node'],
  // The upscaler's model is read from disk at runtime; ship it with any traced server bundle. And
  // only the Linux x64 runtime binary is ever used on the server (~46MB of the package's ~300MB).
  outputFileTracingIncludes: { '/**': ['./models/sr/*.onnx'] },
  outputFileTracingExcludes: {
    '/**': ['./node_modules/onnxruntime-node/bin/napi-v*/darwin/**', './node_modules/onnxruntime-node/bin/napi-v*/win32/**', './node_modules/onnxruntime-node/bin/napi-v*/linux/arm64/**'],
  },
  experimental: {
    // Drawings/photos are uploaded to the ingest server action as FormData. The
    // default Server Actions body limit is 1MB — far too small for real phone
    // photos — so raise it. (keepCreation independently guards at 25MB; we stay
    // under that with headroom for multipart overhead.)
    serverActions: { bodySizeLimit: '20mb' },
  },
};

export default nextConfig;
