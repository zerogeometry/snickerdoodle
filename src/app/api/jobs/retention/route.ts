import { getDb } from '@/db/client';
import { purgeExpiredAssets } from '@/server/retention';

/**
 * Retention purge, triggered by a scheduler (cron / Vercel Cron / a scheduled
 * task) hitting this endpoint daily with the shared JOBS_SECRET. Keeps ops light
 * — no standing worker — while still enforcing retention in code. Swap for a
 * pg-boss worker later if a queue is preferred.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return new Response('jobs not configured', { status: 500 });
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }
  const summary = await purgeExpiredAssets(getDb());
  return Response.json(summary);
}
