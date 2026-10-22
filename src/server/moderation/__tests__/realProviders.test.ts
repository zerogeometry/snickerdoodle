import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { HASH_UNCHECKED_LABEL } from '@/authz';
import { CLASSIFIER_ERROR_LABEL, moderateAndRecord, moderateDesignAndRecord, moderateImage, type ModerationProviders } from '../index';
import { HashGateUnavailableError, iwfHashProvider, isIwfConfigured, resolveIwfAdapter, type IwfImageInterceptAdapter } from '../iwf';
import { ModerationConfigError, assertModerationReady, defaultProviders, isModerationConfigured, realProviders } from '../providers';
import { REKOGNITION_REGION, type RekognitionPort } from '../rekognition';

/**
 * MODERATION_PROVIDER=real wiring + the fail-safes, with a MOCKED Rekognition client only.
 * No real image goes anywhere: the pictures are generated squares and send() is a vi.fn.
 */

const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();
const REAL = { MODERATION_PROVIDER: 'real' };

function mockRekognition(reply: unknown = { ModerationLabels: [] }, extra: Record<string, unknown> = {}) {
  const send = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const client = { config: { region: REKOGNITION_REGION, ...extra }, send } as RekognitionPort;
  return { client, send };
}

const noMatch: IwfImageInterceptAdapter = { check: vi.fn(async () => ({ match: false as const })) };

/** A fake db for the record functions: remembers writes, answers selects with `row`. */
function fakeDb(row: Record<string, unknown> = { status: 'CLEAR', detail: { labels: [], original: { status: 'CLEAR', labels: [] } } }) {
  const writes: unknown[] = [];
  const db = {
    update: () => ({ set: (v: unknown) => ({ where: async () => void writes.push(v) }) }),
    insert: () => ({ values: async (v: unknown) => void writes.push(v) }),
    select: () => ({ from: () => ({ where: async () => [row] }) }),
  } as never;
  return { db, writes };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the default stays the stub', () => {
  it('unset or "stub" → the pass-everything stub; nothing is sent anywhere', async () => {
    for (const env of [{}, { MODERATION_PROVIDER: 'stub' }, { MODERATION_PROVIDER: '' }]) {
      const p = defaultProviders(env);
      expect(await p.hash.isKnownIllegal({ sha256: 'x', buffer: Buffer.from('x') })).toBe(false);
      expect(await p.classifier.classify(Buffer.from('x'))).toEqual({ flagged: false, labels: [] });
      expect(isModerationConfigured(env)).toBe(false);
    }
  });

  it('an unknown value is an error, never a quiet stub', () => {
    for (const mode of ['Real', 'REAL', 'on', 'true', 'rekognition']) expect(() => defaultProviders({ MODERATION_PROVIDER: mode })).toThrow(ModerationConfigError);
  });

  it('startup is fine with the stub, and touches no AWS client', async () => {
    expect(await assertModerationReady({})).toEqual({ mode: 'stub', hashGate: 'stub' });
    await expect(assertModerationReady({ MODERATION_PROVIDER: 'typo' })).rejects.toThrow(ModerationConfigError);
  });
});

describe('MODERATION_PROVIDER=real', () => {
  it('builds the real providers (Rekognition classifier + text reader, IWF hash gate)', async () => {
    const { client, send } = mockRekognition({ ModerationLabels: [{ Name: 'Violence', Confidence: 95, ParentName: '' }] });
    const p = realProviders(REAL, { rekognition: client, iwf: noMatch });
    expect(await p.classifier.classify(await png())).toEqual({ flagged: true, labels: ['Violence'] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(p.textReader).toBeDefined();
  });

  it('a Rekognition endpoint override is a startup error', async () => {
    const env = { ...REAL, AWS_ENDPOINT_URL_REKOGNITION: 'https://elsewhere.example.com' };
    expect(() => defaultProviders(env)).toThrow(/cannot be redirected/);
    expect(isModerationConfigured(env)).toBe(false);
    await expect(assertModerationReady(env, { rekognition: mockRekognition().client })).rejects.toThrow(ModerationConfigError);
  });

  it('startup refuses a client outside eu-west-2', async () => {
    const client = { config: { region: 'us-east-1' }, send: vi.fn() } as RekognitionPort;
    await expect(assertModerationReady(REAL, { rekognition: client })).rejects.toThrow(/eu-west-2/);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('startup refuses when the AWS provider chain has no credentials — and never echoes them', async () => {
    const credentials = vi.fn(async () => {
      throw new Error('Could not load credentials (AKIA-SHOULD-NOT-LEAK)');
    });
    const { client, send } = mockRekognition(undefined, { credentials });
    const err = await assertModerationReady(REAL, { rekognition: client }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(ModerationConfigError);
    expect(String((err as Error).message)).not.toContain('AKIA');
    expect(send).not.toHaveBeenCalled(); // the startup check never sends an image
  });

  it('startup with credentials resolved: real mode, hash gate reported CLOSED (IWF not onboarded)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, send } = mockRekognition(undefined, { credentials: async () => ({ accessKeyId: 'x', secretAccessKey: 'y' }) });
    expect(await assertModerationReady(REAL, { rekognition: client })).toEqual({ mode: 'real', hashGate: 'closed' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('hash gate is CLOSED'));
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secretAccessKey|"y"/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('IWF not configured → the hash gate FAILS CLOSED', () => {
  it('there is no IWF adapter yet, so it is not configured — and the go-live guard stays false', () => {
    expect(resolveIwfAdapter(REAL)).toBeNull();
    expect(isIwfConfigured(REAL)).toBe(false);
    expect(isModerationConfigured(REAL)).toBe(false);
  });

  it('the unconfigured hash provider throws on every check — it never answers "no match"', async () => {
    await expect(iwfHashProvider(null).isKnownIllegal({ sha256: 'x', buffer: Buffer.from('x') })).rejects.toBeInstanceOf(HashGateUnavailableError);
  });

  it('an upload can\'t pass: held for review as hash-unchecked, and the picture is NOT sent on to Rekognition', async () => {
    const { client, send } = mockRekognition();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const v = await moderateImage({ buffer: await png(), sha256: 'x', originalBuffer: await png() }, realProviders(REAL, { rekognition: client }));
    expect(v).toEqual({ status: 'FLAGGED', labels: [HASH_UNCHECKED_LABEL] });
    expect(send).not.toHaveBeenCalled();
  });

  it('production with "real" but no IWF holds every upload and sends NOTHING to Rekognition', async () => {
    const { db } = fakeDb();
    const v = await moderateAndRecord(db, { assetId: 'a1', familyId: null, buffer: await png(), sha256: 'x' }, undefined, { ...REAL, NODE_ENV: 'production' });
    expect(v).toEqual({ status: 'FLAGGED', labels: ['screening-not-configured'] });
  });

  it('an adapter answering anything but a clear match/no-match keeps the gate closed', async () => {
    for (const answer of [undefined, null, {}, { match: 'no' }, { match: 0 }]) {
      const p = iwfHashProvider({ check: async () => answer as never });
      await expect(p.isKnownIllegal({ sha256: 'x', buffer: Buffer.from('x') })).rejects.toBeInstanceOf(HashGateUnavailableError);
    }
  });

  it('a configured adapter sees the ORIGINAL bytes; a match blocks, a clear no-match passes', async () => {
    const check = vi.fn(async () => ({ match: true as const }));
    const original = Buffer.from('original-upload-bytes');
    expect(await iwfHashProvider({ check }).isKnownIllegal({ sha256: 'abc', buffer: original })).toBe(true);
    expect(check).toHaveBeenCalledWith({ originalBytes: original, sha256: 'abc' });
    expect(await iwfHashProvider(noMatch).isKnownIllegal({ sha256: 'abc', buffer: original })).toBe(false);
  });
});

describe('a provider error routes to review — never CLEAR', () => {
  const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('Rekognition down (real providers, mocked client) → FLAGGED classifier-error', async () => {
    quiet();
    const { client } = mockRekognition(Object.assign(new Error('service unavailable'), { name: 'ServiceUnavailableException' }));
    const v = await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(REAL, { rekognition: client, iwf: noMatch }));
    expect(v).toEqual({ status: 'FLAGGED', labels: [CLASSIFIER_ERROR_LABEL] });
  });

  it('a garbage Rekognition response → FLAGGED, not CLEAR', async () => {
    quiet();
    const { client } = mockRekognition({ unexpected: true });
    expect((await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(REAL, { rekognition: client, iwf: noMatch }))).status).toBe('FLAGGED');
  });

  it('a hash check that throws → held as hash-unchecked (not BLOCKED: no false CSAM report), classifier skipped', async () => {
    quiet();
    const classify = vi.fn(async () => ({ flagged: false, labels: [] }));
    const p: ModerationProviders = { hash: { isKnownIllegal: async () => Promise.reject(new Error('timeout')) }, classifier: { classify } };
    expect(await moderateImage({ buffer: Buffer.from('x'), sha256: 'x' }, p)).toEqual({ status: 'FLAGGED', labels: [HASH_UNCHECKED_LABEL] });
    expect(classify).not.toHaveBeenCalled();
  });

  it('a hash or classifier answering in the wrong shape is never read as clean', async () => {
    const odd = [undefined, null, 'no', 0, {}];
    for (const answer of odd) {
      const p: ModerationProviders = { hash: { isKnownIllegal: async () => answer as never }, classifier: { classify: async () => ({ flagged: false, labels: [] }) } };
      expect((await moderateImage({ buffer: Buffer.from('x'), sha256: 'x' }, p)).status).toBe('FLAGGED');
    }
    for (const answer of [undefined, null, {}, { flagged: 'no', labels: [] }, { flagged: 0 }]) {
      const p: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => answer as never } };
      expect((await moderateImage({ buffer: Buffer.from('x'), sha256: 'x' }, p)).status).toBe('FLAGGED');
    }
  });

  it('the classifier never auto-rejects: a Rekognition hit is FLAGGED (review), never BLOCKED', async () => {
    const { client } = mockRekognition({ ModerationLabels: [{ Name: 'Explicit', Confidence: 99, ParentName: '' }] });
    const v = await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(REAL, { rekognition: client, iwf: noMatch }));
    expect(v).toEqual({ status: 'FLAGGED', labels: ['Explicit'] });
  });

  it('a CSAM match still preserves + blocks, ahead of the classifier', async () => {
    const { client, send } = mockRekognition();
    const v = await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(REAL, { rekognition: client, iwf: { check: async () => ({ match: true }) } }));
    expect(v).toEqual({ status: 'BLOCKED', labels: ['csam-hash-match'] });
    expect(send).not.toHaveBeenCalled();
  });

  it('Studio design: a classifier that throws holds the design for review (it used to throw out of the save)', async () => {
    quiet();
    const { db, writes } = fakeDb();
    const { client } = mockRekognition(new Error('boom'));
    const v = await moderateDesignAndRecord(db, { assetId: 'a1', familyId: 'f1', buffer: await png() }, realProviders(REAL, { rekognition: client, iwf: noMatch }));
    expect(v.status).toBe('FLAGGED');
    expect(v.labels).toContain(CLASSIFIER_ERROR_LABEL);
    expect(v.labels).toContain('text-unreadable'); // the same client failed for OCR too
    expect(writes.some((w) => (w as { moderationStatus?: string }).moderationStatus === 'FLAGGED')).toBe(true);
  });

  it('Studio design: real text reader feeds drawn words into the abuse screen', async () => {
    const send = vi.fn(async (cmd: { constructor: { name: string } }) =>
      cmd.constructor.name === 'DetectTextCommand' ? { TextDetections: [{ Type: 'LINE', DetectedText: 'love you nana', Confidence: 99 }] } : { ModerationLabels: [] },
    );
    const client = { config: { region: REKOGNITION_REGION }, send } as unknown as RekognitionPort;
    const { db } = fakeDb();
    const v = await moderateDesignAndRecord(db, { assetId: 'a1', familyId: 'f1', buffer: await png() }, realProviders(REAL, { rekognition: client, iwf: noMatch }));
    expect(v).toEqual({ status: 'CLEAR', labels: [] });
    expect(send).toHaveBeenCalledTimes(2); // one image to the classifier, the same one image to the reader
  });
});
