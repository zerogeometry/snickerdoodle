import { DetectDocumentTextCommand, TextractClient, type TextractClientConfig } from '@aws-sdk/client-textract';
import { TEXTRACT_READER_CONFIG, type TextReaderConfig } from './config';
import { prepareImageBytes } from './rekognition';
import type { TextReaderProvider } from './providers';

/**
 * The HANDWRITING reader for the words-in-the-picture check: AWS Textract in eu-west-2.
 *
 * Rekognition's DetectText reads printed text (signs, labels, typed Studio words) but not a biro
 * scrawl — the founder's test on 9 Nov 2026 ("wanker" handwritten on paper) came back with no words
 * at all. Textract's DetectDocumentText reads handwriting, so the words check now uses both readers
 * (providers.ts). Same rules as rekognition.ts, each unit-tested in __tests__/textract.test.ts:
 *  - REGION and ENDPOINT pinned to eu-west-2 in code, plus a last-line host check on every request;
 *    a client in another region is refused before anything is sent.
 *  - ONE IMAGE per call, as raw bytes (no S3 reference, no async job, no human-review loop).
 *  - CREDENTIALS from the standard AWS provider chain; never read, stored or logged here.
 *  - Errors are THROWN, never read as "no words": the caller holds the picture for review.
 * Textract is covered by the AWS DPA and the AWS Organizations AI-services opt-out (DPIA A-08).
 */

export const TEXTRACT_REGION = 'eu-west-2' as const;
const ALLOWED_HOSTS = new Set([`textract.${TEXTRACT_REGION}.amazonaws.com`]);
const PINNED_ENDPOINT = `https://textract.${TEXTRACT_REGION}.amazonaws.com`;

export class TextractRegionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextractRegionError';
  }
}

export class TextractResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextractResponseError';
  }
}

/** The slice of TextractClient the reader uses — lets tests pass a mocked client. */
export interface TextractPort {
  config: { region: string | (() => Promise<string>) };
  send(command: DetectDocumentTextCommand): Promise<unknown>;
}

/** Build the Textract client: region AND endpoint pinned to eu-west-2, plus a host check on every request. */
export function createTextractClient(opts: { requestHandler?: TextractClientConfig['requestHandler'] } = {}): TextractClient {
  const client = new TextractClient({
    region: TEXTRACT_REGION,
    endpoint: PINNED_ENDPOINT,
    maxAttempts: 3,
    requestHandler: opts.requestHandler ?? { connectionTimeout: 3_000, requestTimeout: 15_000 },
  });
  client.middlewareStack.add(
    (next) => async (args) => {
      const host = (args.request as { hostname?: unknown } | undefined)?.hostname;
      if (typeof host !== 'string' || !ALLOWED_HOSTS.has(host)) {
        throw new TextractRegionError(`refusing to send an image to ${String(host)} — Textract is pinned to ${TEXTRACT_REGION}`);
      }
      return next(args);
    },
    { step: 'finalizeRequest', name: 'snickerdoodlePinTextractHost' },
  );
  return client;
}

/** Refuse any client that isn't in eu-west-2. Runs before EVERY call, so an injected client is checked too. */
export async function assertTextractRegion(client: TextractPort): Promise<void> {
  const r = client.config.region;
  const region = typeof r === 'function' ? await r() : r;
  if (region !== TEXTRACT_REGION) throw new TextractRegionError(`Textract must run in ${TEXTRACT_REGION}, not ${String(region)}`);
}

/**
 * The words Textract read: every LINE and every WORD (a scrawled word Textract couldn't join into a
 * line still counts), above a deliberately low confidence — a misread can only send a picture to
 * review, a dropped word can let abuse through. An unreadable response THROWS.
 */
export function mapDocumentText(output: unknown, config: TextReaderConfig = TEXTRACT_READER_CONFIG): string[] {
  const raw = (output as { Blocks?: unknown } | null)?.Blocks;
  if (!Array.isArray(raw)) throw new TextractResponseError('DetectDocumentText returned no Blocks list');
  return (raw as { BlockType?: unknown; Text?: unknown; Confidence?: unknown }[])
    .filter((b) => (b?.BlockType === 'LINE' || b?.BlockType === 'WORD') && typeof b.Text === 'string' && (typeof b.Confidence === 'number' ? b.Confidence >= config.minConfidence : true))
    .map((b) => b.Text as string);
}

/** TextReaderProvider over Textract DetectDocumentText — one image per call. */
export function textractTextReader(client: TextractPort, config: TextReaderConfig = TEXTRACT_READER_CONFIG): TextReaderProvider {
  return {
    async read(buffer) {
      await assertTextractRegion(client);
      const bytes = await prepareImageBytes(buffer); // JPEG/PNG, ≤ 5 MB, ≤ 4096 px: inside Textract's limits too
      const output = await client.send(new DetectDocumentTextCommand({ Document: { Bytes: bytes } }));
      return mapDocumentText(output, config);
    },
  };
}

/**
 * Several readers over the same one image, their words pooled: printed text (Rekognition) AND
 * handwriting (Textract). If ANY reader fails the whole read fails — the picture is held as
 * "text-unreadable", never waved through on half a read.
 */
export function combinedTextReader(readers: readonly TextReaderProvider[]): TextReaderProvider {
  return {
    async read(buffer) {
      const all = await Promise.all(readers.map((r) => r.read(buffer)));
      return all.flat();
    },
  };
}
