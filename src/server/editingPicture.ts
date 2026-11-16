import sharp from 'sharp';

/**
 * A keepsake's working drawing as the page's own copy for editing (keepsakeForStudioAction): at most 2400px.
 * A see-through drawing (Draw's make it real sends PNGs with no paper) stays see-through, as an upload does
 * (normalizeUpload), so the page's cream shows behind it. As a JPEG its empty parts came out BLACK (founder,
 * 16 Nov 2026). Anything opaque stays a JPEG, so photos stay small.
 */
export async function pictureForEditing(bytes: Buffer): Promise<{ dataUrl: string; aspect: number }> {
  const img = sharp(bytes).rotate();
  const meta = await img.metadata();
  const sized = img.resize(2400, 2400, { fit: 'inside', withoutEnlargement: true });
  const seeThrough = !!meta.hasAlpha && !(await sharp(bytes).stats()).isOpaque;
  const out = seeThrough ? await sized.png({ compressionLevel: 9 }).toBuffer() : await sized.jpeg({ quality: 88 }).toBuffer();
  return { dataUrl: `data:image/${seeThrough ? 'png' : 'jpeg'};base64,${out.toString('base64')}`, aspect: (meta.width ?? 1) / (meta.height ?? 1) };
}
