// The founder's bauble photo layers (product, print map, overlay — .prodigi-assets/blanks/layered/bauble/*,
// built by compose-founder-layers.mjs), cropped to the ornament and sized for the spin view, so its FRONT
// and its REAR are made from the very same layers as the shop photo (founder, 26 Oct).
// Brand-safe product photography only — no drawing, nothing about a child.
//
//   node scripts/export-bauble-3d-layers.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = '.prodigi-assets/blanks/layered/bauble';
const OUT = 'public/three/bauble';
const EDGE = 768;

for (const set of ['ceramic', 'ball']) {
  const product = path.join(SRC, set, 'product.png');
  // the ornament's own outline (the product layer's alpha)
  const { data, info } = await sharp(product).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] <= 128) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const side = Math.max(x1 - x0, y1 - y0) + 1;
  const crop = { left: Math.round((x0 + x1 - side) / 2), top: Math.round((y0 + y1 - side) / 2), width: side, height: side };
  mkdirSync(path.join(OUT, set), { recursive: true });
  for (const layer of ['product', 'printmap', 'overlay']) {
    await sharp(path.join(SRC, set, `${layer}.png`)).extract(crop).resize(EDGE, EDGE).png({ compressionLevel: 9 }).toFile(path.join(OUT, set, `${layer}.png`));
  }
  console.log(`${set}: ${side}px crop at ${crop.left},${crop.top} → ${OUT}/${set}`);
}
