import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetectModerationLabelsCommand, DetectTextCommand } from '@aws-sdk/client-rekognition';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  createRekognitionClient,
  mapModerationLabels,
  mapTextDetections,
  rekognitionClassifier,
  rekognitionTextReader,
  toRekognitionBytes,
  type RekognitionLike,
} from '../rekognition';
import { defaultProviders, isModerationConfigured, moderateDesignAndRecord, moderateImage, readRealModerationConfig } from '../index';

const identity = async (b: Buffer) => new Uint8Array(b);
const label = (Name: string, Confidence?: number, ParentName = '') => ({ Name, Confidence, ParentName });

/** A fake SDK client that records every command and answers per command type. */
function fakeClient(answer: { moderation?: unknown; text?: unknown; fail?: Error } = {}) {
  const sent: (DetectModerationLabelsCommand | DetectTextCommand)[] = [];
  const client: RekognitionLike = {
    async send(cmd) {
      sent.push(cmd);
      if (answer.fail) throw answer.fail;
      return cmd instanceof DetectTextCommand ? (answer.text ?? { TextDetections: [] }) : (answer.moderation ?? { ModerationLabels: [] });
    },
  };
  return { client, sent };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('label → verdict mapping (DetectModerationLabels)', () => {
  it('flags at or above the threshold, ignores below it', () => {
    expect(mapModerationLabels({ ModerationLabels: [label('Violence', 49.99)] }, 50)).toEqual({ flagged: false, labels: [] });
    expect(mapModerationLabels({ ModerationLabels: [label('Violence', 50)] }, 50)).toEqual({ flagged: true, labels: ['Violence'] });
    expect(mapModerationLabels({ ModerationLabels: [label('Violence', 50.01)] }, 50)).toEqual({ flagged: true, labels: ['Violence'] });
    expect(mapModerationLabels({ ModerationLabels: [label('Violence', 79)] }, 80).flagged).toBe(false);
  });

  it('keeps every label name once (parents + children)', () => {
    const out = { ModerationLabels: [label('Violence', 90), label('Graphic Violence', 88, 'Violence'), label('Violence', 90)] };
    expect(mapModerationLabels(out, 50)).toEqual({ flagged: true, labels: ['Violence', 'Graphic Violence'] });
  });

  it('a clean reply (empty list) is clear', () => {
    expect(mapModerationLabels({ ModerationLabels: [], ModerationModelVersion: '7.0' }, 50)).toEqual({ flagged: false, labels: [] });
  });

  it('an unreadable reply or a label without a confidence goes to review, never clear', () => {
    expect(mapModerationLabels({}, 50)).toEqual({ flagged: true, labels: ['screening-unavailable'] });
    expect(mapModerationLabels(null, 50).flagged).toBe(true);
    expect(mapModerationLabels({ ModerationLabels: 'nope' }, 50).flagged).toBe(true);
    expect(mapModerationLabels({ ModerationLabels: [label('Drugs')] }, 50)).toEqual({ flagged: true, labels: ['Drugs'] });
    expect(mapModerationLabels({ ModerationLabels: [{ Confidence: 99 }] }, 50)).toEqual({ flagged: true, labels: ['unnamed-label'] });
  });
});

describe('Rekognition classifier', () => {
  it('sends ONLY the one image + threshold — nothing else (single-image rule)', async () => {
    const { client, sent } = fakeClient({ moderation: { ModerationLabels: [label('Suggestive', 70)] } });
    const img = Buffer.from('the-one-image');
    const v = await rekognitionClassifier({ client, minConfidence: 60, prepare: identity }).classify(img);
    expect(v).toEqual({ flagged: true, labels: ['Suggestive'] });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(DetectModerationLabelsCommand);
    expect(sent[0]!.input).toStrictEqual({ Image: { Bytes: new Uint8Array(img) }, MinConfidence: 60 });
  });

  it('uses the documented default threshold (50)', async () => {
    const { client, sent } = fakeClient();
    await rekognitionClassifier({ client, prepare: identity }).classify(Buffer.from('x'));
    expect((sent[0]!.input as { MinConfidence: number }).MinConfidence).toBe(50);
  });

  it('any provider error → FLAGGED for review, never clear, never thrown', async () => {
    for (const fail of [Object.assign(new Error('Rate exceeded secret-detail'), { name: 'ThrottlingException' }), new Error('network down')]) {
      const { client } = fakeClient({ fail });
      expect(await rekognitionClassifier({ client, prepare: identity }).classify(Buffer.from('x'))).toEqual({ flagged: true, labels: ['screening-unavailable'] });
    }
    // a picture we can't even decode is review too
    const { client, sent } = fakeClient();
    expect((await rekognitionClassifier({ client }).classify(Buffer.from('not an image'))).flagged).toBe(true);
    expect(sent).toHaveLength(0);
    for (const call of warn.mock.calls) expect(String(call[0])).not.toContain('secret-detail');
  });
});

describe('Rekognition text reader', () => {
  it('sends ONLY the one image', async () => {
    const { client, sent } = fakeClient({ text: { TextDetections: [] } });
    const img = Buffer.from('the-one-image');
    await rekognitionTextReader({ client, prepare: identity }).read(img);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(DetectTextCommand);
    expect(sent[0]!.input).toStrictEqual({ Image: { Bytes: new Uint8Array(img) } });
  });

  it('returns lines, or words when no lines came back', () => {
    const d = (Type: string, DetectedText: string) => ({ Type, DetectedText, Confidence: 90 });
    expect(mapTextDetections({ TextDetections: [d('LINE', 'happy birthday'), d('WORD', 'happy'), d('WORD', 'birthday')] })).toEqual(['happy birthday']);
    expect(mapTextDetections({ TextDetections: [d('WORD', 'hi'), d('WORD', ' '), d('WORD', 'gran')] })).toEqual(['hi', 'gran']);
    expect(mapTextDetections({ TextDetections: [] })).toEqual([]);
    expect(() => mapTextDetections({})).toThrow();
  });

  it('a failed read throws (the caller files it as text-unreadable)', async () => {
    const { client } = fakeClient({ fail: new Error('boom') });
    await expect(rekognitionTextReader({ client, prepare: identity }).read(Buffer.from('x'))).rejects.toThrow(/unavailable/);
    const odd = fakeClient({ text: { nope: true } });
    await expect(rekognitionTextReader({ client: odd.client, prepare: identity }).read(Buffer.from('x'))).rejects.toThrow();
  });
});

describe('what leaves the box', () => {
  it('a plain JPEG of the picture: no metadata, no alpha, bounded size', async () => {
    const png = await sharp({ create: { width: 3000, height: 1500, channels: 4, background: { r: 200, g: 10, b: 10, alpha: 0.5 } } })
      .png()
      .withMetadata({ exif: { IFD0: { Copyright: 'family-name-here' } } })
      .toBuffer();
    const out = Buffer.from(await toRekognitionBytes(png));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect(meta.hasAlpha).toBe(false);
    expect(Math.max(meta.width!, meta.height!)).toBe(2048);
    expect(out.includes('family-name-here')).toBe(false);
  });
});

describe('region guard (eu-west-2 only)', () => {
  const creds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'example-secret' };
  it('refuses any other region', () => {
    for (const region of ['us-east-1', 'eu-west-1', 'eu-central-1', '']) {
      expect(() => createRekognitionClient({ region, ...creds })).toThrow(/eu-west-2/);
    }
  });
  it('builds a London client with a pinned endpoint', async () => {
    const prev = process.env.AWS_ENDPOINT_URL;
    process.env.AWS_ENDPOINT_URL = 'https://elsewhere.example.com';
    try {
      const c = createRekognitionClient({ region: 'eu-west-2', ...creds });
      expect(await c.config.region()).toBe('eu-west-2');
      const ep = await c.config.endpoint!();
      expect(ep.hostname).toBe('rekognition.eu-west-2.amazonaws.com');
    } finally {
      if (prev === undefined) delete process.env.AWS_ENDPOINT_URL;
      else process.env.AWS_ENDPOINT_URL = prev;
    }
  });
});

describe('config + production guards', () => {
  let dir: string;
  let listPath: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sd-modcfg-'));
    listPath = join(dir, 'iwf.txt');
    await writeFile(listPath, `sha256:${'0'.repeat(64)}\n`);
    await chmod(listPath, 0o600);
  });
  afterEach(async () => rm(dir, { recursive: true, force: true }));

  const realEnv = (extra: Record<string, string> = {}) => ({
    MODERATION_PROVIDER: 'real',
    MODERATION_AWS_ACCESS_KEY_ID: 'AKIDEXAMPLE',
    MODERATION_AWS_SECRET_ACCESS_KEY: 'super-secret-value',
    IWF_HASH_LIST_PATH: listPath,
    ...extra,
  });

  it('"real" with missing config refuses to construct, naming what is missing (never the secret)', () => {
    expect(() => defaultProviders({ MODERATION_PROVIDER: 'real' })).toThrow(/MODERATION_AWS_ACCESS_KEY_ID.*MODERATION_AWS_SECRET_ACCESS_KEY.*IWF_HASH_LIST_PATH/);
    const err = (() => {
      try {
        readRealModerationConfig(realEnv({ MODERATION_AWS_REGION: 'us-east-1', REKOGNITION_MIN_CONFIDENCE: '0' }));
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).toMatch(/MODERATION_AWS_REGION must be eu-west-2/);
    expect(err?.message).toMatch(/REKOGNITION_MIN_CONFIDENCE/);
    expect(err?.message).not.toContain('super-secret-value');
  });

  it('isModerationConfigured reflects real config', () => {
    expect(isModerationConfigured({})).toBe(false);
    expect(isModerationConfigured({ MODERATION_PROVIDER: 'stub' })).toBe(false);
    expect(isModerationConfigured({ MODERATION_PROVIDER: 'real' })).toBe(false);
    expect(isModerationConfigured(realEnv({ MODERATION_AWS_REGION: 'eu-west-1' }))).toBe(false);
    expect(isModerationConfigured(realEnv())).toBe(true);
  });

  it('the stub never runs in production; unknown modes are refused', () => {
    expect(() => defaultProviders({ NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => defaultProviders({ NODE_ENV: 'production', MODERATION_PROVIDER: 'stub' })).toThrow(/production/);
    expect(() => defaultProviders({ MODERATION_PROVIDER: 'Real' })).toThrow(/must be/);
    expect(defaultProviders({ NODE_ENV: 'development' }).classifier).toBeTruthy();
  });

  it('real providers end to end: hash list in-process, then ONLY the image to Rekognition', async () => {
    const { client, sent } = fakeClient({ moderation: { ModerationLabels: [] } });
    const p = defaultProviders(realEnv({ NODE_ENV: 'production', REKOGNITION_MIN_CONFIDENCE: '65' }), { rekognition: client });
    const img = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#2f5da8' } }).png().toBuffer();
    expect(await moderateImage({ buffer: img, sha256: 'x', originalBuffer: Buffer.from('original-bytes') }, p)).toEqual({ status: 'CLEAR', labels: [] });
    expect(sent).toHaveLength(1);
    const input = sent[0]!.input as { Image: { Bytes: Uint8Array }; MinConfidence: number };
    expect(Object.keys(input).sort()).toEqual(['Image', 'MinConfidence']);
    expect(Object.keys(input.Image)).toEqual(['Bytes']);
    expect(input.MinConfidence).toBe(65);
    const sentMeta = await sharp(Buffer.from(input.Image.Bytes)).metadata();
    expect([sentMeta.width, sentMeta.height]).toEqual([120, 90]); // the same one picture, re-encoded
  });

  it('a design goes through the classifier AND the reader, each with only the image', async () => {
    const { client, sent } = fakeClient({ text: { TextDetections: [{ Type: 'LINE', DetectedText: 'love you gran' }] } });
    const p = defaultProviders(realEnv(), { rekognition: client });
    const writes: unknown[] = [];
    const db = {
      select: () => ({ from: () => ({ where: async () => [{ status: 'CLEAR', detail: {} }] }) }),
      update: () => ({ set: (v: unknown) => ({ where: async () => void writes.push(v) }) }),
      insert: () => ({ values: async (v: unknown) => void writes.push(v) }),
    } as never;
    const img = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const v = await moderateDesignAndRecord(db, { assetId: 'a1', familyId: 'f1', buffer: img }, p);
    expect(v.status).toBe('CLEAR');
    expect(sent.map((c) => c.constructor.name).sort()).toEqual(['DetectModerationLabelsCommand', 'DetectTextCommand']);
    for (const c of sent) {
      const keys = Object.keys(c.input).filter((k) => k !== 'MinConfidence');
      expect(keys).toEqual(['Image']);
      expect(Object.keys((c.input as { Image: object }).Image)).toEqual(['Bytes']);
    }
  });

  it('a design whose screening errors is held for review', async () => {
    const { client } = fakeClient({ fail: new Error('down') });
    const p = defaultProviders(realEnv(), { rekognition: client });
    const db = {
      select: () => ({ from: () => ({ where: async () => [{ status: 'CLEAR', detail: {} }] }) }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
      insert: () => ({ values: async () => {} }),
    } as never;
    const img = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const v = await moderateDesignAndRecord(db, { assetId: 'a1', familyId: 'f1', buffer: img }, p);
    expect(v.status).toBe('FLAGGED');
    expect(v.labels).toEqual(expect.arrayContaining(['screening-unavailable', 'text-unreadable']));
  });
});
