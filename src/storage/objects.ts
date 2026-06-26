import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

/** Key for a derived render of an asset (cutout / upscaled / printfile). */
export function derivativeKey(assetId: string, kind: string): string {
  return `assets/${assetId}/derivatives/${kind}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { client, bucket } = getS3();
  await ensureBucket();
  const kmsKeyAlias = process.env.S3_KMS_KEY_ALIAS;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // At-rest KMS encryption in production (separate key for originals); MinIO
      // dev has no KMS, so this is only set when an alias is configured.
      ...(kmsKeyAlias ? { ServerSideEncryption: 'aws:kms' as const, SSEKMSKeyId: kmsKeyAlias } : {}),
    }),
  );
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

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getS3();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Delete an object and CONFIRM it's gone, retrying a few times. Used by the
 * retention purge so a child's original is provably removed from the provider
 * (not just best-effort) before the DB record is dropped.
 */
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
