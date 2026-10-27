import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import * as schema from '@/db/schema';
import { assets, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { placeOrder } from '@/server/orders';
import { seedCatalogue } from '@/server/catalogue';
import {
  QUARANTINE_SWEEP_AGE_MS,
  finaliseGuestUpload,
  mintGuestUpload,
  sweepQuarantine,
  type UploadTicket,
} from '@/server/directUpload';
import { deleteObject, deleteQuarantineObject, ensureBucket, getObjectBytes, getS3, hasExif, headObject, putObject, quarantineKey } from '@/storage';
import type { DbHandle } from '@/server/db';

// Spy on the content-safety providers so the test can SEE what each check was given, and
// steer the verdict. Everything else (sharp, MinIO, Postgres) is real.
const safety = vi.hoisted(() => ({
  hashSaw: [] as Buffer[],
  classifierSaw: [] as Buffer[],
  hashMatch: false,
  flag: false,
}));
vi.mock('@/server/moderation/providers', async (orig) => ({
  ...(await orig<typeof import('@/server/moderation/providers')>()),
  defaultProviders: () => ({
    hash: {
      async isKnownIllegal({ buffer }: { buffer: Buffer }) {
        safety.hashSaw.push(buffer);
        return safety.hashMatch;
      },
    },
    classifier: {
      async classify(buffer: Buffer) {
        safety.classifierSaw.push(buffer);
        return safety.flag ? { flagged: true, labels: ['test-flag'] } : { flagged: false, labels: [] };
      },
    },
  }),
}));

/**
 * Direct browser → bucket uploads, end to end against real MinIO + Postgres: the signed URL
 * is scoped to one key and one size; finalise strips EXIF and runs the CSAM hash + moderation;
 * the quarantine object is always removed; an un-finalised upload can never be ordered.
 * Skipped unless DATABASE_URL and S3_ENDPOINT are set.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/** A JPEG carrying EXIF incl. GPS — what a phone camera produces. Big enough to print. */
const phonePhoto = () =>
  sharp({ create: { width: 1200, height: 1200, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestPhone', Model: 'X' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '0/1 7/1 0/1' } })
    .toBuffer();

/** The browser's half: PUT the bytes on the signed URL with exactly the signed headers. */
async function browserPut(url: string, headers: Record<string, string>, body: Buffer): Promise<number> {
  return (await fetch(url, { method: 'PUT', headers, body: new Uint8Array(body) })).status;
}

describe.skipIf(!DB || !S3)('direct uploads via quarantine (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const assetIds: string[] = [];
  const keys: string[] = [];
  /**
   * What THIS object store actually enforces on a presigned PUT — detected, never assumed. MinIO
   * (docker-compose, CI) and S3 verify the signature (key, content-type, SSE headers) and the
   * signed content-length; a store that doesn't (e.g. moto) can't prove those guarantees, so the
   * tests that rely on the BUCKET refusing skip there rather than fail. Everything server-side
   * (finalise re-checks size, type, EXIF, screening) still runs everywhere.
   */
  const store = { verifiesSignatures: true, pinsLength: true };

  /** Mint + PUT, the way the browser does it. */
  async function uploaded(body: Buffer) {
    const m = (await mintGuestUpload({ byteSize: body.byteLength, termsVersion: 'test-direct-v1' }))!;
    keys.push(quarantineKey(m.uploadId));
    expect(await browserPut(m.upload.url, m.upload.headers, body)).toBe(200);
    return { ...m, tickets: [m.ticket] as UploadTicket[] };
  }

  async function finalised(body: Buffer) {
    const u = await uploaded(body);
    const r = await finaliseGuestUpload(db, { uploadId: u.uploadId, tickets: u.tickets });
    if (r.status === 'ingested') {
      assetIds.push(r.assetId);
      keys.push(r.key);
    }
    return { u, r };
  }

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    await ensureBucket();
    const probe = (await mintGuestUpload({ byteSize: 8, termsVersion: 'probe' }))!;
    keys.push(quarantineKey(probe.uploadId));
    store.pinsLength = (await browserPut(probe.upload.url, probe.upload.headers, Buffer.alloc(9))) !== 200;
    const elsewhere = '99999999-8888-4777-8666-555555555555';
    keys.push(quarantineKey(elsewhere));
    store.verifiesSignatures = (await browserPut(probe.upload.url.replace(probe.uploadId, elsewhere), probe.upload.headers, Buffer.alloc(8))) !== 200;
  });

  afterEach(() => {
    safety.hashSaw.length = 0;
    safety.classifierSaw.length = 0;
    safety.hashMatch = false;
    safety.flag = false;
  });

  afterAll(async () => {
    if (assetIds.length) await db.delete(assets).where(inArray(assets.id, assetIds)); // cascades storage_objects
    for (const k of keys) await (k.startsWith('quarantine/') ? deleteQuarantineObject(k) : deleteObject(k)).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  describe('the signed URL', () => {
    it('accepts exactly the declared size — a bigger or smaller body is refused by the bucket', async (ctx) => {
      if (!store.pinsLength) return ctx.skip(); // this store ignores a signed content-length
      const m = (await mintGuestUpload({ byteSize: 1000, termsVersion: 'v' }))!;
      keys.push(quarantineKey(m.uploadId));
      expect(await browserPut(m.upload.url, m.upload.headers, Buffer.alloc(1001))).toBe(403);
      expect(await browserPut(m.upload.url, m.upload.headers, Buffer.alloc(999))).toBe(403);
      expect(await headObject(quarantineKey(m.uploadId))).toBeNull();
      expect(await browserPut(m.upload.url, m.upload.headers, Buffer.alloc(1000))).toBe(200);
    });

    it('writes ONE key: pointing it anywhere else (another upload, an asset original) is refused', async (ctx) => {
      if (!store.verifiesSignatures) return ctx.skip(); // this store doesn't verify presigned signatures
      const m = (await mintGuestUpload({ byteSize: 10, termsVersion: 'v' }))!;
      const victim = '11111111-2222-4333-8444-555555555555';
      const elsewhere = [
        m.upload.url.replace(m.uploadId, victim),
        m.upload.url.replace(`quarantine/${m.uploadId}`, `assets/${victim}/original`),
      ];
      for (const url of elsewhere) expect(await browserPut(url, m.upload.headers, Buffer.alloc(10))).toBe(403);
      expect(await headObject(`assets/${victim}/original`)).toBeNull();
    });

    it('is PUT-only (it can’t read anything back) and the content type is pinned', async (ctx) => {
      if (!store.verifiesSignatures) return ctx.skip();
      const u = await uploaded(Buffer.alloc(10, 1));
      const read = await fetch(u.upload.url);
      expect(read.ok).toBe(false); // the signature is for a PUT; a GET is refused
      expect(Buffer.from(await read.arrayBuffer()).equals(Buffer.alloc(10, 1))).toBe(false);
      expect(await browserPut(u.upload.url, { ...u.upload.headers, 'content-type': 'text/html' }, Buffer.alloc(10))).toBe(403);
    });

    it('with KMS configured, the bucket refuses a PUT that drops the encryption headers; with them it stores encrypted', async (ctx) => {
      if (!store.verifiesSignatures) return ctx.skip(); // the SSE headers are signed — only a verifying store refuses their absence
      vi.stubEnv('S3_KMS_KEY_ALIAS', 'snickerdoodle-local');
      vi.stubEnv('S3_KMS_KEY_ALIAS_ORIGINALS', 'snickerdoodle-local'); // local MinIO's built-in KMS (docker-compose.yml)
      try {
        const m = (await mintGuestUpload({ byteSize: 10, termsVersion: 'v' }))!;
        keys.push(quarantineKey(m.uploadId));
        expect(m.upload.headers['x-amz-server-side-encryption']).toBe('aws:kms');
        expect(await browserPut(m.upload.url, { 'content-type': m.upload.headers['content-type']! }, Buffer.alloc(10))).not.toBe(200);
        expect(await browserPut(m.upload.url, m.upload.headers, Buffer.alloc(10))).toBe(200);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('finalise', () => {
    it('strips EXIF/GPS, hash-checks the bytes EXACTLY as uploaded, classifies the clean copy, and records the verdict', async () => {
      const photo = await phonePhoto();
      expect(await hasExif(photo)).toBe(true);
      const { u, r } = await finalised(photo);
      expect(r.status).toBe('ingested');
      if (r.status !== 'ingested') return;

      // the stored original is clean
      const [obj] = await db.select().from(storageObjects).where(eq(storageObjects.assetId, r.assetId));
      expect(obj!.objectClass).toBe('ORIGINAL');
      expect(obj!.exifStripped).toBe(true);
      expect(obj!.key).toBe(`assets/${r.assetId}/original`);
      const stored = await getObjectBytes(obj!.key);
      expect(await hasExif(stored)).toBe(false);

      // CSAM hash on the untouched upload (known-image lists match original files); classifier on the clean copy
      expect(safety.hashSaw).toHaveLength(1);
      expect(createHash('sha256').update(safety.hashSaw[0]!).digest('hex')).toBe(createHash('sha256').update(photo).digest('hex'));
      expect(safety.classifierSaw).toHaveLength(1);
      expect(await hasExif(safety.classifierSaw[0]!)).toBe(false);

      // an ephemeral, claim-scoped, retention-scheduled draft with the verdict + terms recorded
      const [a] = await db.select().from(assets).where(eq(assets.id, r.assetId));
      expect(a!.moderationStatus).toBe('CLEAR');
      expect(a!.moderatedAt).not.toBeNull();
      expect(a!.familyId).toBeNull();
      expect(a!.ephemeralClaimId).toBe(r.claimId);
      expect(a!.visibility).toBe('FAMILY');
      expect(a!.keptInHome).toBe(false);
      expect(a!.purgeAfter).not.toBeNull();
      expect(a!.termsVersion).toBe('test-direct-v1');

      // and the raw upload is gone
      expect(await headObject(quarantineKey(u.uploadId))).toBeNull();
    });

    it('a flagged upload goes to the review queue — kept, never auto-rejected — and quarantine is cleared', async () => {
      safety.flag = true;
      const { u, r } = await finalised(await phonePhoto());
      expect(r).toMatchObject({ status: 'ingested', moderationStatus: 'FLAGGED' });
      expect(await headObject(quarantineKey(u.uploadId))).toBeNull();
    });

    it('a CSAM hash match is BLOCKED and preserved (not deleted) — the raw quarantine copy still goes', async () => {
      safety.hashMatch = true;
      const { u, r } = await finalised(await phonePhoto());
      expect(r).toMatchObject({ status: 'ingested', moderationStatus: 'BLOCKED' });
      if (r.status !== 'ingested') return;
      const [a] = await db.select().from(assets).where(eq(assets.id, r.assetId));
      expect(a!.moderationStatus).toBe('BLOCKED');
      expect(await headObject(quarantineKey(u.uploadId))).toBeNull();
    });

    it('without this browser’s ticket → denied, nothing ingested', async () => {
      const u = await uploaded(await phonePhoto());
      expect(await finaliseGuestUpload(db, { uploadId: u.uploadId, tickets: [] })).toEqual({ status: 'denied' });
      expect(safety.hashSaw).toHaveLength(0);
      expect(await db.select().from(assets).where(eq(assets.id, u.uploadId))).toEqual([]);
    });

    it('a ticket is single-use in effect: a second finalise finds nothing to ingest', async () => {
      const { u, r } = await finalised(await phonePhoto());
      expect(r.status).toBe('ingested');
      expect(await finaliseGuestUpload(db, { uploadId: u.uploadId, tickets: u.tickets })).toEqual({ status: 'failed' });
    });

    it('not an image → refused, no asset, and the quarantine object is removed', async () => {
      const terms = `not-an-image-${Date.now()}`; // tags any row this upload could create
      const body = Buffer.from('<html><script>alert(1)</script></html>');
      const m = (await mintGuestUpload({ byteSize: body.byteLength, termsVersion: terms }))!;
      keys.push(quarantineKey(m.uploadId));
      expect(await browserPut(m.upload.url, m.upload.headers, body)).toBe(200);
      expect(await finaliseGuestUpload(db, { uploadId: m.uploadId, tickets: [m.ticket] })).toEqual({ status: 'failed' });
      expect(await db.select({ id: assets.id }).from(assets).where(eq(assets.termsVersion, terms))).toEqual([]);
      expect(await headObject(quarantineKey(m.uploadId))).toBeNull();
    });

    it('an object that doesn’t match the signed size (a bucket that ignored the pin) is refused and removed', async () => {
      const m = (await mintGuestUpload({ byteSize: 100, termsVersion: 'v' }))!;
      const key = quarantineKey(m.uploadId);
      keys.push(key);
      await putObject(key, await phonePhoto(), 'application/octet-stream'); // server-side write, any size
      expect(await finaliseGuestUpload(db, { uploadId: m.uploadId, tickets: [m.ticket] })).toEqual({ status: 'failed' });
      expect(safety.hashSaw).toHaveLength(0);
      expect(await headObject(key)).toBeNull();
    });
  });

  describe('an un-finalised upload never reaches an order', () => {
    it('it has no asset row, so ordering it is refused (nothing to resolve, nothing to render)', async () => {
      const u = await uploaded(await phonePhoto());
      expect(await db.select().from(assets).where(eq(assets.id, u.uploadId))).toEqual([]);
      await expect(
        placeOrder(db, {
          items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: u.uploadId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
          account: { id: ids.samId },
          joinProvenance: null,
        }),
      ).rejects.toThrow(/not found/);
    });

    it('the sweep removes it once abandoned — but never a fresh one still being finalised', async () => {
      const u = await uploaded(Buffer.alloc(64, 3));
      const key = quarantineKey(u.uploadId);
      await sweepQuarantine(); // now: too fresh to touch
      expect(await headObject(key)).not.toBeNull();
      await sweepQuarantine({ now: new Date(Date.now() + QUARANTINE_SWEEP_AGE_MS + 60_000) });
      expect(await headObject(key)).toBeNull();
    });
  });

  it('on a VERSIONED bucket every version of the raw upload goes (no non-current copy left behind)', async () => {
    const bucket = `sd-quarantine-versions-${Date.now()}`;
    const { client: s3 } = getS3();
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    await s3.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }));
    vi.stubEnv('S3_BUCKET', bucket);
    const key = quarantineKey('0b6f1c2e-6a8e-4f0e-9d7a-3b1c2d4e5f60');
    try {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from('first') }));
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from('second') })); // a replayed PUT
      await deleteQuarantineObject(key);
      const left = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key }));
      expect([...(left.Versions ?? []), ...(left.DeleteMarkers ?? [])]).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => {});
    }
  });
});
