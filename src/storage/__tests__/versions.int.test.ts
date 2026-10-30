import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, ListObjectVersionsCommand, PutBucketVersioningCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3 } from '@/storage/client';
import { deleteAllUnderPrefix, deleteObjectConfirmed } from '@/storage';

/**
 * 08-B4 (test sweep 2026-10-29): production's picture bucket is VERSIONED. A plain delete only adds a
 * delete marker, and the bytes linger as a non-current version. CLAUDE.md: deletion cascades through
 * storage versions — so every version and marker goes. Run against a throwaway versioned bucket in
 * the local MinIO (never the shared one).
 */
describe.skipIf(!process.env.S3_ENDPOINT)('08-B4: erasure removes every stored version (integration, versioned bucket)', () => {
  const bucket = `sd-versions-${randomUUID().slice(0, 8)}`;
  const versionsOf = async (prefix: string) => {
    const { client } = getS3();
    const r = await client.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix }));
    return [...(r.Versions ?? []), ...(r.DeleteMarkers ?? [])];
  };
  const put = (key: string, body: string) => getS3().client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));

  beforeAll(async () => {
    vi.stubEnv('S3_BUCKET', bucket);
    const { client } = getS3();
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    await client.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }));
  });
  afterAll(async () => {
    const { client } = getS3();
    for (const v of await versionsOf('')) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: v.Key!, VersionId: v.VersionId! })).catch(() => {});
    await client.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {});
    vi.unstubAllEnvs();
  });

  it('deleteObjectConfirmed leaves no older version and no delete marker behind', async () => {
    const key = `assets/${randomUUID()}/original`;
    await put(key, 'first upload');
    await put(key, 'replaced');
    expect((await versionsOf(key)).length).toBe(2);
    await deleteObjectConfirmed(key);
    expect(await versionsOf(key)).toEqual([]);
  });

  it('the folder sweep also finds a key whose CURRENT version is already a delete marker', async () => {
    const id = randomUUID();
    const key = `assets/${id}/derivatives/mockup-x`;
    await put(key, 'a late mockup');
    await getS3().client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); // plain delete: marker + non-current bytes
    expect((await versionsOf(key)).length).toBe(2);
    expect(await deleteAllUnderPrefix(`assets/${id}/`)).toBe(1);
    expect(await versionsOf(`assets/${id}/`)).toEqual([]);
  });

  it('only that exact key: a neighbour sharing its prefix is untouched', async () => {
    const base = `assets/${randomUUID()}/derivatives/cut`;
    await put(base, 'a');
    await put(`${base}out`, 'b'); // "cutout" starts with "cut"
    await deleteObjectConfirmed(base);
    expect((await versionsOf(base)).map((v) => v.Key)).toEqual([`${base}out`]);
  });
});
