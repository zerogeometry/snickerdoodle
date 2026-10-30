import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isTestSite, testSiteProblems } from '@/lib/siteMode';
import { getS3 } from './client';

let bucketReady = false;

/** Create the private bucket if it doesn't exist (MinIO/dev). No public policy is
 * ever set — the bucket is private and reachable only via signed URLs. */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const { client, bucket } = getS3();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch {
      /* already exists / created concurrently */
    }
  }
  bucketReady = true;
}

/** The deterministic key for an asset's preserved ORIGINAL. */
export function originalKey(assetId: string): string {
  return `assets/${assetId}/original`;
}

/** Where a browser's DIRECT upload lands before the server has checked it (see ./quarantine). */
export const QUARANTINE_PREFIX = 'quarantine/';

/** The quarantine key for one direct upload. Never an asset key: nothing can view, render or order it. */
export function quarantineKey(uploadId: string): string {
  return `${QUARANTINE_PREFIX}${uploadId}`;
}

/** Key for a derived render of an asset (cutout / upscaled / printfile). */
/** Every object stored for an asset lives under this prefix (its original and all derivatives). */
export function assetPrefix(assetId: string): string {
  return `assets/${assetId}/`;
}

export function derivativeKey(assetId: string, kind: string): string {
  return `assets/${assetId}/derivatives/${kind}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { client, bucket } = getS3();
  await ensureBucket();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...encryptionFor(key),
    }),
  );
}

/**
 * At-rest encryption for an object. ORIGINALS use their own KMS key (tightest policy,
 * independent rotation — CLAUDE.md "separate keys for originals"); everything else the general
 * key. A QUARANTINE upload is a raw original (EXIF/GPS still in it), so it gets the originals key
 * too. In PRODUCTION a missing key is a hard error, never a silently unencrypted child's image.
 * Local MinIO has no KMS, so dev without aliases writes plain objects.
 */
export function encryptionFor(
  key: string,
  env: Record<string, string | undefined> = process.env,
): { ServerSideEncryption?: 'aws:kms'; SSEKMSKeyId?: string } {
  const isOriginal = /\/original$/.test(key) || key.startsWith(QUARANTINE_PREFIX);
  const alias = isOriginal ? env.S3_KMS_KEY_ALIAS_ORIGINALS : env.S3_KMS_KEY_ALIAS;
  if (alias) return { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: alias };
  // TEST SITE only (src/lib/siteMode.ts): the storage provider's own at-rest encryption stands in
  // for our KMS keys. Test drawings only; the real site still refuses (below).
  if (isTestSite(env) && testSiteProblems(env).length === 0) return {};
  if (env.NODE_ENV === 'production') {
    throw new Error(`${isOriginal ? 'S3_KMS_KEY_ALIAS_ORIGINALS' : 'S3_KMS_KEY_ALIAS'} is required in production — refusing to store unencrypted`);
  }
  return {};
}

/** Read an object's bytes server-side (e.g. to render a print file from it). */
export async function getObjectBytes(key: string): Promise<Buffer> {
  const { client, bucket } = getS3();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

/** A short-lived, scoped GET URL. Callers MUST authz-check before minting one. */
export async function presignDownload(key: string, ttlSeconds = 120): Promise<string> {
  const { client, bucket } = getS3();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSeconds });
}

/**
 * A PROVIDER-INGESTION GET URL — the separate policy from interactive viewing
 * (CLAUDE.md security): longer-lived than interactive links because the POD downloads
 * asynchronously and retries (Prodigi: up to 10 attempts) — but kept to 24h so a print file
 * link never outlives the job (a resubmission mints a fresh one). Mint ONLY from the
 * fulfilment submitter, and ONLY after {@link assertPodEgressAllowed} has
 * authorised THIS asset's egress — this URL leaving the VPC IS the egress event.
 * In production these should sign with dedicated ingestion credentials.
 */
export async function presignProviderIngest(key: string, ttlSeconds = 60 * 60 * 24): Promise<string> {
  const { client, bucket } = getS3();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSeconds });
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getS3();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Delete an object and CONFIRM it's gone, retrying a few times — EVERY version of it, not just the
 * current one (08-B4). Used by the retention purge and every erase, so a child's original is
 * provably removed from the provider (not just best-effort) before the DB record is dropped.
 */
/** Every key under a prefix that has ANY stored version (current, non-current or a delete marker).
 * A store without versioning answers NotImplemented — then just the current objects. */
async function keysWithVersionsUnder(prefix: string): Promise<string[]> {
  const { client, bucket } = getS3();
  const keys = new Set<string>();
  try {
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;
    do {
      const res = await client.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix, KeyMarker: keyMarker, VersionIdMarker: versionMarker }));
      for (const v of [...(res.Versions ?? []), ...(res.DeleteMarkers ?? [])]) if (v.Key) keys.add(v.Key);
      keyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
      versionMarker = res.IsTruncated ? res.NextVersionIdMarker : undefined;
    } while (keyMarker);
    return [...keys];
  } catch (e) {
    if ((e as { name?: string }).name !== 'NotImplemented') throw e;
  }
  let token: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key) keys.add(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return [...keys];
}

/**
 * Delete EVERY object under a prefix (confirmed, every version, one by one) — the erasers' last sweep
 * of an asset's folder, AFTER its row is gone, so a derivative written while the erase was running
 * (a late mockup: 08-B8) can't outlive the keepsake untracked. Returns how many keys it removed.
 */
export async function deleteAllUnderPrefix(prefix: string): Promise<number> {
  if (!prefix.endsWith('/') || prefix.length < 3) throw new Error('refusing to sweep a prefix that is not a folder');
  const keys = await keysWithVersionsUnder(prefix);
  for (const key of keys) await deleteObjectConfirmed(key);
  return keys.length;
}

/**
 * Remove every stored VERSION (and delete marker) of exactly this key (08-B4). On a versioned bucket
 * (production — project-office/ops/BACKUPS-AND-ERASURE.md) a plain delete only adds a delete marker
 * and the bytes linger as a non-current version until the lifecycle rule expires them; CLAUDE.md
 * says deletion cascades through storage versions, so the app removes them itself. The lifecycle
 * rule stays as the backstop. A store without versions has none to remove.
 */
async function deleteEveryVersion(key: string): Promise<void> {
  const { client, bucket } = getS3();
  let keyMarker: string | undefined;
  let versionMarker: string | undefined;
  do {
    let res;
    try {
      res = await client.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key, KeyMarker: keyMarker, VersionIdMarker: versionMarker }));
    } catch (e) {
      if ((e as { name?: string }).name === 'NotImplemented') return;
      throw e;
    }
    for (const v of [...(res.Versions ?? []), ...(res.DeleteMarkers ?? [])]) {
      if (v.Key !== key || !v.VersionId) continue;
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: v.VersionId }));
    }
    keyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
    versionMarker = res.IsTruncated ? res.NextVersionIdMarker : undefined;
  } while (keyMarker);
}

export async function deleteObjectConfirmed(key: string, attempts = 3): Promise<void> {
  const { client, bucket } = getS3();
  for (let i = 0; i < attempts; i++) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      // still present — loop and try again
    } catch {
      // HEAD failed ⇒ the current version is gone; now the older ones and the delete marker too
      await deleteEveryVersion(key);
      return;
    }
  }
  throw new Error(`could not confirm deletion of ${key}`);
}
