import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Allow an isolated build dir (e.g. e2e) so a production build can't clobber a
  // running `next dev`'s .next (they cannot safely share one). Defaults to .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Native/binary server-only deps must NOT be webpack-bundled — require them at runtime.
  // @resvg/resvg-js ships a platform .node binary (the card's inside-message + back-badge print
  // renderer, reached via src/server/print/render.ts → the print-preview server action); sharp
  // likewise. Without this, webpack tries to parse the .node binary and the route 500s.
  // onnxruntime-node (the self-hosted print-sharp upscaler, src/ml/superRes.ts) likewise.
  serverExternalPackages: ['@resvg/resvg-js', 'sharp', 'onnxruntime-node'],
  // The upscaler's model is read from disk at runtime; ship it with the server. And only the
  // Linux x64 runtime binary is ever used on the server (~46MB of the package's ~300MB).
  outputFileTracingIncludes: { '/**': ['./models/sr/*.onnx'] },
  outputFileTracingExcludes: {
    '/**': ['./node_modules/onnxruntime-node/bin/napi-v*/darwin/**', './node_modules/onnxruntime-node/bin/napi-v*/win32/**', './node_modules/onnxruntime-node/bin/napi-v*/linux/arm64/**'],
  },
  // The service worker must never be served stale (a fix to it has to reach phones at once).
  async headers() {
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] }];
  },
  // noindex: set by src/middleware.ts for every path outside the public list in
  // src/lib/indexing.ts (marketing/trust/shop front stay indexable).
  experimental: {
    // Drawings/photos are uploaded to the ingest server action as FormData. The
    // default Server Actions body limit is 1MB — far too small for real phone
    // photos — so raise it. (keepCreation independently guards at 25MB; we stay
    // under that with headroom for multipart overhead.)
    serverActions: { bodySizeLimit: '20mb' },
  },
};

export default nextConfig;
