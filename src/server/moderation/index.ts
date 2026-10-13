import { eq } from 'drizzle-orm';
import { assets, auditRecords } from '@/db/schema';
import type { DbHandle } from '../db';
import { createHash } from 'node:crypto';
import { defaultProviders, isModerationConfigured, type ModerationProviders } from './providers';

const sha256Hex = (b: Buffer) => createHash('sha256').update(b).digest('hex');

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
  input: {
    buffer: Buffer;
    sha256: string;
    /** The bytes EXACTLY as uploaded (before EXIF strip / re-encode). Known-image hash lists
     * (IWF) match original files, so the hash check must see these — never our re-encoded copy. */
    originalBuffer?: Buffer;
    originalSha256?: string;
  },
  providers: ModerationProviders = defaultProviders(),
): Promise<ModerationVerdict> {
  const hashInput = input.originalBuffer
    ? { buffer: input.originalBuffer, sha256: input.originalSha256 ?? sha256Hex(input.originalBuffer) }
    : { buffer: input.buffer, sha256: input.sha256 };
  if (await providers.hash.isKnownIllegal(hashInput)) {
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
  input: { assetId: string; familyId: string | null; buffer: Buffer; sha256: string; originalBuffer?: Buffer; now?: Date },
  providers?: ModerationProviders,
  env: Record<string, string | undefined> = process.env,
): Promise<ModerationVerdict> {
  // FAIL CLOSED in production: with no real screening wired (LG6), every upload is held for
  // review — it can never reach a print order, and it is never auto-rejected or binned.
  const unscreened = !providers && env.NODE_ENV === 'production' && !isModerationConfigured(env);
  const raw: ModerationVerdict = unscreened
    ? { status: 'FLAGGED', labels: ['screening-not-configured'] }
    : await moderateImage({ buffer: input.buffer, sha256: input.sha256, originalBuffer: input.originalBuffer }, providers);
  // Fail-safe (D8): a malformed/unrecognised verdict routes to human review — NEVER
  // silently CLEAR. Defends the gate against a future provider returning garbage.
  const status: ModerationState = raw.status === 'CLEAR' || raw.status === 'FLAGGED' || raw.status === 'BLOCKED' ? raw.status : 'FLAGGED';
  const labels = Array.isArray(raw.labels) ? raw.labels.map((l) => String(l)) : [];

  await db
    .update(assets)
    .set({ moderationStatus: status, moderatedAt: input.now ?? new Date(), moderationDetail: { labels } })
    .where(eq(assets.id, input.assetId));
  if (status !== 'CLEAR') {
    await db.insert(auditRecords).values({
      familyId: input.familyId,
      actorType: 'SYSTEM',
      event: status === 'BLOCKED' ? 'CONTENT_BLOCKED' : 'CONTENT_FLAGGED',
      targetType: 'asset',
      targetId: input.assetId,
      metadata: { labels },
    });
  }
  return { status, labels };
}

export { defaultProviders, isModerationConfigured } from './providers';
export type { ModerationProviders, HashMatchProvider, ClassifierProvider } from './providers';
