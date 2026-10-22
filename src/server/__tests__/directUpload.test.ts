import { beforeEach, describe, expect, it, vi } from 'vitest';

// No bucket or database here: every storage/ingest call is a spy, so a denied path can PROVE it
// touched nothing.
const storage = vi.hoisted(() => ({
  presignQuarantineUpload: vi.fn(async (id: string) => ({ url: `https://bucket.test/quarantine/${id}`, headers: {}, expiresAt: new Date() })),
  headObject: vi.fn(),
  getObjectBytes: vi.fn(),
  deleteQuarantineObject: vi.fn(async () => {}),
  listQuarantine: vi.fn(),
}));
const ingest = vi.hoisted(() => ({ ingestEphemeralUpload: vi.fn() }));
vi.mock('@/storage', async (orig) => ({ ...(await orig<typeof import('@/storage')>()), ...storage }));
vi.mock('@/server/ingest', () => ingest);

import {
  MAX_PENDING_TICKETS,
  QUARANTINE_SWEEP_AGE_MS,
  appendTicket,
  directUploadsEnabled,
  finaliseGuestUpload,
  mintGuestUpload,
  signTickets,
  sweepQuarantine,
  verifyTickets,
  withoutTicket,
  type UploadTicket,
} from '@/server/directUpload';
import { signClaims } from '@/server/uploadClaims';
import type { DbHandle } from '@/server/db';

const db = {} as DbHandle;
const NOW = new Date('2026-10-22T10:00:00Z');
const nowS = Math.floor(NOW.getTime() / 1000);
const ID = '0b6f1c2e-6a8e-4f0e-9d7a-3b1c2d4e5f60';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ticket = (over: Partial<UploadTicket> = {}): UploadTicket => ({ id: ID, bytes: 100, exp: nowS + 600, terms: 'v1', ...over });

beforeEach(() => vi.clearAllMocks());

describe('upload tickets — only the browser that was authorised can finalise', () => {
  it('round-trips a signed ticket list', () => {
    const t = [ticket(), ticket({ id: OTHER })];
    expect(verifyTickets(signTickets(t), NOW)).toEqual(t);
  });

  it('a tampered or forged cookie yields nothing', () => {
    const v = signTickets([ticket()]);
    const forged = Buffer.from(JSON.stringify([ticket({ id: OTHER })])).toString('base64url') + v.slice(v.lastIndexOf('.'));
    expect(verifyTickets(forged, NOW)).toEqual([]);
    expect(verifyTickets(v.slice(0, -2) + 'xx', NOW)).toEqual([]);
    expect(verifyTickets('garbage', NOW)).toEqual([]);
    expect(verifyTickets(undefined, NOW)).toEqual([]);
  });

  it('an upload CLAIM cookie can never be replayed as a ticket (domain-separated MAC)', () => {
    expect(verifyTickets(signClaims([ID]), NOW)).toEqual([]);
  });

  it('expired tickets and malformed entries are dropped', () => {
    expect(verifyTickets(signTickets([ticket({ exp: nowS - 1 })]), NOW)).toEqual([]);
    expect(verifyTickets(signTickets([ticket({ id: '../assets/x' })]), NOW)).toEqual([]);
    expect(verifyTickets(signTickets([ticket({ bytes: 26 * 1024 * 1024 })]), NOW)).toEqual([]);
  });

  it('holds at most a handful of pending uploads; finalising removes one', () => {
    let list: UploadTicket[] = [];
    for (let i = 0; i < MAX_PENDING_TICKETS + 3; i++) list = appendTicket(list, ticket({ id: `0b6f1c2e-6a8e-4f0e-9d7a-3b1c2d4e5f6${i}` }));
    expect(list).toHaveLength(MAX_PENDING_TICKETS);
    expect(withoutTicket([ticket(), ticket({ id: OTHER })], ID)).toEqual([ticket({ id: OTHER })]);
  });

  it('direct uploads are opt-in (the bucket CORS must be in place first)', () => {
    expect(directUploadsEnabled({})).toBe(false);
    expect(directUploadsEnabled({ S3_DIRECT_UPLOADS: '1' })).toBe(false);
    expect(directUploadsEnabled({ S3_DIRECT_UPLOADS: 'true' })).toBe(true);
  });
});

describe('mintGuestUpload', () => {
  it('signs nothing for an empty, fractional, non-numeric or over-25MB size', async () => {
    for (const byteSize of [0, -1, 1.5, '100', null, 25 * 1024 * 1024 + 1]) {
      expect(await mintGuestUpload({ byteSize, termsVersion: 'v1', now: NOW })).toBeNull();
    }
    expect(storage.presignQuarantineUpload).not.toHaveBeenCalled();
  });

  it('a fresh random id per upload; the ticket pins its size, terms and a 30-minute window', async () => {
    const a = await mintGuestUpload({ byteSize: 100, termsVersion: 'v1', now: NOW });
    const b = await mintGuestUpload({ byteSize: 100, termsVersion: 'v1', now: NOW });
    expect(a!.uploadId).not.toBe(b!.uploadId);
    expect(a!.ticket).toEqual({ id: a!.uploadId, bytes: 100, exp: nowS + 30 * 60, terms: 'v1' });
    expect(storage.presignQuarantineUpload).toHaveBeenCalledWith(a!.uploadId, 100, { now: NOW });
  });
});

describe('finaliseGuestUpload — denied without this browser’s live ticket', () => {
  it.each([
    ['no tickets at all', [] as UploadTicket[], ID],
    ['a ticket for a different upload', [ticket({ id: OTHER })], ID],
    ['an expired ticket', [ticket({ exp: nowS - 1 })], ID],
    ['a non-string id', [ticket()], { id: ID }],
  ])('%s → denied, and the quarantine object is not even read', async (_label, tickets, uploadId) => {
    expect(await finaliseGuestUpload(db, { uploadId, tickets, now: NOW })).toEqual({ status: 'denied' });
    expect(storage.headObject).not.toHaveBeenCalled();
    expect(storage.getObjectBytes).not.toHaveBeenCalled();
    expect(storage.deleteQuarantineObject).not.toHaveBeenCalled();
    expect(ingest.ingestEphemeralUpload).not.toHaveBeenCalled();
  });

  it('a size that differs from the signed one is refused before ingest — and still deleted', async () => {
    storage.headObject.mockResolvedValueOnce({ byteSize: 101, lastModified: NOW });
    expect(await finaliseGuestUpload(db, { uploadId: ID, tickets: [ticket()], now: NOW })).toEqual({ status: 'failed' });
    expect(ingest.ingestEphemeralUpload).not.toHaveBeenCalled();
    expect(storage.deleteQuarantineObject).toHaveBeenCalledWith(`quarantine/${ID}`);
  });

  it('a missing upload (the PUT never happened) fails cleanly', async () => {
    storage.headObject.mockResolvedValueOnce(null);
    expect(await finaliseGuestUpload(db, { uploadId: ID, tickets: [ticket()], now: NOW })).toEqual({ status: 'failed' });
  });

  it('the quarantine object is deleted even when ingest throws', async () => {
    storage.headObject.mockResolvedValueOnce({ byteSize: 100, lastModified: NOW });
    storage.getObjectBytes.mockResolvedValueOnce(Buffer.alloc(100));
    ingest.ingestEphemeralUpload.mockRejectedValueOnce(new Error('db down'));
    await expect(finaliseGuestUpload(db, { uploadId: ID, tickets: [ticket()], now: NOW })).rejects.toThrow('db down');
    expect(storage.deleteQuarantineObject).toHaveBeenCalledWith(`quarantine/${ID}`);
  });

  it('ingests with the terms version recorded on the ticket', async () => {
    storage.headObject.mockResolvedValueOnce({ byteSize: 100, lastModified: NOW });
    storage.getObjectBytes.mockResolvedValueOnce(Buffer.alloc(100, 7));
    ingest.ingestEphemeralUpload.mockResolvedValueOnce({ assetId: 'a', claimId: 'c', key: 'k', moderationStatus: 'CLEAR' });
    const r = await finaliseGuestUpload(db, { uploadId: ID, tickets: [ticket({ terms: 'terms-2026' })], now: NOW });
    expect(r).toMatchObject({ status: 'ingested', assetId: 'a', moderationStatus: 'CLEAR' });
    expect(ingest.ingestEphemeralUpload).toHaveBeenCalledWith(db, { buffer: Buffer.alloc(100, 7), kind: 'DRAWING', termsVersion: 'terms-2026', now: NOW });
  });
});

describe('sweepQuarantine — abandoned uploads go', () => {
  it('deletes only objects older than the sweep age', async () => {
    storage.listQuarantine.mockResolvedValueOnce([
      { key: 'quarantine/old', lastModified: new Date(NOW.getTime() - QUARANTINE_SWEEP_AGE_MS - 1) },
      { key: 'quarantine/fresh', lastModified: new Date(NOW.getTime() - 60_000) },
      { key: 'quarantine/undated', lastModified: null },
    ]);
    expect(await sweepQuarantine({ now: NOW })).toEqual({ scanned: 3, deleted: 1, failed: 0 });
    expect(storage.deleteQuarantineObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteQuarantineObject).toHaveBeenCalledWith('quarantine/old');
  });
});
