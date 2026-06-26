import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { AuthzError, canContributeCreations, type ViewerContext } from '@/authz';
import { assets, children, storageObjects } from '@/db/schema';
import { getS3, originalKey, putObject, stripExif } from '@/storage';
import type { DbHandle } from './db';
import { moderateAndRecord, type ModerationState } from './moderation';
import { RETENTION_DAYS } from './retention';

/** Matches the `asset_kind` enum in the schema. */
export type AssetKind = 'DRAWING' | 'PHOTO';

export interface IngestInput {
  familyId: string;
  kind: AssetKind;
  /** When set, the asset is OF this child; its controlling parent becomes controller. */
  childSubjectId?: string | null;
  buffer: Buffer;
  /** Keep it in the family keepsake home (exempt from the retention purge). */
  keptInHome?: boolean;
}

export interface IngestResult {
  assetId: string;
  key: string;
  sha256: string;
  byteSize: number;
  contentType: string;
  /** Result of the content-safety gate run on ingest (D8). */
  moderationStatus: ModerationState;
}

/**
 * Ingest an uploaded original (CLAUDE.md children's-data rules):
 *  1. authz — the actor must be an ACTIVE family member who can CONTRIBUTE;
 *  2. strip EXIF/GPS before the bytes are ever written;
 *  3. store in the PRIVATE bucket;
 *  4. record the asset (visibility defaults to FAMILY) + a write-once ORIGINAL
 *     storage_object (sha256, exifStripped) — the source of truth for retention.
 *
 * The controller is resolved server-side: the child's controlling parent for a
 * child's asset, otherwise the uploader. Never keyed on the raw client.
 */
export async function ingestOriginalAsset(
  db: DbHandle,
  viewer: ViewerContext,
  input: IngestInput,
): Promise<IngestResult> {
  if (viewer.accountId === null || !canContributeCreations(viewer.membership)) {
    throw new AuthzError({ allowed: false, reason: 'not allowed to add a creation to this family' });
  }
  // Defence-in-depth: the resolved membership must be for THIS family.
  if (viewer.membership!.familyId !== input.familyId) {
    throw new AuthzError({ allowed: false, reason: 'membership is not in the target family' });
  }

  let controllerAccountId = viewer.accountId;
  if (input.childSubjectId) {
    const [child] = await db.select().from(children).where(eq(children.id, input.childSubjectId));
    if (!child || child.familyId !== input.familyId) {
      throw new AuthzError({ allowed: false, reason: 'child subject not in this family' });
    }
    controllerAccountId = child.controllerAccountId; // the controlling parent
  }

  const sanitised = await stripExif(input.buffer); // EXIF/GPS gone before storage
  const assetId = randomUUID();
  const key = originalKey(assetId);
  await putObject(key, sanitised.buffer, sanitised.contentType);

  const kept = input.keptInHome ?? false;
  // Retention (CLAUDE.md): a kept keepsake lives until the parent deletes it; an
  // un-kept upload is scheduled for purge so a child's image never lingers.
  const purgeAfter = kept ? null : new Date(Date.now() + RETENTION_DAYS * 86_400_000);

  await db.insert(assets).values({
    id: assetId,
    familyId: input.familyId,
    kind: input.kind,
    uploaderAccountId: viewer.accountId,
    childSubjectId: input.childSubjectId ?? null,
    controllerAccountId,
    visibility: 'FAMILY', // privacy by default
    keptInHome: kept,
    purgeAfter,
  });

  const { bucket } = getS3();
  await db.insert(storageObjects).values({
    assetId,
    objectClass: 'ORIGINAL',
    bucket,
    key,
    contentType: sanitised.contentType,
    byteSize: sanitised.byteSize,
    sha256: sanitised.sha256,
    writeOnce: true,
    exifStripped: true,
    kmsKeyAlias: process.env.S3_KMS_KEY_ALIAS ?? null,
  });

  // Content-safety gate (D8): run BEFORE this asset can ever reach a print order.
  // The bytes are already stored (BLOCKED content is preserved for the runbook);
  // the verdict gates ordering + viewing downstream.
  const verdict = await moderateAndRecord(db, { assetId, familyId: input.familyId, buffer: sanitised.buffer, sha256: sanitised.sha256 });

  return { assetId, key, sha256: sanitised.sha256, byteSize: sanitised.byteSize, contentType: sanitised.contentType, moderationStatus: verdict.status };
}
