import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { DRAWN_WORDS_LABEL, TEXT_UNREADABLE_LABEL, moderateImage } from '../index';
import { realProviders } from '../providers';
import { REKOGNITION_REGION, type RekognitionPort } from '../rekognition';
import { TEXTRACT_REGION, TextractRegionError, TextractResponseError, combinedTextReader, createTextractClient, mapDocumentText, textractTextReader, type TextractPort } from '../textract';
import { TEXTRACT_READER_CONFIG } from '../config';

/**
 * The handwriting reader (founder's test, 9 Nov 2026: "wanker" written in biro and photographed came
 * back with no words from Rekognition, so it wasn't flagged). Mocked clients only — no image leaves.
 */

const png = () => sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 250, g: 250, b: 245 } } }).png().toBuffer();
const DEFERRED = { MODERATION_PROVIDER: 'real', CSAM_HASH_CHECK: 'deferred' };

const textract = (blocks: unknown[] | Error) => {
  const send = vi.fn(async () => {
    if (blocks instanceof Error) throw blocks;
    return { Blocks: blocks };
  });
  return { client: { config: { region: TEXTRACT_REGION }, send } as unknown as TextractPort, send };
};
/** Rekognition: a clean classifier and a printed-text reader that finds nothing (as on the founder's photo). */
const rekognitionSeesNothing = () => {
  const send = vi.fn(async (cmd: { constructor: { name: string } }) => (cmd.constructor.name === 'DetectTextCommand' ? { TextDetections: [] } : { ModerationLabels: [] }));
  return { config: { region: REKOGNITION_REGION }, send } as unknown as RekognitionPort;
};
const handwritten = (text: string, Confidence = 62) => [
  { BlockType: 'PAGE' },
  { BlockType: 'LINE', Text: text, Confidence },
  ...text.split(' ').map((w) => ({ BlockType: 'WORD', Text: w, Confidence, TextType: 'HANDWRITING' })),
];

describe('the founder’s test: a rude word in biro handwriting', () => {
  it('Rekognition reads nothing, Textract reads it → FLAGGED for drawn words (held, never rejected)', async () => {
    const { client } = textract(handwritten('wanker'));
    const v = await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(DEFERRED, { rekognition: rekognitionSeesNothing(), textract: client }));
    expect(v).toEqual({ status: 'FLAGGED', labels: [DRAWN_WORDS_LABEL], hashCheck: 'deferred', sensitive: false });
  });

  it('kind handwriting passes', async () => {
    const { client } = textract(handwritten('love you nana'));
    expect((await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(DEFERRED, { rekognition: rekognitionSeesNothing(), textract: client }))).status).toBe('CLEAR');
  });

  it('a Textract failure (e.g. no permission yet) holds the picture as unreadable — never waves it through', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = textract(Object.assign(new Error('denied'), { name: 'AccessDeniedException' }));
    const v = await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(DEFERRED, { rekognition: rekognitionSeesNothing(), textract: client }));
    expect(v).toMatchObject({ status: 'FLAGGED', labels: [TEXT_UNREADABLE_LABEL] });
  });
});

describe('Textract reader — rules', () => {
  it('reads LINEs and WORDs above a deliberately low confidence; PAGE blocks and faint guesses are ignored', () => {
    const words = mapDocumentText({
      Blocks: [
        { BlockType: 'PAGE' },
        { BlockType: 'LINE', Text: 'happy birthday', Confidence: 80 },
        { BlockType: 'WORD', Text: 'wanker', Confidence: TEXTRACT_READER_CONFIG.minConfidence },
        { BlockType: 'WORD', Text: 'smudge', Confidence: TEXTRACT_READER_CONFIG.minConfidence - 1 },
      ],
    });
    expect(words).toEqual(['happy birthday', 'wanker']);
  });

  it('an unreadable response THROWS — never read as "no words"', () => {
    for (const bad of [undefined, null, {}, { Blocks: 'none' }]) expect(() => mapDocumentText(bad)).toThrow(TextractResponseError);
  });

  it('sends ONE image as raw bytes, from eu-west-2 only', async () => {
    const { client, send } = textract([]);
    await textractTextReader(client).read(await png());
    expect(send).toHaveBeenCalledTimes(1);
    const input = (send.mock.calls[0] as unknown as [{ input: { Document: { Bytes?: unknown; S3Object?: unknown } } }])[0].input;
    expect(input.Document.Bytes).toBeInstanceOf(Uint8Array);
    expect(input.Document.S3Object).toBeUndefined();
  });

  it('a client outside eu-west-2 is refused before anything is sent', async () => {
    const send = vi.fn();
    const elsewhere = { config: { region: 'us-east-1' }, send } as unknown as TextractPort;
    await expect(textractTextReader(elsewhere).read(await png())).rejects.toBeInstanceOf(TextractRegionError);
    expect(send).not.toHaveBeenCalled();
  });

  it('the real client is pinned to London (region + endpoint)', async () => {
    const c = createTextractClient();
    expect(await c.config.region()).toBe(TEXTRACT_REGION);
    const ep = await c.config.endpoint!();
    expect(ep.hostname).toBe(`textract.${TEXTRACT_REGION}.amazonaws.com`);
  });

  it('a Textract endpoint override is a startup error', () => {
    expect(() => realProviders({ ...DEFERRED, AWS_ENDPOINT_URL_TEXTRACT: 'https://elsewhere.example.com' })).toThrow(/cannot be redirected/);
  });
});

describe('both readers together', () => {
  it('pools the words of printed and handwritten text', async () => {
    const r = combinedTextReader([{ read: async () => ['SALE'] }, { read: async () => ['wanker'] }]);
    expect(await r.read(Buffer.from('x'))).toEqual(['SALE', 'wanker']);
  });

  it('if either reader fails, the whole read fails (held as unreadable, never half-read)', async () => {
    const r = combinedTextReader([{ read: async () => ['fine'] }, { read: async () => Promise.reject(new Error('down')) }]);
    await expect(r.read(Buffer.from('x'))).rejects.toThrow('down');
  });
});

describe('numbers-only diagnostics (why a word was or wasn’t caught)', () => {
  it('records the picture size and how many words each reader found — never the words', async () => {
    const { client } = textract(handwritten('love you nana'));
    const diagnostics: { image?: string; words?: Record<string, number> } = {};
    await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(DEFERRED, { rekognition: rekognitionSeesNothing(), textract: client }), { diagnostics });
    expect(diagnostics.image).toBe('64x64');
    expect(diagnostics.words).toEqual({ printed: 0, handwriting: 4 }); // 1 line + 3 words
    expect(JSON.stringify(diagnostics)).not.toMatch(/love|nana/);
  });
});

describe('test-site-only word debugging (to tune the matching)', () => {
  const run = async () => {
    const { client } = textract(handwritten('wauker'));
    const diagnostics: { readWords?: string[] } = {};
    await moderateImage({ buffer: await png(), sha256: 'x' }, realProviders(DEFERRED, { rekognition: rekognitionSeesNothing(), textract: client }), { diagnostics });
    return diagnostics;
  };
  const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<unknown>) => {
    const keep = { SITE_MODE: process.env.SITE_MODE, SCREENING_DEBUG_WORDS: process.env.SCREENING_DEBUG_WORDS };
    Object.assign(process.env, env);
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(keep)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };

  it('records the words read only on the TEST site with the switch on', async () => {
    const d = (await withEnv({ SITE_MODE: 'test', SCREENING_DEBUG_WORDS: 'true' }, run)) as { readWords?: string[] };
    expect(d.readWords).toContain('wauker');
  });

  it('never on the private-live or public site, or with the switch off', async () => {
    for (const env of [{ SITE_MODE: 'private', SCREENING_DEBUG_WORDS: 'true' }, { SITE_MODE: undefined, SCREENING_DEBUG_WORDS: 'true' }, { SITE_MODE: 'test', SCREENING_DEBUG_WORDS: undefined }]) {
      const d = (await withEnv(env, run)) as { readWords?: string[] };
      expect(d.readWords).toBeUndefined();
    }
  });
});
