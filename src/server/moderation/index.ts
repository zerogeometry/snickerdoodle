import { eq } from 'drizzle-orm';
import { assets, auditRecords } from '@/db/schema';
import type { DbHandle } from '../db';
import { defaultProviders, type ModerationProviders } from './providers';

export type ModerationState = 'CLEAR' | 'FLAGGED' | 'BLOCKED';
export interface ModerationVerdict {
  status: ModerationState;
  labels: string[];
}

/**
 * The automated content-safety decision (D8). The CSAM hash-check runs FIRST and
 * takes precedence: a match is BLOCKED — preserve, never view/redistribute,
 * report per the runbook. Otherwise the classifier may FLAG into the review queue
 * (it never auto-rejects a child's drawing). No match + not flagged → CLEAR.
 */
export async function moderateImage(
  input: { buffer: Buffer; sha256: string },
  providers: ModerationProviders = defaultProviders(),
): Promise<ModerationVerdict> {
  if (await providers.hash.isKnownIllegal({ sha256: input.sha256, buffer: input.buffer })) {
    return { status: 'BLOCKED', labels: ['csam-hash-match'] };
  }
  const c = await providers.classifier.classify(input.buffer);
  if (c.flagged) return { status: 'FLAGGED', labels: c.labels };
  return { status: 'CLEAR', labels: [] };
}

/**
 * Run the gate on a freshly-ingested asset and persist the verdict. FLAGGED and
 * BLOCKED outcomes are audited (BLOCKED is the CSAM runbook trigger). The asset is
 * never deleted here — BLOCKED content is preserved for the report; FLAGGED waits
 * for human review. Never auto-rejects, never silently bins.
 */
export async function moderateAndRecord(
  db: DbHandle,
  input: { assetId: string; familyId: string; buffer: Buffer; sha256: string; now?: Date },
  providers?: ModerationProviders,
): Promise<ModerationVerdict> {
  const verdict = await moderateImage({ buffer: input.buffer, sha256: input.sha256 }, providers);
  await db
    .update(assets)
    .set({ moderationStatus: verdict.status, moderatedAt: input.now ?? new Date(), moderationDetail: { labels: verdict.labels } })
    .where(eq(assets.id, input.assetId));
  if (verdict.status !== 'CLEAR') {
    await db.insert(auditRecords).values({
      familyId: input.familyId,
      actorType: 'SYSTEM',
      event: verdict.status === 'BLOCKED' ? 'CONTENT_BLOCKED' : 'CONTENT_FLAGGED',
      targetType: 'asset',
      targetId: input.assetId,
      metadata: { labels: verdict.labels },
    });
  }
  return verdict;
}

export { defaultProviders, isModerationConfigured } from './providers';
export type { ModerationProviders, HashMatchProvider, ClassifierProvider } from './providers';
