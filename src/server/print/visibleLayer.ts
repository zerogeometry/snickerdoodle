import './sharp-init';
import sharp from 'sharp';
import type { LayerRect } from './geometry';

/** Source px kept round the window, so the resampling kernel sees real neighbours at the cut edge. */
const PAD = 2;

/**
 * The part of a placed drawing that lands on the canvas, as PNG bytes, plus where it goes.
 *
 * The drawn layer (`rect`, from computeLayerRect) can be far bigger than the canvas — a big print
 * zoomed in, or a panorama cover-filling a tall frame, is hundreds of megapixels — and decoding a
 * layer that size breaks sharp's pixel limit (sweep 03-B3: paid orders that never rendered). So the
 * visible WINDOW is cut from the (rotated) SOURCE first and only that window is resized: the work
 * is bounded by the canvas, whatever the zoom. The pixels are the ones the old "resize the whole
 * layer, then crop" gave, to within the resampler's sub-pixel rounding.
 */
export async function visibleLayerPart(
  srcBuf: Buffer,
  src: { width: number; height: number },
  rect: LayerRect,
): Promise<{ part: Buffer; left: number; top: number; width: number; height: number }> {
  // the canvas-visible window of the layer, in layer px, and where it sits on the canvas
  const ix = Math.max(0, -rect.x);
  const iy = Math.max(0, -rect.y);
  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const iw = Math.max(1, Math.min(rect.width - ix, rect.canvasWidth - left));
  const ih = Math.max(1, Math.min(rect.height - iy, rect.canvasHeight - top));

  // the same window in ROTATED-source px (layer px per source px = k)
  const quarter = rect.rotationDeg % 180 !== 0;
  const rw = quarter ? src.height : src.width;
  const rh = quarter ? src.width : src.height;
  const kx = rect.width / rw;
  const ky = rect.height / rh;
  const sx0 = Math.max(0, Math.floor(ix / kx) - PAD);
  const sy0 = Math.max(0, Math.floor(iy / ky) - PAD);
  const sx1 = Math.min(rw, Math.ceil((ix + iw) / kx) + PAD);
  const sy1 = Math.min(rh, Math.ceil((iy + ih) / ky) + PAD);

  const win = await sharp(srcBuf)
    .rotate(rect.rotationDeg)
    .extract({ left: sx0, top: sy0, width: Math.max(1, sx1 - sx0), height: Math.max(1, sy1 - sy0) })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // resize the window at the layer's scale, then trim the padding off
  const outW = Math.max(1, Math.round(win.info.width * kx));
  const outH = Math.max(1, Math.round(win.info.height * ky));
  const offX = Math.min(Math.max(0, Math.round(ix - sx0 * kx)), outW - 1);
  const offY = Math.min(Math.max(0, Math.round(iy - sy0 * ky)), outH - 1);
  const w = Math.min(iw, outW - offX);
  const h = Math.min(ih, outH - offY);
  const raw = { width: win.info.width, height: win.info.height, channels: win.info.channels };
  let part = await sharp(win.data, { raw })
    .resize(outW, outH, { fit: 'fill' })
    .extract({ left: offX, top: offY, width: w, height: h })
    .png()
    .toBuffer();
  // a rounding pixel short at a source edge → stretch the last pixel rather than leave a seam
  if (w !== iw || h !== ih) part = await sharp(part).resize(iw, ih, { fit: 'fill' }).png().toBuffer();
  return { part, left, top, width: iw, height: ih };
}
