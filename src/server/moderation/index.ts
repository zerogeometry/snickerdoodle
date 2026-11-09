import { eq } from 'drizzle-orm';
import { assets, auditRecords } from '@/db/schema';
import type { DbHandle } from '../db';
import { createHash } from 'node:crypto';
import { defaultProviders, isModerationConfigured, type ModerationProviders } from './providers';
import { containsAbusiveText } from '../textSafety';
import { HASH_UNCHECKED_LABEL, SCREENING_NOT_CONFIGURED_LABEL } from '@/authz/review';
import { VIEWABLE_WITHOUT_HASH_CHECK } from './config';

const sha256Hex = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export type ModerationState = 'CLEAR' | 'FLAGGED' | 'BLOCKED';
export interface ModerationVerdict {
  status: ModerationState;
  labels: string[];
  /** Set only when the known-CSAM hash check was skipped by founder decision D25. */
  hashCheck?: 'deferred';
  /** With a deferred hash check: may a reviewer look at it? true = remove-only (src/authz/review.ts). */
  sensitive?: boolean;
}

/** Labels for a check that couldn't give an answer — the item is held for review, never CLEARed. */
export const CLASSIFIER_ERROR_LABEL = 'classifier-error';
/** Words written in the picture matched the abuse list. */
export const DRAWN_WORDS_LABEL = 'drawn-words';
/** The words-in-the-picture check failed — not a clean read, so held for review. */
export const TEXT_UNREADABLE_LABEL = 'text-unreadable';
export { HASH_UNCHECKED_LABEL };

/** Read the words in a picture and screen them. null = nothing to flag. */
async function screenWords(providers: ModerationProviders, buffer: Buffer): Promise<string | null> {
  if (!providers.textReader) return null;
  let words: string[];
  try {
    words = await providers.textReader.read(buffer);
  } catch (e) {
    providerFailed('text reader', e);
    return TEXT_UNREADABLE_LABEL;
  }
  if (!Array.isArray(words)) return TEXT_UNREADABLE_LABEL;
  return words.length && containsAbusiveText(words.join(' ')) ? DRAWN_WORDS_LABEL : null;
}

/**
 * With the hash check deferred (D25), could a reviewer be looking at abuse material if they opened
 * this? Anything but a definite, known, non-sexual category says yes (fail-safe).
 */
function isSensitive(c: { flagged?: unknown; categories?: unknown } | null): boolean {
  if (!c) return true; // the classifier failed: we don't know what it is
  if (c.flagged !== true) return c.flagged !== false; // clean = not sensitive; unreadable = sensitive
  if (!Array.isArray(c.categories) || c.categories.length === 0) return true;
  return c.categories.some((cat) => !VIEWABLE_WITHOUT_HASH_CHECK.includes(String(cat)));
}

/** Log that a provider failed — the error's name only: never its details, an image or a credential. */
const providerFailed = (which: string, e: unknown) => console.warn(`[moderation] ${which} failed (${e instanceof Error ? e.name : typeof e}) — held for review`);

/**
 * The automated content-safety decision (D8). The CSAM hash-check runs FIRST and
 * takes precedence: a match is BLOCKED — preserve, never view/redistribute,
 * report per the runbook. Otherwise the classifier may FLAG into the review queue
 * (it never auto-rejects a child's drawing). No match + not flagged → CLEAR.
 *
 * FAIL-SAFE: only a definite "no match" passes the hash gate and only a definite "not flagged"
 * is CLEAR. A provider that throws, times out or answers in an unexpected shape holds the item
 * for review. A hash check that couldn't run is labelled HASH_UNCHECKED_LABEL — the classifier
 * is skipped (no point sending the picture on), and review can neither show nor clear it
 * (src/authz/review.ts).
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
  const deferred = providers.hash === null;
  if (!deferred) {
    const hashInput = input.originalBuffer
      ? { buffer: input.originalBuffer, sha256: input.originalSha256 ?? sha256Hex(input.originalBuffer) }
      : { buffer: input.buffer, sha256: input.sha256 };
    let known: unknown;
    try {
      known = await providers.hash!.isKnownIllegal(hashInput);
    } catch (e) {
      providerFailed('hash check', e);
      known = undefined;
    }
    if (known === true) return { status: 'BLOCKED', labels: ['csam-hash-match'] };
    if (known !== false) return { status: 'FLAGGED', labels: [HASH_UNCHECKED_LABEL] };
  }

  // The classifier (nudity, violence, hate symbols, rude gestures) and the words written in the
  // picture, side by side. Either one failing holds the item; neither can CLEAR on its own.
  const [c, wordsLabel] = await Promise.all([
    providers.classifier.classify(input.buffer).then(
      // an answer that isn't even an object is a failed check, never a clean one
      (r) => (r && typeof r === 'object' ? (r as { flagged?: unknown; labels?: unknown; categories?: unknown }) : null),
      (e) => (providerFailed('classifier', e), null),
    ),
    screenWords(providers, input.buffer),
  ]);
  const extra = (v: Omit<ModerationVerdict, 'hashCheck' | 'sensitive'>): ModerationVerdict =>
    deferred ? { ...v, hashCheck: 'deferred', sensitive: v.status === 'CLEAR' ? false : isSensitive(c) } : v;

  if (c === null) return extra({ status: 'FLAGGED', labels: wordsLabel ? [CLASSIFIER_ERROR_LABEL, wordsLabel] : [CLASSIFIER_ERROR_LABEL] });
  if (c.flagged === false && !wordsLabel) return extra({ status: 'CLEAR', labels: [] });
  const labels = Array.isArray(c.labels) ? c.labels.map((l) => String(l)) : [];
  if (c.flagged !== true && c.flagged !== false) labels.push(CLASSIFIER_ERROR_LABEL);
  if (wordsLabel) labels.push(wordsLabel);
  return extra({ status: 'FLAGGED', labels });
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
    ? { status: 'FLAGGED', labels: [SCREENING_NOT_CONFIGURED_LABEL] }
    : await moderateImage({ buffer: input.buffer, sha256: input.sha256, originalBuffer: input.originalBuffer }, providers);
  // Fail-safe (D8): a malformed/unrecognised verdict routes to human review — NEVER
  // silently CLEAR. Defends the gate against a future provider returning garbage.
  const status: ModerationState = raw.status === 'CLEAR' || raw.status === 'FLAGGED' || raw.status === 'BLOCKED' ? raw.status : 'FLAGGED';
  const labels = Array.isArray(raw.labels) ? raw.labels.map((l) => String(l)) : [];
  // D25: remember that the hash check was deferred, and whether a reviewer may look (fail-safe: sensitive)
  const deferral = raw.hashCheck === 'deferred' ? { hashCheck: 'deferred' as const, sensitive: raw.sensitive !== false } : {};

  await db
    .update(assets)
    .set({ moderationStatus: status, moderatedAt: input.now ?? new Date(), moderationDetail: { labels, original: { status, labels, ...deferral } } })
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
  return { status, labels, ...deferral };
}

// ── Studio designs ───────────────────────────────────────────────────────────
// A design can carry things the upload never had: pen lines, shapes, words. Anything drawn or
// added in the Studio is screened like an upload BEFORE it can reach a print order — the same
// classifier (it reads illustrations, not just photos), plus OCR so hand-drawn words get the
// same abuse screen as typed ones. Same D8 rules: it FLAGS for review, never auto-rejects.
// The asset's status is the WORSE of the upload's verdict and the design's, so a clean design
// can never clear a flagged upload (and a flagged design holds a clean upload back).

const RANK: Record<ModerationState | 'PENDING', number> = { CLEAR: 0, PENDING: 1, FLAGGED: 2, BLOCKED: 3 };
type Stored = { status: ModerationState | 'PENDING'; labels: string[]; hashCheck?: 'deferred'; sensitive?: boolean };
const worse = (a: Stored, b: Stored): Stored => (RANK[b.status] > RANK[a.status] ? b : a);

async function originalVerdict(db: DbHandle, assetId: string): Promise<Stored> {
  const [row] = await db.select({ status: assets.moderationStatus, detail: assets.moderationDetail }).from(assets).where(eq(assets.id, assetId));
  const d = (row?.detail ?? {}) as { labels?: string[]; original?: Stored; design?: Stored };
  // assets screened before designs were tracked: the stored status IS the upload's
  return d.original ?? { status: row?.status ?? 'PENDING', labels: d.labels ?? [] };
}

/**
 * An OPEN viewer report outlives any re-screen (gap audit, 27 Oct): a Studio re-save or a dropped
 * design re-derives the status from the screening verdicts, and must never quietly clear a keepsake a
 * viewer reported. Only a reviewer's "clear" resolves a report (src/server/admin/review.ts).
 */
async function openReports(db: DbHandle, assetId: string): Promise<{ reports: unknown[]; labels: string[] } | null> {
  const [row] = await db.select({ detail: assets.moderationDetail }).from(assets).where(eq(assets.id, assetId));
  const d = (row?.detail ?? {}) as { reports?: unknown; labels?: string[] };
  if (!Array.isArray(d.reports) || d.reports.length === 0) return null;
  return { reports: d.reports, labels: (d.labels ?? []).filter((l) => l.startsWith('reported')) };
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
    design = { status: 'FLAGGED', labels: [SCREENING_NOT_CONFIGURED_LABEL] };
  } else {
    const p = providers ?? defaultProviders(env);
    // a classifier that FAILED is not a clean result either — held for review, never CLEAR
    const [c, words] = await Promise.all([
      p.classifier.classify(input.buffer).catch((e) => (providerFailed('classifier', e), null)),
      p.textReader ? p.textReader.read(input.buffer).catch((e) => (providerFailed('text reader', e), null)) : Promise.resolve([]),
    ]);
    const labels = Array.isArray(c?.labels) ? c.labels.map((l) => String(l)) : [];
    if (c === null) labels.push(CLASSIFIER_ERROR_LABEL);
    // a reader that FAILED is not a clean read — route to review rather than wave it through
    if (words === null) labels.push(TEXT_UNREADABLE_LABEL);
    else if (words.length && containsAbusiveText(words.join(' '))) labels.push(DRAWN_WORDS_LABEL);
    design = { status: c?.flagged === true || labels.length ? 'FLAGGED' : c?.flagged === false ? 'CLEAR' : 'FLAGGED', labels };
    // the design shows the upload too: with the hash check deferred, a sexual/unknown flag is remove-only
    if (p.hash === null && design.status !== 'CLEAR') design.sensitive = isSensitive(c);
  }
  const original = await originalVerdict(db, input.assetId);
  const combined = worse(original, design);
  const held = await openReports(db, input.assetId);
  await db
    .update(assets)
    .set({
      moderationStatus: held ? 'FLAGGED' : combined.status,
      moderatedAt: input.now ?? new Date(),
      moderationDetail: { labels: [...new Set([...(held?.labels ?? []), ...original.labels, ...design.labels])], original, design, ...(held ? { reports: held.reports } : {}) },
    })
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
  const held = await openReports(db, assetId);
  await db
    .update(assets)
    .set({
      moderationStatus: held ? 'FLAGGED' : original.status,
      moderationDetail: { labels: [...new Set([...(held?.labels ?? []), ...original.labels])], original, ...(held ? { reports: held.reports } : {}) },
    })
    .where(eq(assets.id, assetId));
}

export { defaultProviders, isModerationConfigured } from './providers';
export type { ModerationProviders, HashMatchProvider, ClassifierProvider, TextReaderProvider } from './providers';
