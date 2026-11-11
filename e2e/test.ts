import { test as base, type BrowserContext, type Response } from '@playwright/test';
import { hasDb, sql } from './harness';

/**
 * The e2e `test` — Playwright's own, plus two automatic steps for EVERY test.
 * Specs import { test, expect } from './test' instead of '@playwright/test'.
 *
 * 1. FRESH RATE LIMITS. The local database's rate-limit counters are emptied before each test. A full
 *    run uploads far more than the 60 guest uploads an hour one address may make
 *    (src/server/rateLimit.ts), so without this the later specs were throttled into failing. The
 *    limits themselves are untouched — each test simply starts with a clean slate, as a fresh visitor
 *    would.
 *
 * 2. THE CLASSIFIER SAYS THIS TEST DRAWING IS CLEAN (`screenedClean`, on by default).
 *    The e2e server is a production build with NO real screening wired, so — by design, and exactly
 *    as the live site would if screening were ever missing — every upload is HELD the moment it lands
 *    (`screening-not-configured`, src/server/moderation/index.ts). On the real site a clean drawing
 *    clears within seconds, so a shopper never sees the "we've paused this picture" notice
 *    (src/ui/components/ScreeningNotice.tsx). Here it popped up on every journey and blocked the
 *    page. So this step stands in for the classifier's "clean" answer — the same stand-in reviewer as
 *    `clearForTest` (e2e/harness.ts), done automatically and narrowly:
 *      - only pictures THIS test's own browser just uploaded or saved (their ids come back in the
 *        page's own server-action responses, and they were made in the last hour), never anything
 *        else in the shared database;
 *      - only ones held for the single reason "screening not configured" — never a report, a
 *        deliberate hold a test set itself, or a block;
 *      - nothing in the app changes: checkout still refuses anything not cleared; this only supplies
 *        the verdict a real classifier would have given.
 *    Tests ABOUT held / flagged / reported pictures turn it off and keep testing the hold for real:
 *      test.use({ screenedClean: false });
 *    For a context a test opens itself (browser.newContext), call `classifierSaysClean(context)`.
 *
 * Both only ever touch a LOCAL database (localhost / 127.0.0.1 / ::1).
 */
export * from '@playwright/test';

const LOCAL_DB = /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(process.env.DATABASE_URL ?? '');
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Mark these pictures as the classifier would have: clean. Only rows held for the one reason
 * "screening not configured" (no report, no other label) change, and only the VERDICT changes: the
 * label stays, because it is true here — no hash check ever ran on the e2e server — so the review
 * queue still treats the picture as hash-unchecked (remove-only after a report), just as
 * `clearForTest` leaves it. The upload's and any Studio design's stored verdict say "clean" too, so a
 * re-screen folds in "clean" the way it would on the live site.
 *
 * `e2eStandInAt` remembers the screening it answered (moderated_at). A picture is answered again only
 * when the app has screened it again since (a Studio save, a catch-up screen) — never because a test
 * set it back to FLAGGED on purpose.
 */
async function markClean(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await sql()`update assets set
      moderation_status = 'CLEAR',
      moderation_detail = moderation_detail
        || jsonb_build_object('e2eStandInAt', coalesce(moderated_at::text, ''))
        || case when jsonb_typeof(moderation_detail -> 'original') = 'object'
             then jsonb_build_object('original', (moderation_detail -> 'original') || '{"status":"CLEAR"}'::jsonb)
             else '{}'::jsonb end
        || case when jsonb_typeof(moderation_detail -> 'design') = 'object'
             then jsonb_build_object('design', (moderation_detail -> 'design') || '{"status":"CLEAR"}'::jsonb)
             else '{}'::jsonb end
    where id = any(${ids}::uuid[])
      and moderation_status = 'FLAGGED'
      and moderation_detail -> 'labels' = '["screening-not-configured"]'::jsonb
      and created_at > now() - interval '1 hour'
      and coalesce(jsonb_array_length(case when jsonb_typeof(moderation_detail -> 'reports') = 'array' then moderation_detail -> 'reports' end), 0) = 0
      and moderation_detail ->> 'e2eStandInAt' is distinct from coalesce(moderated_at::text, '')`;
}

/**
 * Watch one browser context: every server-action response (the upload, a Studio save, keeping a
 * drawing…) names the picture it made; those pictures — and any this context named earlier, in case
 * a later save re-screened them — get the classifier's "clean". Returns a stop() that waits (briefly)
 * for any update still in flight.
 */
export function classifierSaysClean(context: BrowserContext): () => Promise<void> {
  if (!(hasDb && LOCAL_DB)) return async () => {};
  const seen = new Set<string>();
  const inFlight = new Set<Promise<void>>();
  const onResponse = (res: Response) => {
    const req = res.request();
    if (req.method() !== 'POST' || !req.headers()['next-action']) return;
    const job = res
      .text()
      .then(async (body) => {
        for (const id of body.match(UUIDS) ?? []) seen.add(id.toLowerCase());
        await markClean([...seen]);
      })
      .catch((e: Error) => {
        // a page closed mid-response has nothing left to mark; anything else would silently undo the stand-in
        if (!/closed|disposed|No resource with given identifier|Network\.getResponseBody/i.test(e.message)) console.warn('[classifierSaysClean]', e.message);
      });
    inFlight.add(job);
    void job.finally(() => inFlight.delete(job));
  };
  context.on('response', onResponse);
  return async () => {
    context.off('response', onResponse);
    // let an update already under way land — but never hang on a response body that never finishes
    await Promise.race([Promise.allSettled([...inFlight]), new Promise((done) => setTimeout(done, 3_000))]);
  };
}

export const test = base.extend<{ freshRateLimits: void; screenedClean: boolean }>({
  freshRateLimits: [
    async ({}, use) => {
      if (hasDb && LOCAL_DB) await sql()`delete from rate_limits`;
      await use();
    },
    { auto: true },
  ],
  screenedClean: [true, { option: true }],
  context: async ({ context, screenedClean }, provide) => {
    const stop = screenedClean ? classifierSaysClean(context) : null;
    await provide(context);
    await stop?.();
  },
});
