import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { CLASSIFIER_ERROR_LABEL, DRAWN_WORDS_LABEL, TEXT_UNREADABLE_LABEL, moderateAndRecord, moderateDesignAndRecord, moderateImage, type ModerationProviders } from '../index';
import { ModerationConfigError, assertModerationReady, defaultProviders, isHashCheckDeferred, isModerationConfigured, realProviders } from '../providers';
import { REKOGNITION_REGION, type RekognitionPort } from '../rekognition';
import type { TextractPort } from '../textract';
import type { IwfImageInterceptAdapter } from '../iwf';

/**
 * Founder decision D25 (9 Nov 2026): CSAM_HASH_CHECK=deferred launches on Rekognition alone until
 * IWF is connected. Every upload STILL goes through the classifier (nudity, violence, hate symbols,
 * rude gestures) and the words-in-the-picture screen before it can be CLEAR — the gate a print order
 * needs. Mocked Rekognition only: no image goes anywhere.
 */

const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();
const DEFERRED = { MODERATION_PROVIDER: 'real', CSAM_HASH_CHECK: 'deferred' };
/** The handwriting reader (Textract), mocked: reads no words unless a test says otherwise. */
const noHandwriting = { config: { region: 'eu-west-2' }, send: vi.fn(async () => ({ Blocks: [] })) } as TextractPort;

/** A Rekognition mock that answers moderation and DetectText separately. */
function rekognition(labels: unknown[] = [], words: string[] = [], fail = false) {
  const send = vi.fn(async (cmd: { constructor: { name: string } }) => {
    if (fail) throw Object.assign(new Error('down'), { name: 'ServiceUnavailableException' });
    return cmd.constructor.name === 'DetectTextCommand'
      ? { TextDetections: words.map((w) => ({ Type: 'LINE', DetectedText: w, Confidence: 99 })) }
      : { ModerationLabels: labels };
  });
  return { client: { config: { region: REKOGNITION_REGION }, send } as unknown as RekognitionPort, send };
}
const L = (Name: string, Confidence = 95, ParentName = '') => ({ Name, Confidence, ParentName });

function fakeDb() {
  const writes: Record<string, unknown>[] = [];
  const db = {
    update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => void writes.push(v) }) }),
    insert: () => ({ values: async (v: Record<string, unknown>) => void writes.push(v) }),
    select: () => ({ from: () => ({ where: async () => [{ status: 'CLEAR', detail: { labels: [], original: { status: 'CLEAR', labels: [], hashCheck: 'deferred', sensitive: false } } }] }) }),
  } as never;
  return { db, writes };
}

afterEach(() => vi.restoreAllMocks());

describe('the D25 setting', () => {
  it('only "deferred" with the real providers opens the go-live guard', () => {
    expect(isModerationConfigured(DEFERRED)).toBe(true);
    expect(isHashCheckDeferred(DEFERRED)).toBe(true);
    expect(isModerationConfigured({ MODERATION_PROVIDER: 'real' })).toBe(false); // no IWF, no deferral → still closed
    expect(isModerationConfigured({ CSAM_HASH_CHECK: 'deferred' })).toBe(false); // the stub can never go live
    expect(isModerationConfigured({ MODERATION_PROVIDER: 'stub', CSAM_HASH_CHECK: 'deferred' })).toBe(false);
  });

  it('a typo is a startup error and keeps the guard closed (never quietly open or shut)', () => {
    const env = { MODERATION_PROVIDER: 'real', CSAM_HASH_CHECK: 'defered' };
    expect(isModerationConfigured(env)).toBe(false);
    expect(() => defaultProviders(env)).toThrow(ModerationConfigError);
  });

  it('startup reports the hash gate as DEFERRED, and says so in the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, send } = rekognition();
    expect(await assertModerationReady(DEFERRED, { textract: noHandwriting, rekognition: client })).toEqual({ mode: 'real', hashGate: 'deferred' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DEFERRED (founder decision D25)'));
    expect(send).not.toHaveBeenCalled();
  });

  it('no hash provider when deferred; the moment IWF is connected it is used instead', async () => {
    const { client } = rekognition();
    expect(realProviders(DEFERRED, { textract: noHandwriting, rekognition: client }).hash).toBeNull();
    const check = vi.fn(async () => ({ match: true as const }));
    const iwf: IwfImageInterceptAdapter = { check };
    const p = realProviders(DEFERRED, { textract: noHandwriting, rekognition: client, iwf });
    expect(p.hash).not.toBeNull();
    expect((await moderateImage({ buffer: await png(), sha256: 'x' }, p)).status).toBe('BLOCKED');
  });
});

describe('every upload is still screened before it can be CLEAR', () => {
  const run = async (labels: unknown[] = [], words: string[] = [], fail = false) => {
    if (fail) vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, send } = rekognition(labels, words, fail);
    return { v: await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(DEFERRED, { textract: noHandwriting, rekognition: client })), send };
  };

  it('a clean picture: classifier + words both run (one image each), then CLEAR — marked deferred', async () => {
    const { v, send } = await run();
    expect(v).toEqual({ status: 'CLEAR', labels: [], hashCheck: 'deferred', sensitive: false });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('nudity FLAGS (never rejected) and is sensitive: remove-only in review', async () => {
    const { v } = await run([L('Explicit'), L('Exposed Female Nipple', 93, 'Explicit')]);
    expect(v).toMatchObject({ status: 'FLAGGED', hashCheck: 'deferred', sensitive: true });
    expect(v.labels).toContain('Exposed Female Nipple');
  });

  it('partial nudity / kissing flags as sensitive too', async () => {
    const { v } = await run([L('Non-Explicit Nudity of Intimate parts and Kissing', 80)]);
    expect(v).toMatchObject({ status: 'FLAGGED', sensitive: true });
  });

  it('rude gestures FLAG, and a reviewer may look (not sexual)', async () => {
    const { v } = await run([L('Rude Gestures', 88), L('Middle Finger', 86, 'Rude Gestures')]);
    expect(v).toEqual({ status: 'FLAGGED', labels: ['Middle Finger'], hashCheck: 'deferred', sensitive: false });
  });

  it('bad language written IN an uploaded picture FLAGS (uploads, not just Studio designs)', async () => {
    const { v } = await run([], ['happy birthday', 'you are a twat']);
    expect(v).toEqual({ status: 'FLAGGED', labels: [DRAWN_WORDS_LABEL], hashCheck: 'deferred', sensitive: false });
  });

  it('kind words pass', async () => {
    expect((await run([], ['love you nana xx'])).v.status).toBe('CLEAR');
  });

  it('an unknown category flags and is sensitive (fail-safe)', async () => {
    expect((await run([L('Some New Category')])).v).toMatchObject({ status: 'FLAGGED', sensitive: true });
  });

  it('Rekognition down: held for review, sensitive, never CLEAR', async () => {
    const { v } = await run([], [], true);
    expect(v).toEqual({ status: 'FLAGGED', labels: [CLASSIFIER_ERROR_LABEL, TEXT_UNREADABLE_LABEL], hashCheck: 'deferred', sensitive: true });
  });

  it('a classifier with no categories that flags is sensitive (fail-safe)', async () => {
    const p: ModerationProviders = { hash: null, classifier: { classify: async () => ({ flagged: true, labels: ['x'] }) } };
    expect(await moderateImage({ buffer: Buffer.from('x'), sha256: 'x' }, p)).toMatchObject({ status: 'FLAGGED', sensitive: true });
  });
});

describe('the words check runs on uploads with IWF connected too', () => {
  it('drawn bad language flags alongside a clean hash check', async () => {
    const { client } = rekognition([], ['shit']);
    const noMatch: IwfImageInterceptAdapter = { check: async () => ({ match: false }) };
    const v = await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders({ MODERATION_PROVIDER: 'real' }, { textract: noHandwriting, rekognition: client, iwf: noMatch }));
    expect(v).toEqual({ status: 'FLAGGED', labels: [DRAWN_WORDS_LABEL] });
  });
});

describe('what gets stored', () => {
  it('the upload verdict records the deferral and whether a reviewer may look', async () => {
    const { db, writes } = fakeDb();
    const { client } = rekognition([L('Explicit')]);
    await moderateAndRecord(db, { assetId: 'a1', familyId: 'f1', buffer: await png(), sha256: 'x' }, realProviders(DEFERRED, { textract: noHandwriting, rekognition: client }));
    const set = writes.find((w) => 'moderationStatus' in w)!;
    expect(set.moderationStatus).toBe('FLAGGED');
    expect((set.moderationDetail as { original: unknown }).original).toMatchObject({ status: 'FLAGGED', hashCheck: 'deferred', sensitive: true });
  });

  it('a Studio design flagged for nudity is marked sensitive on top of a clean deferred upload', async () => {
    const { db, writes } = fakeDb();
    const { client } = rekognition([L('Explicit')]);
    await moderateDesignAndRecord(db, { assetId: 'a1', familyId: 'f1', buffer: await png() }, realProviders(DEFERRED, { textract: noHandwriting, rekognition: client }));
    const set = writes.find((w) => 'moderationStatus' in w)!;
    expect(set.moderationStatus).toBe('FLAGGED');
    expect((set.moderationDetail as { design: unknown }).design).toMatchObject({ status: 'FLAGGED', sensitive: true });
  });
});
