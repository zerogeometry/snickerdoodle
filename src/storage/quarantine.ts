import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getPresignS3, getS3 } from './client';
import { QUARANTINE_PREFIX, deleteObjectConfirmed, encryptionFor, ensureBucket, quarantineKey } from './objects';

/**
 * DIRECT browser → bucket uploads (HOSTING-speed brief, 2026-10-22). The bytes skip the app
 * server, so a big phone photo isn't capped by a serverless request limit — but they land in
 * QUARANTINE, not the keepsake store: a PUT-only, single-key, size-pinned, short-lived URL, minted
 * server-side after the upload is authorised. Nothing can view, render or order a quarantine
 * object; the server's finalise step re-reads it and runs the SAME ingest as before (EXIF strip,
 * CSAM hash-check, moderation), writes the clean original under the asset key, and deletes it.
 */

/** The largest upload accepted (the same 25MB guard the Server Action path applies). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** How long a signed upload URL can START a PUT. S3 checks expiry at the start, so a slow upload
 * that began in time still completes. */
export const DIRECT_UPLOAD_TTL_SECONDS = 300;
/** Quarantine objects are never served, so their type is fixed — the browser can't pick one. */
export const QUARANTINE_CONTENT_TYPE = 'application/octet-stream';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface PresignedUpload {
  /** PUT here, once. */
  url: string;
  /** Send EXACTLY these headers (they're signed — leaving one out, or changing it, is refused). */
  headers: Record<string, string>;
  expiresAt: Date;
}

/** True when a declared size is one we'll sign for: a whole number of bytes, 1 B – 25 MB. */
export function isAcceptableUploadSize(byteSize: unknown): byteSize is number {
  return typeof byteSize === 'number' && Number.isSafeInteger(byteSize) && byteSize > 0 && byteSize <= MAX_UPLOAD_BYTES;
}

/**
 * Sign a PUT for ONE quarantine key. Callers MUST have authorised the upload first. Signed:
 * the host + key, Content-Length (exactly `byteSize` — a bigger or smaller body is refused by the
 * bucket), Content-Type, and the KMS encryption headers (originals key; production refuses to
 * sign without one, as it refuses to store without one).
 */
export async function presignQuarantineUpload(
  uploadId: string,
  byteSize: number,
  opts: { now?: Date; ttlSeconds?: number } = {},
): Promise<PresignedUpload> {
  if (!UUID.test(uploadId)) throw new Error('upload id must be a random UUID');
  if (!isAcceptableUploadSize(byteSize)) throw new Error('upload size out of range');
  const ttlSeconds = Math.min(opts.ttlSeconds ?? DIRECT_UPLOAD_TTL_SECONDS, DIRECT_UPLOAD_TTL_SECONDS);
  const key = quarantineKey(uploadId);
  const sse = encryptionFor(key);
  await ensureBucket();
  const { client, bucket } = getPresignS3();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: QUARANTINE_CONTENT_TYPE, ContentLength: byteSize, ...sse }),
    {
      expiresIn: ttlSeconds,
      signingDate: opts.now,
      signableHeaders: new Set(['content-type', 'content-length']),
      // SSE headers stay HEADERS (signed) rather than query params, so the bucket enforces them.
      unhoistableHeaders: new Set(['x-amz-server-side-encryption', 'x-amz-server-side-encryption-aws-kms-key-id']),
    },
  );
  const headers: Record<string, string> = { 'content-type': QUARANTINE_CONTENT_TYPE };
  if (sse.ServerSideEncryption) headers['x-amz-server-side-encryption'] = sse.ServerSideEncryption;
  if (sse.SSEKMSKeyId) headers['x-amz-server-side-encryption-aws-kms-key-id'] = sse.SSEKMSKeyId;
  return { url, headers, expiresAt: new Date((opts.now ?? new Date()).getTime() + ttlSeconds * 1000) };
}

/** Size + age of a stored object, or null when there isn't one. */
export async function headObject(key: string): Promise<{ byteSize: number; lastModified: Date | null } | null> {
  const { client, bucket } = getS3();
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { byteSize: res.ContentLength ?? 0, lastModified: res.LastModified ?? null };
  } catch {
    return null;
  }
}

/** Every quarantine object with its age (for the orphan sweep). */
export async function listQuarantine(): Promise<{ key: string; lastModified: Date | null }[]> {
  const { client, bucket } = getS3();
  const out: { key: string; lastModified: Date | null }[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: QUARANTINE_PREFIX, ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key) out.push({ key: o.Key, lastModified: o.LastModified ?? null });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/**
 * Delete a quarantine object for good. On a VERSIONED bucket (production — see
 * project-office/ops/BACKUPS-AND-ERASURE.md) a plain delete only adds a delete marker and the raw
 * bytes (EXIF/GPS and all) would linger as a non-current version; so every version and marker of
 * this exact key is removed too. The lifecycle rule on quarantine/ is the backstop.
 */
export async function deleteQuarantineObject(key: string): Promise<void> {
  if (!key.startsWith(QUARANTINE_PREFIX)) throw new Error('not a quarantine key');
  await deleteObjectConfirmed(key); // every version and marker of this exact key (src/storage/objects.ts)
}
