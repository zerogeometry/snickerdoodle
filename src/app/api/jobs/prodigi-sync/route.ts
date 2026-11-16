import { getDb } from '@/db/client';
import { requireJobsSecret } from '@/server/jobs/auth';
import { isProdigiConfigured } from '@/server/prodigi/client';
import { syncProdigiCatalogue } from '@/server/prodigi/sync';
import { prodigiSpecAlert } from '@/server/prodigi/specAlert';
import { sendMail } from '@/server/mail';
import { SUPPORT_EMAIL } from '@/lib/support';

/**
 * Prodigi catalogue sync — validate every mapped SKU against the live API + enrich
 * specs. Triggered like the other jobs: a scheduler POSTs with the JOBS_SECRET. The
 * call sends NO image (metadata only), so it's safe to run before the LG3/LG6 gates.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  if (!isProdigiConfigured()) return new Response('prodigi not configured (PRODIGI_API_KEY unset)', { status: 503 });

  const report = await syncProdigiCatalogue(getDb());
  // a mismatch (a print size Prodigi changed, a product gone) reaches the team's inbox, not just the log
  const alert = prodigiSpecAlert(report);
  if (alert) {
    try {
      await sendMail({ kind: 'order-ops', to: (process.env.SUPPORT_INBOX ?? '').trim() || SUPPORT_EMAIL, ...alert });
    } catch (err) {
      console.error('[prodigi-sync] the alert email failed:', err instanceof Error ? err.message : 'unknown');
    }
  }
  return Response.json(report);
}
