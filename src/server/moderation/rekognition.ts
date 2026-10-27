/**
 * AWS Rekognition adapters (D8): the upload classifier (DetectModerationLabels) and the
 * words-in-a-picture reader (DetectText). London (eu-west-2) ONLY — the client refuses any
 * other region and pins the endpoint, so an env override can't quietly route a child's
 * picture somewhere else.
 *
 * Single-image rule: each call carries the one picture's pixels and nothing else — no ids,
 * no family/child data, no filenames, no human-review loop. The picture is re-encoded to a
 * plain JPEG first (Rekognition takes JPEG/PNG up to 5 MB), which also drops any metadata.
 *
 * Fail-safe: the classifier never throws — any error or odd reply comes back FLAGGED for
 * review, never clear. The text reader throws on failure; its caller files that as
 * 'text-unreadable' (also review).
 */
import { DetectModerationLabelsCommand, DetectTextCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import sharp from 'sharp';
import type { ClassifierProvider, TextReaderProvider } from './providers';

export const MODERATION_REGION = 'eu-west-2';

/** AWS's own default. A hit only sends the picture to the review queue, never rejects it. */
export const DEFAULT_MIN_CONFIDENCE = 50;

/** Label used whenever the classifier couldn't give a clean answer. */
export const SCREENING_UNAVAILABLE = 'screening-unavailable';

/** The one thing we need from the SDK client — lets tests inject a fake (no network). */
export interface RekognitionLike {
  send(command: DetectModerationLabelsCommand | DetectTextCommand): Promise<unknown>;
}

export function createRekognitionClient(cfg: { region: string; accessKeyId: string; secretAccessKey: string }): RekognitionClient {
  if (cfg.region !== MODERATION_REGION) {
    throw new Error(`Rekognition must run in ${MODERATION_REGION} (children's pictures stay in the UK); refusing region "${cfg.region}"`);
  }
  return new RekognitionClient({
    region: MODERATION_REGION,
    // pinned: AWS_ENDPOINT_URL* env vars can't redirect it
    endpoint: `https://rekognition.${MODERATION_REGION}.amazonaws.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    maxAttempts: 3,
  });
}

const MAX_INPUT_PIXELS = 60_000_000; // decompression-bomb guard
const MAX_EDGE = 2048; // plenty for moderation + OCR; keeps us well under the 5 MB limit
const MAX_BYTES = 5 * 1024 * 1024;

/** Re-encode to a flat JPEG (no alpha, no metadata) that Rekognition accepts. */
export async function toRekognitionBytes(buffer: Buffer): Promise<Uint8Array> {
  const out = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .flatten({ background: '#ffffff' }) // transparent drawings would otherwise go black
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  if (out.byteLength > MAX_BYTES) throw new Error('image too large for screening');
  return out;
}

type Prepare = (buffer: Buffer) => Promise<Uint8Array>;

/** Error name only — never the image, never the message body. */
const errName = (e: unknown) => (e instanceof Error ? e.name : 'UnknownError');

/**
 * Map a DetectModerationLabels reply to our verdict. Any label at or above the threshold
 * flags. A reply we can't read, or a label without a usable confidence, also flags.
 */
export function mapModerationLabels(out: unknown, minConfidence: number): { flagged: boolean; labels: string[] } {
  const list = (out as { ModerationLabels?: unknown } | null)?.ModerationLabels;
  if (!Array.isArray(list)) return { flagged: true, labels: [SCREENING_UNAVAILABLE] };
  const labels = new Set<string>();
  for (const raw of list) {
    const l = raw as { Name?: unknown; Confidence?: unknown };
    const name = typeof l?.Name === 'string' && l.Name.trim() ? l.Name.trim() : 'unnamed-label';
    const conf = l?.Confidence;
    if (typeof conf !== 'number' || Number.isNaN(conf)) labels.add(name); // can't judge it → review
    else if (conf >= minConfidence) labels.add(name);
  }
  return { flagged: labels.size > 0, labels: [...labels] };
}

export function rekognitionClassifier(opts: { client: RekognitionLike; minConfidence?: number; prepare?: Prepare }): ClassifierProvider {
  const minConfidence = opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const prepare = opts.prepare ?? toRekognitionBytes;
  return {
    async classify(buffer) {
      try {
        const bytes = await prepare(buffer);
        const out = await opts.client.send(new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: minConfidence }));
        return mapModerationLabels(out, minConfidence);
      } catch (e) {
        console.warn(`[moderation] classifier unavailable (${errName(e)}) — held for review`);
        return { flagged: true, labels: [SCREENING_UNAVAILABLE] };
      }
    },
  };
}

/** Lines of text found in the picture (falls back to single words if no lines came back). */
export function mapTextDetections(out: unknown): string[] {
  const list = (out as { TextDetections?: unknown } | null)?.TextDetections;
  if (!Array.isArray(list)) throw new Error('unreadable text-detection reply');
  const of = (type: string) =>
    list
      .map((d) => d as { Type?: unknown; DetectedText?: unknown })
      .filter((d) => d?.Type === type && typeof d.DetectedText === 'string' && d.DetectedText.trim())
      .map((d) => (d.DetectedText as string).trim());
  const lines = of('LINE');
  return lines.length ? lines : of('WORD');
}

export function rekognitionTextReader(opts: { client: RekognitionLike; prepare?: Prepare }): TextReaderProvider {
  const prepare = opts.prepare ?? toRekognitionBytes;
  return {
    async read(buffer) {
      try {
        const bytes = await prepare(buffer);
        const out = await opts.client.send(new DetectTextCommand({ Image: { Bytes: bytes } }));
        return mapTextDetections(out);
      } catch (e) {
        console.warn(`[moderation] text reader unavailable (${errName(e)}) — held for review`);
        throw new Error('text reader unavailable');
      }
    },
  };
}
