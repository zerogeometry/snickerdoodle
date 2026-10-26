/**
 * Runs once when the server starts. On the TEST SITE it refuses to start at all if anything
 * could make it real — a live Stripe key, real printing, the LG3 gate open, or no password
 * (src/lib/siteMode.ts). Better a site that won't start than a "test" that takes real money.
 *
 * With MODERATION_PROVIDER=real it also refuses to start on bad content-safety config (an unknown
 * mode, a Rekognition endpoint override, no AWS credentials) — never a quiet fall-back to the stub.
 */
export async function register() {
  const { assertTestSiteSafe } = await import('@/lib/siteMode');
  assertTestSiteSafe();
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertModerationReady } = await import('@/server/moderation/providers');
    await assertModerationReady();
    // Warm the product photos for the first catalogue reveal (brand-safe templates only, never a
    // drawing) — in the background, a moment after start, so it never delays the server coming up.
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => {
        void (async () => {
          try {
            const [{ getDb }, { warmTemplateCache }] = await Promise.all([import('@/db/client'), import('@/server/print/compositor')]);
            const t0 = Date.now();
            const r = await warmTemplateCache(getDb());
            console.info(`[warm] ${r.layers} product photos ready in ${Date.now() - t0}ms (${Math.round(r.bytes / 1048576)}MB)`);
          } catch (e) {
            console.warn('[warm] skipped:', (e as Error).message);
          }
        })();
      }, 3000);
    }
  }
}
