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
  }
}
