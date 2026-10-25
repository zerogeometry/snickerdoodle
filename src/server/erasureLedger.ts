import { randomUUID } from 'node:crypto';
import { ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { and, eq, like, not } from 'drizzle-orm';
import { accounts, assets, children, memberships, profileImages } from '@/db/schema';
import { encryptionFor, ensureBucket, getObjectBytes, getS3 } from '@/storage';
import type { DbHandle } from './db';

/**
 * The erasure ledger: a record, OUTSIDE the database, of every erasure we perform — ids only, no
 * names, no content. Why: database backups are short-lived (14 days) but a restore would bring
 * back anything deleted since that backup. After any restore we replay this ledger
 * (reapplyErasuresSince) so deleted data stays deleted — the ICO's "beyond use" expectation.
 *
 * Stored as one small object per event under `erasure-ledger/<ISO time>-<uuid>.json` (keys sort
 * by time). A bucket lifecycle rule expires the prefix after 30 days — longer than the backup
 * window, so nothing is ever needed after that (see project-office/ops/BACKUPS-AND-ERASURE.md).
 * Writing is best-effort: the erasure itself has already happened. A write is tried a few times
 * (S3 hiccups are the realistic failure), then a failure is logged loudly — the
 * "[erasure-ledger] FAILED" line the box's log alarm watches (ops/AWS-LONDON-RUNBOOK.md §7).
 * Each entry is KMS-encrypted with the general key like every other object we store, so a bucket
 * that refuses unencrypted writes can never quietly drop it.
 */
export type ErasureEntry =
  | { kind: 'asset'; id: string }
  | { kind: 'child'; id: string }
  | { kind: 'profile-image'; id: string }
  | { kind: 'membership'; familyId: string; accountId: string; status: 'REMOVED' | 'LEFT' }
  | { kind: 'account'; id: string; handOver?: { familyId: string; newOwnerAccountId: string } | null };

export const LEDGER_PREFIX = 'erasure-ledger/';

const WRITE_ATTEMPTS = 3;

export async function recordErasure(entry: ErasureEntry, at = new Date(), retryDelayMs = 250): Promise<void> {
  const key = `${LEDGER_PREFIX}${at.toISOString()}-${randomUUID()}.json`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
    try {
      const { client, bucket } = getS3();
      await ensureBucket();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify({ ...entry, at: at.toISOString() }),
          ContentType: 'application/json',
          ...encryptionFor(key),
        }),
      );
      return;
    } catch (e) {
      lastError = e;
      if (attempt < WRITE_ATTEMPTS) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
    }
  }
  console.error('[erasure-ledger] FAILED to record an erasure — replay after a restore would miss it', entry, lastError);
}

export async function listErasuresSince(since: Date): Promise<(ErasureEntry & { at: string })[]> {
  const { client, bucket } = getS3();
  const out: (ErasureEntry & { at: string })[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: LEDGER_PREFIX, StartAfter: `${LEDGER_PREFIX}${since.toISOString()}`, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) {
      if (!o.Key) continue;
      out.push(JSON.parse((await getObjectBytes(o.Key)).toString('utf8')));
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export interface ReplaySummary {
  entries: number;
  reapplied: number;
  alreadyGone: number;
  failed: { entry: ErasureEntry; error: string }[];
}

/**
 * After restoring the database from a backup taken at `since`: re-apply every erasure recorded
 * since then, in order. Idempotent — anything already gone is counted and skipped.
 */
export async function reapplyErasuresSince(db: DbHandle, since: Date, now = new Date()): Promise<ReplaySummary> {
  // imported lazily: these modules record to this ledger themselves
  const { eraseAsset } = await import('./assets');
  const { closeAccount } = await import('./accountClosure');
  const entries = await listErasuresSince(since);
  const summary: ReplaySummary = { entries: entries.length, reapplied: 0, alreadyGone: 0, failed: [] };

  for (const entry of entries) {
    try {
      if (entry.kind === 'asset') {
        const [row] = await db.select({ id: assets.id, familyId: assets.familyId }).from(assets).where(eq(assets.id, entry.id));
        if (!row) {
          summary.alreadyGone++;
          continue;
        }
        await db.update(children).set({ avatarAssetId: null }).where(eq(children.avatarAssetId, row.id));
        await eraseAsset(db, row, { accountId: null, actorType: 'SYSTEM' }, { reason: 'reapplied-after-restore' }, { skipLedger: true });
      } else if (entry.kind === 'child') {
        const [row] = await db.select({ id: children.id }).from(children).where(eq(children.id, entry.id));
        if (!row) {
          summary.alreadyGone++;
          continue;
        }
        await db.update(assets).set({ childSubjectId: null }).where(eq(assets.childSubjectId, row.id));
        await db.delete(children).where(eq(children.id, row.id));
      } else if (entry.kind === 'profile-image') {
        const [row] = await db.select().from(profileImages).where(eq(profileImages.id, entry.id));
        if (!row) {
          summary.alreadyGone++;
          continue;
        }
        const { eraseProfileImage } = await import('./profile');
        await eraseProfileImage(db, row, { skipLedger: true });
      } else if (entry.kind === 'membership') {
        const res = await db
          .update(memberships)
          .set({ status: entry.status, revokedAt: now })
          .where(and(eq(memberships.familyId, entry.familyId), eq(memberships.accountId, entry.accountId), eq(memberships.status, 'ACTIVE')))
          .returning({ id: memberships.id });
        if (!res.length) {
          summary.alreadyGone++;
          continue;
        }
      } else {
        const [open] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, entry.id), not(like(accounts.email, 'closed-%'))));
        if (!open) {
          summary.alreadyGone++;
          continue;
        }
        const res = await closeAccount(db, entry.id, now, { handOver: entry.handOver ?? null, skipLedger: true });
        if (!res.ok) throw new Error(`closeAccount refused: ${res.reason}`);
      }
      summary.reapplied++;
    } catch (e) {
      summary.failed.push({ entry, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return summary;
}
