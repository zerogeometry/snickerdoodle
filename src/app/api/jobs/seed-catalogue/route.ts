import { getDb } from '@/db/client';
import { seedCatalogue } from '@/server/catalogue';

/**
 * Seed/refresh the product catalogue (idempotent) — run once per environment so
 * pricing reads from the DB. Guarded by JOBS_SECRET like the other job endpoints.
 * (Replaced by the Prodigi catalogue sync once the adapter lands.)
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return new Response('jobs not configured', { status: 500 });
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }
  const summary = await seedCatalogue(getDb());
  return Response.json(summary);
}
