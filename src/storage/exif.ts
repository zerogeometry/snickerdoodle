import { createHash } from 'node:crypto';
import sharp from 'sharp';

export interface SanitisedImage {
  buffer: Buffer;
  contentType: string;
  byteSize: number;
  sha256: string;
}

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  tiff: 'image/tiff',
};

/**
 * Strip ALL metadata (EXIF, GPS, IPTC, XMP) from an uploaded image before it is
 * ever stored — a child-safety control (CLAUDE.md: "Strip EXIF/GPS on ingest").
 *
 * sharp re-encodes and, crucially, copies NO metadata unless explicitly asked —
 * so the output carries no location or device data. `.rotate()` first bakes in
 * the EXIF orientation so the picture still looks right after the orientation tag
 * is dropped. The re-encoded bytes become the stored "original".
 */
/** The most pixels an upload may decode to (≈ a 48MP phone photo, with room). The 25MB byte cap
 * alone doesn't bound memory: a tiny, highly compressed file can declare 30000×30000 pixels and
 * take gigabytes to decode (a "decompression bomb") — refused before any pixel is decoded. The
 * browser already shrinks uploads to 4500px, so only a hand-crafted request ever meets this. */
export const MAX_UPLOAD_PIXELS = 50_000_000;
export class ImageTooLargeError extends Error {
  constructor() {
    super('image too large');
    this.name = 'ImageTooLargeError';
  }
}

export async function stripExif(input: Buffer): Promise<SanitisedImage> {
  // header only — no decode (sharp itself refuses headers past ~268MP; anything over OUR cap too)
  const meta = await sharp(input, { failOn: 'none' }).metadata().catch(() => {
    throw new ImageTooLargeError();
  });
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_UPLOAD_PIXELS) throw new ImageTooLargeError();
  const pipeline = sharp(input, { failOn: 'none', limitInputPixels: MAX_UPLOAD_PIXELS }).rotate(); // no withMetadata() ⇒ metadata dropped
  const format = meta.format ?? 'jpeg';

  const buffer = await pipeline.toBuffer();
  const contentType = FORMAT_TO_MIME[format] ?? 'application/octet-stream';
  return {
    buffer,
    contentType,
    byteSize: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

/** True if the bytes still carry an EXIF block — used in tests to prove stripping. */
export async function hasExif(buffer: Buffer): Promise<boolean> {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  return Boolean(meta.exif);
}
