import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

/**
 * Liveness + readiness for the box (infra/aws-london): the deploy script, Docker's health check and
 * the uptime alarm all ask this. 200 only when the app can reach Postgres. It says nothing about the
 * set-up beyond that — no hostnames, versions of anything third-party, or settings — just which build
 * is running (the image tag, so a deploy can check the new one is live) and whether the DB answered.
 * Never cached. Never indexed (/api is noindex in next.config.ts).
 */
export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 3000;

export async function GET(): Promise<Response> {
  const build = process.env.APP_BUILD || 'dev';
  const headers = { 'cache-control': 'no-store' };
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), DB_TIMEOUT_MS)),
    ]);
    return Response.json({ ok: true, db: 'ok', build }, { headers });
  } catch (e) {
    // the reason goes to the log stream (the founder's alert surface), never to the caller
    console.error('[health] database check failed:', (e as Error).message);
    return Response.json({ ok: false, db: 'down', build }, { status: 503, headers });
  }
}
