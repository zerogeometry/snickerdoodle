/**
 * Christmas snow (founder, 13 Nov 2026): crayon snowflakes falling gently behind the content, in the Christmas
 * season only (1 Nov → 6 Jan, brandSeason()). The homepage and /draw get it in their hero only, in place of
 * the floating doodles (a layer inside that section); these pages get it across their whole background (one
 * layer behind everything, Snowfall.tsx).
 * Never the studio (a drawing tool) or the trust pages.
 */
const SNOW_PAGES = [
  '/how-it-works',
  '/our-story',
  // the keepsake and family areas
  '/home',
  '/family',
  // upload, catalogue and order
  '/start-creating',
  '/catalogue',
  '/customize',
  '/checkout',
  '/orders',
] as const;

/** Does this page get the whole-background snow? (The homepage's hero has its own.) */
export function showsPageSnow(pathname: string | null, christmas: boolean): boolean {
  if (!christmas || !pathname) return false;
  return SNOW_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The marketing pages sit on the kraft paper; the app pages on plain oat. The snow layer paints the same. */
export function snowPaper(pathname: string): 'kraft' | 'oat' {
  return pathname === '/how-it-works' || pathname === '/our-story' ? 'kraft' : 'oat';
}

export type Flake = {
  kind: 'flake' | 'dot';
  /** px */
  size: number;
  /** % across the layer where it starts */
  x: number;
  /** seconds for one fall, top to bottom */
  fall: number;
  /** seconds into the fall at load (so the sky is already full) */
  at: number;
  /** px the breeze carries it sideways over a whole fall */
  drift: number;
  /** px each way it sways, and seconds per sway */
  sway: number;
  swayDur: number;
  /** seconds per full turn (sign = which way), flakes only */
  spin: number;
  /** seconds per tumble (a flake tipping edge-on and back), flakes only */
  tumble: number;
  opacity: number;
  /** % down the layer where it rests when motion is reduced */
  rest: number;
  /** left out on small screens (half as many flakes on a phone) */
  lite: boolean;
};

/** A fixed, seeded scatter: the same on the server and in the browser (no hydration mismatch). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Three depths, like real snow seen through a window: lots of tiny far specks drifting slowly, some middling
 * ones, and a few big near flakes that fall faster, sway wider and turn as they go. Every flake falls at a
 * steady speed (snow reaches its terminal speed almost at once), swings side to side as it flutters, and is
 * carried a little by the breeze, mostly one way.
 */
export function makeFlakes(seed = 1225): Flake[] {
  const r = rng(seed);
  const between = (a: number, b: number) => a + (b - a) * r();
  const out: Flake[] = [];
  const add = (n: number, depth: 'far' | 'mid' | 'near') => {
    for (let i = 0; i < n; i++) {
      const far = depth === 'far';
      const near = depth === 'near';
      const kind: Flake['kind'] = far ? (r() < 0.75 ? 'dot' : 'flake') : near ? 'flake' : r() < 0.35 ? 'dot' : 'flake';
      const size = Math.round(
        far ? (kind === 'dot' ? between(5, 9) : between(9, 13)) : near ? between(26, 52) : kind === 'dot' ? between(7, 11) : between(13, 20),
      );
      const fall = +(far ? between(17, 26) : near ? between(9, 13) : between(12, 17)).toFixed(2);
      out.push({
        kind,
        size,
        x: +between(-4, 100).toFixed(2),
        fall,
        at: +(r() * fall).toFixed(2),
        drift: Math.round(between(-30, 90) * (near ? 1.4 : far ? 0.6 : 1)),
        sway: Math.round(far ? between(6, 16) : near ? between(26, 50) : between(14, 28)),
        swayDur: +(far ? between(3.5, 6) : near ? between(3, 4.6) : between(3, 5)).toFixed(2),
        spin: +((r() < 0.5 ? -1 : 1) * between(near ? 9 : 12, near ? 18 : 24)).toFixed(2),
        tumble: +between(2.6, 5).toFixed(2),
        opacity: +(far ? between(0.85, 0.95) : near ? between(0.95, 1) : between(0.85, 0.95)).toFixed(2),
        rest: +between(2, 96).toFixed(2),
        lite: i % 2 === 1,
      });
    }
  };
  add(66, 'far');
  add(30, 'mid');
  add(14, 'near');
  return out;
}
