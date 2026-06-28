import { timingSafeEqual } from 'node:crypto';

/**
 * Shared auth for cron/job endpoints: a `Bearer <JOBS_SECRET>` header, compared in
 * CONSTANT TIME so the check can't be probed as a timing side-channel. Returns a
 * Response (500 if unconfigured, 401 if the token is wrong) to short-circuit the
 * handler, or `null` when the request is authorised.
 */
export function requireJobsSecret(req: Request): Response | null {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return new Response('jobs not configured', { status: 500 });
  const provided = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return new Response('unauthorized', { status: 401 });
  }
  return null;
}
