import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Security headers (CSP, app/gift noindex) are layered in with the trust-spine
  // and gift-link surfaces; marketing stays indexable.
};

export default nextConfig;
