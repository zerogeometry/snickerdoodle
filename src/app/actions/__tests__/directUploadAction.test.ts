import { beforeEach, describe, expect, it, vi } from 'vitest';

// The direct-upload Server Actions with their surroundings stubbed: the cookie jar, the rate
// limiter and the signer. Proves NO upload URL (and no ticket) is ever handed out unless the
// request is authorised, and that finalising needs this browser's ticket.
const jar = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: vi.fn((name: string, value: string) => void store.set(name, value)),
  };
});
const limiter = vi.hoisted(() => ({ ok: true }));
const mint = vi.hoisted(() => vi.fn());
const finalise = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({ cookies: async () => jar }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/server/rateLimit', async (orig) => ({
  ...(await orig<typeof import('@/server/rateLimit')>()),
  clientIp: async () => '203.0.113.9',
  rateLimit: vi.fn(async () => ({ ok: limiter.ok })),
}));
vi.mock('@/server/directUpload', async (orig) => ({
  ...(await orig<typeof import('@/server/directUpload')>()),
  mintGuestUpload: mint,
  finaliseGuestUpload: finalise,
}));

import { beginGuestUpload, finishGuestUpload } from '@/app/actions/guestUpload';
import { UPLOAD_TICKET_COOKIE, signTickets, verifyTickets } from '@/server/directUpload';
import { UPLOAD_CLAIM_COOKIE, verifyClaims } from '@/server/uploadClaims';

const ID = '0b6f1c2e-6a8e-4f0e-9d7a-3b1c2d4e5f60';
const liveTicket = { id: ID, bytes: 100, exp: Math.floor(Date.now() / 1000) + 600, terms: 'v1' };

beforeEach(() => {
  jar.store.clear();
  jar.set.mockClear();
  mint.mockReset();
  finalise.mockReset();
  limiter.ok = true;
  vi.stubEnv('S3_DIRECT_UPLOADS', 'true');
});

describe('beginGuestUpload — no URL without authorisation', () => {
  it('terms not accepted → needsTerms; nothing signed, no ticket', async () => {
    for (const termsAccepted of [false, 'true', 1, undefined] as unknown as boolean[]) {
      expect(await beginGuestUpload({ byteSize: 100, termsAccepted })).toEqual({ ok: false, needsTerms: true });
    }
    expect(mint).not.toHaveBeenCalled();
    expect(jar.set).not.toHaveBeenCalled();
  });

  it('rate-limited device → tooMany; nothing signed, no ticket', async () => {
    limiter.ok = false;
    expect(await beginGuestUpload({ byteSize: 100, termsAccepted: true })).toEqual({ ok: false, tooMany: true });
    expect(mint).not.toHaveBeenCalled();
    expect(jar.set).not.toHaveBeenCalled();
  });

  it('a size the signer refuses → no ticket', async () => {
    mint.mockResolvedValueOnce(null);
    expect(await beginGuestUpload({ byteSize: 26 * 1024 * 1024, termsAccepted: true })).toEqual({ ok: false });
    expect(jar.set).not.toHaveBeenCalled();
  });

  it('direct uploads off → the inline path, nothing signed', async () => {
    vi.stubEnv('S3_DIRECT_UPLOADS', '');
    expect(await beginGuestUpload({ byteSize: 100, termsAccepted: true })).toEqual({ ok: true, inline: true });
    expect(mint).not.toHaveBeenCalled();
  });

  it('authorised → the URL + headers, and the ticket lands in an httpOnly, same-site cookie', async () => {
    mint.mockResolvedValueOnce({ uploadId: ID, upload: { url: 'https://b/quarantine/x', headers: { 'content-type': 'application/octet-stream' } }, ticket: liveTicket });
    const r = await beginGuestUpload({ byteSize: 100, termsAccepted: true });
    expect(r).toEqual({ ok: true, uploadId: ID, url: 'https://b/quarantine/x', headers: { 'content-type': 'application/octet-stream' } });
    expect(JSON.stringify(r)).not.toContain('exp'); // the ticket itself never reaches page JS
    expect(verifyTickets(jar.store.get(UPLOAD_TICKET_COOKIE))).toEqual([liveTicket]);
    expect(jar.set).toHaveBeenCalledWith(UPLOAD_TICKET_COOKIE, expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'strict' }));
  });
});

describe('finishGuestUpload', () => {
  it('without this browser’s ticket → refused, no claim granted', async () => {
    finalise.mockResolvedValueOnce({ status: 'denied' });
    expect(await finishGuestUpload(ID)).toEqual({ ok: false });
    expect(finalise).toHaveBeenCalledWith(expect.anything(), { uploadId: ID, tickets: [], kind: 'DRAWING' });
    expect(jar.store.has(UPLOAD_CLAIM_COOKIE)).toBe(false);
  });

  it('BLOCKED content → blocked, NO claim (preserved for the runbook, never surfaced); ticket spent', async () => {
    jar.store.set(UPLOAD_TICKET_COOKIE, signTickets([liveTicket]));
    finalise.mockResolvedValueOnce({ status: 'ingested', assetId: 'a', claimId: 'c', key: 'k', moderationStatus: 'BLOCKED' });
    expect(await finishGuestUpload(ID)).toEqual({ ok: false, blocked: true });
    expect(jar.store.has(UPLOAD_CLAIM_COOKIE)).toBe(false);
    expect(verifyTickets(jar.store.get(UPLOAD_TICKET_COOKIE))).toEqual([]);
  });

  it('ingested → the draft’s claim goes to this browser; ticket spent', async () => {
    jar.store.set(UPLOAD_TICKET_COOKIE, signTickets([liveTicket]));
    const claimId = '11111111-2222-4333-8444-555555555555';
    finalise.mockResolvedValueOnce({ status: 'ingested', assetId: 'asset-1', claimId, key: 'k', moderationStatus: 'FLAGGED' });
    expect(await finishGuestUpload(ID)).toEqual({ ok: true, assetId: 'asset-1' });
    expect(verifyClaims(jar.store.get(UPLOAD_CLAIM_COOKIE))).toEqual([claimId]);
    expect(verifyTickets(jar.store.get(UPLOAD_TICKET_COOKIE))).toEqual([]);
  });
});
