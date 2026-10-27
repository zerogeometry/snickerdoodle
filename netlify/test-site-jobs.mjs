/**
 * TEST SITE only (decision D19): Netlify's scheduled functions call the job routes, the way the
 * systemd timers do on the real box. The schedules are in netlify.toml. Does nothing unless
 * SITE_MODE=test, so this can never become the real site's scheduler by accident.
 */
import { checkBaseUrl, logLine, runJob, summarise } from '../scripts/jobs/core.mjs';

// A scheduled function gets ~30s in all, so each job gets 25s and runs side by side.
const BUDGET_MS = 25_000;

/** @param {string[]} names @param {Record<string, string | undefined>} [env] */
export async function runOnTestSite(names, env = process.env) {
  const secret = env.JOBS_SECRET ?? '';
  if (env.SITE_MODE !== 'test') {
    console.log(logLine({ level: 'warn', event: 'skipped', reason: 'not the test site (SITE_MODE is not test)' }));
    return new Response('not the test site', { status: 200 });
  }
  const target = checkBaseUrl(env.APP_URL || env.URL || '');
  if (!target.ok || !secret) {
    console.error(logLine({ level: 'error', event: 'config', reason: target.ok ? 'JOBS_SECRET is not set' : target.reason }));
    return new Response('jobs not configured', { status: 500 });
  }
  const results = await Promise.all(
    names.map(async (name) => {
      const r = await runJob({ name, base: target.base, secret, timeoutMs: BUDGET_MS, retries: 0 });
      const line = { level: r.outcome === 'failed' ? 'error' : 'info', job: name, event: r.outcome, status: r.status, ms: r.ms, ...(r.reason ? { reason: r.reason } : {}), ...(r.body !== null ? { summary: summarise(r.body) } : {}) };
      (r.outcome === 'failed' ? console.error : console.log)(logLine(line, secret));
      return r;
    }),
  );
  const failed = results.filter((r) => r.outcome === 'failed').length;
  return new Response(failed ? `${failed} job(s) failed` : 'ok', { status: failed ? 500 : 200 });
}
