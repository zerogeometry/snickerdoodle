import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
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
 * Delete an object and CONFIRM it's gone, retrying a few times. Used by the
 * retention purge so a child's original is provably removed from the provider
 * (not just best-effort) before the DB record is dropped.
 */
/**
 * Delete EVERY object under a prefix (confirmed, one by one) — the erasers' last sweep of an asset's
 * folder, AFTER its row is gone, so a derivative written while the erase was running (a late mockup:
 * 08-B8) can't outlive the keepsake untracked. Returns how many it removed.
 */
export async function deleteAllUnderPrefix(prefix: string): Promise<number> {
  if (!prefix.endsWith('/') || prefix.length < 3) throw new Error('refusing to sweep a prefix that is not a folder');
  const { client, bucket } = getS3();
  let removed = 0;
  let token: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      await deleteObjectConfirmed(o.Key);
      removed++;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return removed;
}

export async function deleteObjectConfirmed(key: string, attempts = 3): Promise<void> {
  const { client, bucket } = getS3();
  for (let i = 0; i < attempts; i++) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      // still present — loop and try again
    } catch {
      return; // HEAD failed ⇒ confirmed gone
    }
  }
  throw new Error(`could not confirm deletion of ${key}`);
}
