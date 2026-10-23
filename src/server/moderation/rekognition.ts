import { DetectModerationLabelsCommand, DetectTextCommand, RekognitionClient, type RekognitionClientConfig } from '@aws-sdk/client-rekognition';
import sharp from 'sharp';
import { CLASSIFIER_CONFIG, TEXT_READER_CONFIG, type ClassifierConfig, type TextReaderConfig } from './config';
import type { ClassifierProvider, TextReaderProvider } from './providers';

/**
 * The REAL upload classifier + drawn-text reader (D8): AWS Rekognition in eu-west-2.
 *
 * Rules this file enforces (each one is unit-tested in __tests__/rekognition.test.ts):
 *  - REGION: eu-west-2 is pinned here, in code. The client's endpoint is pinned too, so an
 *    AWS_ENDPOINT_URL / shared-config override can't redirect a child's picture, and a request
 *    to any other host is refused before it is sent. A client in another region is refused.
 *  - ONE IMAGE per call, as raw bytes: no S3 reference, no batch, no human-review loop
 *    (HumanLoopConfig is never set), no custom model.
 *  - CREDENTIALS come from the standard AWS provider chain (env, shared config, role). Nothing
 *    here reads, stores or logs them.
 *  - Content Moderation + DetectText only — never a face API (DPIA §4.2).
 *
 * Errors are THROWN, never turned into "clean": the caller routes them to human review
 * (src/server/moderation/index.ts), so a Rekognition outage can never clear an upload.
 *
 * Turning this on is gated on LG3 + LG6, the AWS DPA covering Rekognition, and the AWS
 * Organizations AI-services opt-out policy (DPIA A-08) — see providers.ts.
 */

export const REKOGNITION_REGION = 'eu-west-2' as const;
/** The only hosts a request may go to. */
const ALLOWED_HOSTS = new Set([`rekognition.${REKOGNITION_REGION}.amazonaws.com`]);
const PINNED_ENDPOINT = `https://rekognition.${REKOGNITION_REGION}.amazonaws.com`;

/** Rekognition's raw-bytes limit is 5 MB and it reads JPEG/PNG only. */
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 4096;
/** Big or non-JPEG/PNG images (print-size Studio designs, WebP profile pictures) are resampled to
 * this — plenty for moderation and OCR, and less of a child's picture leaves our hands. */
const RESAMPLE_SIDE = 2048;
const MAX_INPUT_PIXELS = 60_000_000; // decompression-bomb guard

export class RekognitionRegionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RekognitionRegionError';
  }
}

export class RekognitionResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RekognitionResponseError';
  }
}

/** The slice of RekognitionClient the providers use — lets tests pass a mocked client. */
export interface RekognitionPort {
  config: { region: string | (() => Promise<string>) };
  send(command: DetectModerationLabelsCommand | DetectTextCommand): Promise<unknown>;
}

/**
 * Build the Rekognition client: region AND endpoint pinned to eu-west-2, plus a last-line check
 * on the outgoing request's host. Credentials are left to the SDK's default provider chain.
 */
export function createRekognitionClient(opts: { requestHandler?: RekognitionClientConfig['requestHandler'] } = {}): RekognitionClient {
  const client = new RekognitionClient({
    region: REKOGNITION_REGION,
    endpoint: PINNED_ENDPOINT,
    maxAttempts: 3,
    requestHandler: opts.requestHandler ?? { connectionTimeout: 3_000, requestTimeout: 15_000 },
  });
  client.middlewareStack.add(
    (next) => async (args) => {
      const host = (args.request as { hostname?: unknown } | undefined)?.hostname;
      if (typeof host !== 'string' || !ALLOWED_HOSTS.has(host)) {
        throw new RekognitionRegionError(`refusing to send an image to ${String(host)} — Rekognition is pinned to ${REKOGNITION_REGION}`);
      }
      return next(args);
    },
    { step: 'finalizeRequest', name: 'snickerdoodlePinRekognitionHost' },
  );
  return client;
}

/** Refuse any client that isn't in eu-west-2. Runs before EVERY call, so an injected client is checked too. */
export async function assertRekognitionRegion(client: RekognitionPort): Promise<void> {
  const r = client.config.region;
  const region = typeof r === 'function' ? await r() : r;
  if (region !== REKOGNITION_REGION) {
    throw new RekognitionRegionError(`Rekognition must run in ${REKOGNITION_REGION}, not ${String(region)}`);
  }
}

/**
 * The single image's bytes, in a form Rekognition accepts: a JPEG/PNG within its limits goes
 * as-is; anything else is resampled to a JPEG. EXIF is already stripped upstream (ingest).
 */
export async function prepareImageBytes(buffer: Buffer): Promise<Uint8Array> {
  const meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const fits = (meta.format === 'jpeg' || meta.format === 'png') && buffer.byteLength <= MAX_BYTES && (meta.width ?? Infinity) <= MAX_SIDE && (meta.height ?? Infinity) <= MAX_SIDE;
  if (fits) return buffer;
  const out = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: RESAMPLE_SIDE, height: RESAMPLE_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 85 })
    .toBuffer();
  if (out.byteLength > MAX_BYTES) throw new RekognitionResponseError('image is still over the Rekognition size limit after resampling');
  return out;
}

interface Label {
  Name?: unknown;
  ParentName?: unknown;
  Confidence?: unknown;
}

/**
 * Turn a DetectModerationLabels response into a flag decision (see config.ts for the rules).
 * A response we can't read THROWS — it is never read as "nothing found".
 */
export function mapModerationLabels(output: unknown, config: ClassifierConfig = CLASSIFIER_CONFIG): { flagged: boolean; labels: string[] } {
  const raw = (output as { ModerationLabels?: unknown } | null)?.ModerationLabels;
  if (!Array.isArray(raw)) throw new RekognitionResponseError('DetectModerationLabels returned no ModerationLabels list');
  const flagSet = new Set(config.flagLabels);
  const ignoreSet = new Set(config.ignoreLabels);

  // a missing confidence is treated as "at the threshold" (fail-safe), a missing name as unknown
  const labels = (raw as Label[]).filter((l) => (typeof l?.Confidence === 'number' ? l.Confidence >= config.minConfidence : true));
  const name = (l: Label) => (typeof l.Name === 'string' && l.Name ? l.Name : null);
  const parent = (l: Label) => (typeof l.ParentName === 'string' && l.ParentName ? l.ParentName : null);
  const byName = new Map<string, Label>();
  for (const l of labels) if (name(l)) byName.set(name(l)!, l);
  const parents = new Set(labels.map(parent).filter((p): p is string => !!p));
  // judge the most specific labels only: a parent returned alongside its child is decided by the child
  const leaves = labels.filter((l) => !name(l) || !parents.has(name(l)!));

  const flagged: string[] = [];
  for (const leaf of leaves) {
    let decision: 'flag' | 'ignore' | null = null;
    let cur: Label | undefined = leaf;
    let curName = name(leaf);
    const seen = new Set<string>();
    while (curName && !seen.has(curName) && !decision) {
      seen.add(curName);
      if (flagSet.has(curName)) decision = 'flag';
      else if (ignoreSet.has(curName)) decision = 'ignore';
      else {
        const p: string | null = cur ? parent(cur) : null;
        cur = p ? byName.get(p) : undefined;
        curName = p;
      }
    }
    if (decision !== 'ignore') flagged.push(name(leaf) ?? 'unnamed-label'); // flag-listed OR unknown → flag
  }
  return flagged.length ? { flagged: true, labels: [...new Set(flagged)] } : { flagged: false, labels: [] };
}

/** Lines of drawn text from a DetectText response. Unreadable response → throws. */
export function mapDetectedText(output: unknown, config: TextReaderConfig = TEXT_READER_CONFIG): string[] {
  const raw = (output as { TextDetections?: unknown } | null)?.TextDetections;
  if (!Array.isArray(raw)) throw new RekognitionResponseError('DetectText returned no TextDetections list');
  return (raw as { Type?: unknown; DetectedText?: unknown; Confidence?: unknown }[])
    .filter((t) => t?.Type === 'LINE' && typeof t.DetectedText === 'string' && (typeof t.Confidence === 'number' ? t.Confidence >= config.minConfidence : true))
    .map((t) => t.DetectedText as string);
}

/** ClassifierProvider over Rekognition DetectModerationLabels — one image per call. */
export function rekognitionClassifier(client: RekognitionPort, config: ClassifierConfig = CLASSIFIER_CONFIG): ClassifierProvider {
  return {
    async classify(buffer) {
      await assertRekognitionRegion(client);
      const bytes = await prepareImageBytes(buffer);
      const output = await client.send(new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: config.minConfidence }));
      return mapModerationLabels(output, config);
    },
  };
}

/** TextReaderProvider over Rekognition DetectText — one image per call. */
export function rekognitionTextReader(client: RekognitionPort, config: TextReaderConfig = TEXT_READER_CONFIG): TextReaderProvider {
  return {
    async read(buffer) {
      await assertRekognitionRegion(client);
      const bytes = await prepareImageBytes(buffer);
      const output = await client.send(new DetectTextCommand({ Image: { Bytes: bytes } }));
      return mapDetectedText(output, config);
    },
  };
}
