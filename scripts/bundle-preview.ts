// Preview + TIME the Christmas family bundle's pictures (and the standalone placemat + coaster tiles) on THIS machine, before seeding: builds each
// layout from the founder's layers (.prodigi-assets/blanks/layered/christmasBundle) exactly as the seed
// does, renders brand-safe test drawings into it with the shop's own renderer, writes WebPs to look at
// and prints how long a render takes. No database, no storage, no child's image — test art only.
//
//   npx tsx --conditions=react-server scripts/bundle-preview.ts <drawing.png> [more drawings…] [--out dir] [--runs 20]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BUNDLE_LAYOUTS, buildBundleLayout, buildLayout, decodeBundleLayout, decodeDrawing, encodeBundle, renderBundleLayers, type BuiltBundleLayout, type DecodedDrawing } from '@/server/print/bundleMockup';
import { BUNDLE_BACKDROP, bundleLayoutDir, TILE_LAYERS } from '@/server/print/seedMockups';

const args = process.argv.slice(2);
const flag = (name: string, d: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1]! : d;
};
const outDir = flag('--out', path.join('.prodigi-assets', 'previews', 'christmasBundle'));
const runs = Number(flag('--runs', '20'));
if (!args.length) throw new Error('usage: bundle-preview.ts <drawing.png> [more…] [--out dir] [--runs n]');
mkdirSync(outDir, { recursive: true });

const ms = (t: bigint) => Number(process.hrtime.bigint() - t) / 1e6;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function main() {
  // the drawings, shrunk as the shop shrinks a thumb's design (≤ 1200 px)
  const sharp = (await import('sharp')).default;
  const drawings: DecodedDrawing[] = [];
  for (const f of args) drawings.push(await decodeDrawing(await sharp(readFileSync(f)).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()));

  // the bundle's four pictures, then the standalone placemat + coaster tiles
  const jobs: Array<{ name: string; build: () => Promise<BuiltBundleLayout> }> = [
    ...BUNDLE_LAYOUTS.map((name) => ({ name, build: async () => buildBundleLayout(bundleLayoutDir(name) ?? '', BUNDLE_BACKDROP) })),
    ...Object.entries(TILE_LAYERS).map(([name, layers]) => ({ name: `${name}-tile`, build: async () => buildLayout(layers, [1024, 1024], BUNDLE_BACKDROP) })),
  ];
  for (const { name, build } of jobs) {
    if ((BUNDLE_LAYOUTS as readonly string[]).includes(name) ? !bundleLayoutDir(name as never) : !TILE_LAYERS[name.replace('-tile', '') as 'placemat'].every((l) => existsSync(l.file))) {
      console.log(`${name}: no layers staged`);
      continue;
    }
    let t = process.hrtime.bigint();
    const built = await build();
    const buildMs = ms(t);
    for (const edge of [1024, 512]) {
      t = process.hrtime.bigint();
      const layout = await decodeBundleLayout(built.base, built.regions, edge);
      const decodeMs = ms(t);
      // thumb: ONE drawing on every piece; builder: the placemat, the coaster, then each ornament its own
      const pick = (role: string, i: number) => (name === 'thumb' ? drawings[0]! : drawings[(role === 'placemat' ? 0 : role === 'coaster' ? 1 : 2 + i) % drawings.length]!);
      const times: number[] = [], encode: number[] = [];
      let last: Buffer | null = null;
      for (let r = 0; r < runs; r++) {
        t = process.hrtime.bigint();
        const img = await renderBundleLayers(layout, pick);
        const renderMs = ms(t);
        const e = await encodeBundle(img);
        times.push(ms(t));
        encode.push(ms(t) - renderMs);
        last = e.buffer;
      }
      writeFileSync(path.join(outDir, `${name}-${edge}.webp`), last!);
      console.log(`${name} @${edge}px: build ${buildMs.toFixed(0)} ms (seed, once) · decode ${decodeMs.toFixed(0)} ms (once per server) · render+encode median ${median(times).toFixed(1)} ms (encode ${median(encode).toFixed(1)} ms), first ${times[0]!.toFixed(1)} ms · ${(last!.byteLength / 1024).toFixed(0)} KB`);
    }
  }
  console.log(`→ ${outDir}`);
}
void main();
