import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Security headers (CSP, app/gift noindex) are layered in with the trust-spine
  // and gift-link surfaces; marketing stays indexable.
  experimental: {
    // Drawings/photos are uploaded to the ingest server action as FormData. The
    // default Server Actions body limit is 1MB — far too small for real phone
    // photos — so raise it. (keepCreation independently guards at 25MB; we stay
    // under that with headroom for multipart overhead.)
    serverActions: { bodySizeLimit: '20mb' },
  },
};

export default nextConfig;
