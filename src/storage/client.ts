import { S3Client } from '@aws-sdk/client-s3';

/**
 * The S3 client for the PRIVATE originals bucket. Local dev points it at MinIO;
 * production points it at the UK/EU bucket (KMS-encrypted, no public policy).
 * Lazily created so importing this module never requires the env at build time.
 */
let _client: S3Client | null = null;

export interface StorageConfig {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

export function storageConfig(): StorageConfig {
  const region = process.env.S3_REGION ?? 'eu-west-2';
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('S3 storage is not configured (S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET)');
  }
  return {
    endpoint: process.env.S3_ENDPOINT,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

export function getS3(): { client: S3Client; bucket: string } {
  const cfg = storageConfig();
  if (_client === null) {
    _client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  return { client: _client, bucket: cfg.bucket };
}

let _presignClient: S3Client | null = null;

/**
 * A second client used ONLY to sign browser upload URLs. The SDK's default "flexible checksums"
 * add a checksum of an EMPTY body to a presigned PUT, which real S3 then rejects (the browser
 * sends the real bytes). Checksums are switched to "when required" here so a signed upload URL
 * names only what we mean it to: one key, one size, one content type, the encryption headers.
 */
export function getPresignS3(): { client: S3Client; bucket: string } {
  const cfg = storageConfig();
  if (_presignClient === null) {
    _presignClient = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }
  return { client: _presignClient, bucket: cfg.bucket };
}
