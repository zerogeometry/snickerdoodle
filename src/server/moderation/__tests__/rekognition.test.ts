import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { DetectModerationLabelsCommand, DetectTextCommand } from '@aws-sdk/client-rekognition';
import { CLASSIFIER_CONFIG, type ClassifierConfig } from '../config';
import {
  REKOGNITION_REGION,
  RekognitionRegionError,
  RekognitionResponseError,
  createRekognitionClient,
  mapDetectedText,
  mapModerationLabels,
  rekognitionClassifier,
  rekognitionTextReader,
  type RekognitionPort,
} from '../rekognition';

/**
 * The real Rekognition providers, against a MOCKED client / transport only. Nothing here talks
 * to AWS and no real image is used — the "pictures" are generated 8×8 squares.
 */

const png = (w = 8, h = 8) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer();

/** A mocked Rekognition client: records every command, answers with `reply`. */
function mockClient(reply: unknown = { ModerationLabels: [] }, region: string | (() => Promise<string>) = REKOGNITION_REGION) {
  const sent: (DetectModerationLabelsCommand | DetectTextCommand)[] = [];
  const client: RekognitionPort = {
    config: { region },
    send: vi.fn(async (cmd) => {
      sent.push(cmd);
      if (reply instanceof Error) throw reply;
      return reply;
    }),
  };
  return { client, sent };
}

const label = (Name: string, Confidence: number, ParentName = '') => ({ Name, ParentName, Confidence });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Rekognition — exactly ONE image per call', () => {
  it('classify sends one DetectModerationLabels with only that image\'s bytes (no S3 ref, no human loop, no custom model)', async () => {
    const { client, sent } = mockClient();
    const img = await png();
    await rekognitionClassifier(client).classify(img);
    expect(sent).toHaveLength(1);
    const cmd = sent[0]!;
    expect(cmd).toBeInstanceOf(DetectModerationLabelsCommand);
    expect(Object.keys(cmd.input).sort()).toEqual(['Image', 'MinConfidence']);
    const image = (cmd.input as { Image: Record<string, unknown> }).Image;
    expect(Object.keys(image)).toEqual(['Bytes']);
    expect(Buffer.from(image.Bytes as Uint8Array).equals(img)).toBe(true);
  });

  it('read sends one DetectText with only that image\'s bytes', async () => {
    const { client, sent } = mockClient({ TextDetections: [] });
    const img = await png();
    await rekognitionTextReader(client).read(img);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(DetectTextCommand);
    expect(Object.keys(sent[0]!.input)).toEqual(['Image']);
    const image = (sent[0]!.input as { Image: Record<string, unknown> }).Image;
    expect(Object.keys(image)).toEqual(['Bytes']);
    expect(Buffer.from(image.Bytes as Uint8Array).equals(img)).toBe(true);
  });

  it('two pictures are two separate calls — never batched', async () => {
    const { client, sent } = mockClient();
    const c = rekognitionClassifier(client);
    const a = await png(8, 8);
    const b = await png(9, 9);
    await c.classify(a);
    await c.classify(b);
    expect(sent).toHaveLength(2);
    expect(Buffer.from((sent[0]!.input as { Image: { Bytes: Uint8Array } }).Image.Bytes).equals(a)).toBe(true);
    expect(Buffer.from((sent[1]!.input as { Image: { Bytes: Uint8Array } }).Image.Bytes).equals(b)).toBe(true);
  });

  it('a WebP (profile pictures) is resampled to a JPEG Rekognition can read — still one image', async () => {
    const { client, sent } = mockClient();
    const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } }).webp().toBuffer();
    await rekognitionClassifier(client).classify(webp);
    expect(sent).toHaveLength(1);
    const bytes = Buffer.from((sent[0]!.input as { Image: { Bytes: Uint8Array } }).Image.Bytes);
    expect((await sharp(bytes).metadata()).format).toBe('jpeg');
  });

  it('on the wire: one request, to eu-west-2, carrying one image and nothing else', async () => {
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'AKIDEXAMPLE'); // fake, for request signing only
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'not-a-real-secret');
    const requests: { hostname: string; headers: Record<string, string>; body: string }[] = [];
    const client = createRekognitionClient({ requestHandler: fakeTransport(requests, { ModerationLabels: [] }) });
    const img = await png();
    await rekognitionClassifier(client).classify(img);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.hostname).toBe('rekognition.eu-west-2.amazonaws.com');
    expect(requests[0]!.headers['x-amz-target']).toBe('RekognitionService.DetectModerationLabels');
    const body = JSON.parse(requests[0]!.body);
    expect(Object.keys(body).sort()).toEqual(['Image', 'MinConfidence']);
    expect(Object.keys(body.Image)).toEqual(['Bytes']);
    expect(Buffer.from(body.Image.Bytes, 'base64').equals(img)).toBe(true);
  });
});

/** A fake HTTP transport for a REAL RekognitionClient: records requests, never touches the network. */
function fakeTransport(requests: { hostname: string; headers: Record<string, string>; body: string }[], reply: unknown) {
  return {
    async handle(request: { hostname: string; headers: Record<string, string>; body: string }) {
      requests.push({ hostname: request.hostname, headers: request.headers, body: request.body });
      return { response: { statusCode: 200, headers: { 'content-type': 'application/x-amz-json-1.1' }, body: Readable.from([Buffer.from(JSON.stringify(reply))]) } };
    },
    updateHttpClientConfig() {},
    httpHandlerConfigs: () => ({}),
  } as never;
}

describe('Rekognition — region pinned to eu-west-2', () => {
  it('the client is in eu-west-2 whatever AWS_REGION says', async () => {
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('AWS_DEFAULT_REGION', 'us-east-1');
    expect(await createRekognitionClient().config.region()).toBe('eu-west-2');
  });

  it('refuses a client in any other region — before a single byte is sent', async () => {
    for (const region of ['us-east-1', 'eu-west-1', async () => 'us-west-2']) {
      const { client, sent } = mockClient({ ModerationLabels: [] }, region);
      await expect(rekognitionClassifier(client).classify(await png())).rejects.toBeInstanceOf(RekognitionRegionError);
      await expect(rekognitionTextReader(client).read(await png())).rejects.toBeInstanceOf(RekognitionRegionError);
      expect(sent).toHaveLength(0);
    }
  });

  it('an AWS_ENDPOINT_URL override can\'t redirect the picture', async () => {
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'AKIDEXAMPLE');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'not-a-real-secret');
    vi.stubEnv('AWS_ENDPOINT_URL', 'https://somewhere-else.example.com');
    vi.stubEnv('AWS_ENDPOINT_URL_REKOGNITION', 'https://somewhere-else.example.com');
    const requests: { hostname: string; headers: Record<string, string>; body: string }[] = [];
    await rekognitionClassifier(createRekognitionClient({ requestHandler: fakeTransport(requests, { ModerationLabels: [] }) })).classify(await png());
    expect(requests.map((r) => r.hostname)).toEqual(['rekognition.eu-west-2.amazonaws.com']);
  });

  it('a request bound for any other host is refused at the last step, unsent', async () => {
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'AKIDEXAMPLE');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'not-a-real-secret');
    const requests: { hostname: string; headers: Record<string, string>; body: string }[] = [];
    const client = createRekognitionClient({ requestHandler: fakeTransport(requests, { ModerationLabels: [] }) });
    // simulate something re-pointing the client after it was built
    (client.config as unknown as { endpoint: () => Promise<unknown> }).endpoint = async () => ({ protocol: 'https:', hostname: 'somewhere-else.example.com', path: '/' });
    await expect(rekognitionClassifier(client).classify(await png())).rejects.toBeInstanceOf(RekognitionRegionError);
    expect(requests).toHaveLength(0);
  });
});

describe('Rekognition — threshold + label mapping (config.ts)', () => {
  it('sends the configured confidence threshold', async () => {
    const { client, sent } = mockClient();
    await rekognitionClassifier(client).classify(await png());
    expect((sent[0]!.input as { MinConfidence: number }).MinConfidence).toBe(CLASSIFIER_CONFIG.minConfidence);
  });

  it('nothing found → not flagged', () => {
    expect(mapModerationLabels({ ModerationLabels: [] })).toEqual({ flagged: false, labels: [] });
  });

  it('a flag-listed category at/above the threshold FLAGS, with the label', () => {
    const t = CLASSIFIER_CONFIG.minConfidence;
    expect(mapModerationLabels({ ModerationLabels: [label('Violence', t)] })).toEqual({ flagged: true, labels: ['Violence'] });
    expect(mapModerationLabels({ ModerationLabels: [label('Explicit', 99)] }).flagged).toBe(true);
    expect(mapModerationLabels({ ModerationLabels: [label('Hate Symbols', 80)] }).flagged).toBe(true);
  });

  it('below the threshold never flags', () => {
    expect(mapModerationLabels({ ModerationLabels: [label('Violence', CLASSIFIER_CONFIG.minConfidence - 0.1)] })).toEqual({ flagged: false, labels: [] });
  });

  it('a child label flags through its flag-listed parent', () => {
    const v = mapModerationLabels({ ModerationLabels: [label('Violence', 90), label('Graphic Violence', 88, 'Violence'), label('Blood & Gore', 85, 'Graphic Violence')] });
    expect(v).toEqual({ flagged: true, labels: ['Blood & Gore'] });
  });

  it('ignore-listed categories (e.g. swimwear at the beach) don\'t send a child\'s picture to a person', () => {
    expect(mapModerationLabels({ ModerationLabels: [label('Swimwear or Underwear', 97), label('Female Swimwear or Underwear', 95, 'Swimwear or Underwear')] })).toEqual({ flagged: false, labels: [] });
    expect(mapModerationLabels({ ModerationLabels: [label('Alcohol', 90)] }).flagged).toBe(false);
  });

  it('an UNKNOWN category flags (fail-safe — a renamed category is never waved through)', () => {
    expect(mapModerationLabels({ ModerationLabels: [label('Some New Category', 90)] })).toEqual({ flagged: true, labels: ['Some New Category'] });
    expect(mapModerationLabels({ ModerationLabels: [{ Confidence: 90 }] }).flagged).toBe(true);
  });

  it('a level-2 ignore carves an exception out of a flagged category (config-driven)', () => {
    const cfg: ClassifierConfig = { ...CLASSIFIER_CONFIG, ignoreLabels: [...CLASSIFIER_CONFIG.ignoreLabels, 'Weapons'] };
    const sword = { ModerationLabels: [label('Violence', 80), label('Weapons', 80, 'Violence')] };
    expect(mapModerationLabels(sword, CLASSIFIER_CONFIG).flagged).toBe(true);
    expect(mapModerationLabels(sword, cfg)).toEqual({ flagged: false, labels: [] });
    // …but a flagged sibling still flags
    expect(mapModerationLabels({ ModerationLabels: [...sword.ModerationLabels, label('Graphic Violence', 80, 'Violence')] }, cfg).labels).toEqual(['Graphic Violence']);
  });

  it('a missing confidence counts as at the threshold (fail-safe)', () => {
    expect(mapModerationLabels({ ModerationLabels: [{ Name: 'Violence' }] }).flagged).toBe(true);
  });

  it('an unreadable response THROWS — it is never read as "nothing found"', () => {
    for (const bad of [undefined, null, {}, { ModerationLabels: 'none' }]) expect(() => mapModerationLabels(bad)).toThrow(RekognitionResponseError);
    for (const bad of [undefined, {}, { TextDetections: null }]) expect(() => mapDetectedText(bad)).toThrow(RekognitionResponseError);
  });

  it('the text reader returns the LINES it read with enough confidence', () => {
    const out = mapDetectedText({
      TextDetections: [
        { Type: 'LINE', DetectedText: 'happy birthday', Confidence: 99 },
        { Type: 'WORD', DetectedText: 'happy', Confidence: 99 },
        { Type: 'LINE', DetectedText: 'scribble', Confidence: 10 },
      ],
    });
    expect(out).toEqual(['happy birthday']);
  });

  it('a Rekognition error propagates (the gate turns it into review, never CLEAR)', async () => {
    const { client } = mockClient(Object.assign(new Error('throttled'), { name: 'ThrottlingException' }));
    await expect(rekognitionClassifier(client).classify(await png())).rejects.toThrow('throttled');
  });
});
