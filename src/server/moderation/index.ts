import { eq } from 'drizzle-orm';
import { assets, auditRecords } from '@/db/schema';
import type { DbHandle } from '../db';
import { createHash } from 'node:crypto';
import { defaultProviders, isModerationConfigured, type ModerationProviders } from './providers';
import { containsAbusiveText } from '../textSafety';

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
    .set({ moderationStatus: status, moderatedAt: input.now ?? new Date(), moderationDetail: { labels, original: { status, labels } } })
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

// ── Studio designs ───────────────────────────────────────────────────────────
// A design can carry things the upload never had: pen lines, shapes, words. Anything drawn or
// added in the Studio is screened like an upload BEFORE it can reach a print order — the same
// classifier (it reads illustrations, not just photos), plus OCR so hand-drawn words get the
// same abuse screen as typed ones. Same D8 rules: it FLAGS for review, never auto-rejects.
// The asset's status is the WORSE of the upload's verdict and the design's, so a clean design
// can never clear a flagged upload (and a flagged design holds a clean upload back).

const RANK: Record<ModerationState | 'PENDING', number> = { CLEAR: 0, PENDING: 1, FLAGGED: 2, BLOCKED: 3 };
type Stored = { status: ModerationState | 'PENDING'; labels: string[] };
const worse = (a: Stored, b: Stored): Stored => (RANK[b.status] > RANK[a.status] ? b : a);

async function originalVerdict(db: DbHandle, assetId: string): Promise<Stored> {
  const [row] = await db.select({ status: assets.moderationStatus, detail: assets.moderationDetail }).from(assets).where(eq(assets.id, assetId));
  const d = (row?.detail ?? {}) as { labels?: string[]; original?: Stored; design?: Stored };
  // assets screened before designs were tracked: the stored status IS the upload's
  return d.original ?? { status: row?.status ?? 'PENDING', labels: d.labels ?? [] };
}

/** Screen a Studio design (anything drawn / added) and fold its verdict into the asset's. */
export async function moderateDesignAndRecord(
  db: DbHandle,
  input: { assetId: string; familyId: string | null; buffer: Buffer; now?: Date },
  providers?: ModerationProviders,
  env: Record<string, string | undefined> = process.env,
): Promise<ModerationVerdict> {
  let design: Stored;
  if (!providers && env.NODE_ENV === 'production' && !isModerationConfigured(env)) {
    design = { status: 'FLAGGED', labels: ['screening-not-configured'] };
  } else {
    const p = providers ?? defaultProviders(env);
    const [c, words] = await Promise.all([p.classifier.classify(input.buffer), p.textReader ? p.textReader.read(input.buffer).catch(() => null) : Promise.resolve([])]);
    const labels = Array.isArray(c?.labels) ? c.labels.map((l) => String(l)) : [];
    // a reader that FAILED is not a clean read — route to review rather than wave it through
    if (words === null) labels.push('text-unreadable');
    else if (words.length && containsAbusiveText(words.join(' '))) labels.push('drawn-words');
    design = { status: c?.flagged === true || labels.length ? 'FLAGGED' : c?.flagged === false ? 'CLEAR' : 'FLAGGED', labels };
  }
  const original = await originalVerdict(db, input.assetId);
  const combined = worse(original, design);
  await db
    .update(assets)
    .set({ moderationStatus: combined.status, moderatedAt: input.now ?? new Date(), moderationDetail: { labels: [...new Set([...original.labels, ...design.labels])], original, design } })
    .where(eq(assets.id, input.assetId));
  if (design.status !== 'CLEAR') {
    await db.insert(auditRecords).values({
      familyId: input.familyId,
      actorType: 'SYSTEM',
      event: 'CONTENT_FLAGGED',
      targetType: 'asset',
      targetId: input.assetId,
      metadata: { labels: design.labels, source: 'studio-design' },
    });
  }
  return { status: design.status === 'PENDING' ? 'FLAGGED' : design.status, labels: design.labels };
}

/** The design was dropped (back to the plain upload, or nothing added): only the upload's verdict counts. */
export async function clearDesignModeration(db: DbHandle, assetId: string): Promise<void> {
  const [row] = await db.select({ detail: assets.moderationDetail }).from(assets).where(eq(assets.id, assetId));
  const d = (row?.detail ?? {}) as { design?: Stored };
  if (!d.design) return;
  const original = await originalVerdict(db, assetId);
  await db.update(assets).set({ moderationStatus: original.status, moderationDetail: { labels: original.labels, original } }).where(eq(assets.id, assetId));
}

export { defaultProviders, isModerationConfigured } from './providers';
export type { ModerationProviders, HashMatchProvider, ClassifierProvider, TextReaderProvider } from './providers';
