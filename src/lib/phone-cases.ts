/**
 * Phone cases (founder, 2026-10-21): Prodigi snap + tough cases, made in the UK (labs uk6/uk8),
 * gloss or matte. Every model below was validated against the Prodigi sandbox on 2026-10-21 —
 * its SKU exists and its print file size is Prodigi's own `printAreaSizes` (px @ ~300dpi). A
 * `null` grade means Prodigi doesn't make that grade for that phone (e.g. Pixels are tough-only).
 * Shared by the server (catalogue seed, pricing) and the page (the type-to-search picker).
 * See project-office/briefs/PHONE-TABLET-CASES.md.
 */
export type CaseGrade = 'snap' | 'tough';
export type CaseFinish = 'gloss' | 'matte';
export interface PhoneModel {
  name: string;
  brand: 'Apple' | 'Samsung' | 'Google';
  /** Prodigi's model code inside the SKU, e.g. IP16 → GLOBAL-TECH-IP16-CS-G */
  code: string;
  /** Print file px, and how far down the case the camera cut-out reaches (fraction of the height,
   * measured from Prodigi's per-model template) — the default placement keeps the drawing below it. */
  snap: { w: number; h: number; cam: number } | null;
  tough: { w: number; h: number; cam: number } | null;
}

/** Oldest → newest within each brand (the picker shows newest first). */
export const PHONE_MODELS: PhoneModel[] = [
  { name: 'iPhone 13', brand: 'Apple', code: 'IP13', snap: { w: 1204, h: 2019, cam: 0.29 }, tough: { w: 1238, h: 2042, cam: 0.29 } },
  { name: 'iPhone 13 mini', brand: 'Apple', code: 'IP13MN', snap: { w: 1097, h: 1830, cam: 0.3 }, tough: { w: 1122, h: 1830, cam: 0.3 } },
  { name: 'iPhone 13 Pro', brand: 'Apple', code: 'IP13P', snap: { w: 1204, h: 2019, cam: 0.34 }, tough: { w: 1238, h: 2042, cam: 0.34 } },
  { name: 'iPhone 13 Pro Max', brand: 'Apple', code: 'IP13PM', snap: { w: 1286, h: 2185, cam: 0.31 }, tough: { w: 1322, h: 2219, cam: 0.31 } },
  { name: 'iPhone 14', brand: 'Apple', code: 'IP14', snap: { w: 1200, h: 2040, cam: 0.28 }, tough: { w: 1260, h: 2100, cam: 0.3 } },
  { name: 'iPhone 14 Plus', brand: 'Apple', code: 'IP14PL', snap: { w: 1320, h: 2190, cam: 0.26 }, tough: { w: 1350, h: 2250, cam: 0.28 } },
  { name: 'iPhone 14 Pro', brand: 'Apple', code: 'IP14PR', snap: { w: 1200, h: 2040, cam: 0.33 }, tough: { w: 1260, h: 2100, cam: 0.35 } },
  { name: 'iPhone 14 Pro Max', brand: 'Apple', code: 'IP14PM', snap: { w: 1320, h: 2190, cam: 0.31 }, tough: { w: 1350, h: 2250, cam: 0.33 } },
  { name: 'iPhone 15', brand: 'Apple', code: 'IP15', snap: { w: 1200, h: 2040, cam: 0.28 }, tough: { w: 1260, h: 2100, cam: 0.3 } },
  { name: 'iPhone 15 Plus', brand: 'Apple', code: 'IP15PL', snap: { w: 1320, h: 2190, cam: 0.26 }, tough: { w: 1350, h: 2250, cam: 0.28 } },
  { name: 'iPhone 15 Pro', brand: 'Apple', code: 'IP15PR', snap: { w: 1200, h: 2040, cam: 0.34 }, tough: { w: 1260, h: 2100, cam: 0.35 } },
  { name: 'iPhone 15 Pro Max', brand: 'Apple', code: 'IP15PM', snap: { w: 1320, h: 2190, cam: 0.31 }, tough: { w: 1350, h: 2250, cam: 0.33 } },
  { name: 'iPhone 16', brand: 'Apple', code: 'IP16', snap: { w: 1209, h: 2049, cam: 0.32 }, tough: { w: 1245, h: 2085, cam: 0.34 } },
  { name: 'iPhone 16 Plus', brand: 'Apple', code: 'IP16PL', snap: { w: 1311, h: 2196, cam: 0.3 }, tough: { w: 1359, h: 2244, cam: 0.31 } },
  { name: 'iPhone 16 Pro', brand: 'Apple', code: 'IP16PR', snap: { w: 1209, h: 2049, cam: 0.32 }, tough: { w: 1245, h: 2085, cam: 0.34 } },
  { name: 'iPhone 16 Pro Max', brand: 'Apple', code: 'IP16PM', snap: { w: 1311, h: 2196, cam: 0.3 }, tough: { w: 1359, h: 2244, cam: 0.32 } },
  { name: 'iPhone 16e', brand: 'Apple', code: 'IP16E', snap: null, tough: { w: 1254, h: 2069, cam: 0.23 } },
  { name: 'iPhone 17', brand: 'Apple', code: 'IP17', snap: { w: 1233, h: 2094, cam: 0.31 }, tough: { w: 1266, h: 2121, cam: 0.34 } },
  { name: 'iPhone 17 Air', brand: 'Apple', code: 'IP17A', snap: { w: 1272, h: 2172, cam: 0.23 }, tough: { w: 1305, h: 2196, cam: 0.25 } },
  { name: 'iPhone 17 Pro', brand: 'Apple', code: 'IP17PR', snap: { w: 1233, h: 2091, cam: 0.32 }, tough: { w: 1266, h: 2115, cam: 0.34 } },
  { name: 'iPhone 17 Pro Max', brand: 'Apple', code: 'IP17PM', snap: { w: 1305, h: 2250, cam: 0.3 }, tough: { w: 1338, h: 2274, cam: 0.32 } },
  { name: 'iPhone 18 Pro', brand: 'Apple', code: 'IP18PR', snap: { w: 1233, h: 2092, cam: 0.32 }, tough: { w: 1266, h: 2115, cam: 0.34 } },
  { name: 'iPhone 18 Pro Max', brand: 'Apple', code: 'IP18PM', snap: { w: 1305, h: 2251, cam: 0.3 }, tough: { w: 1338, h: 2274, cam: 0.32 } },
  { name: 'Galaxy S23', brand: 'Samsung', code: 'SGS23', snap: { w: 1200, h: 2040, cam: 0.39 }, tough: { w: 1260, h: 2070, cam: 0.4 } },
  { name: 'Galaxy S23+', brand: 'Samsung', code: 'SGS23P', snap: { w: 1290, h: 2190, cam: 0.37 }, tough: { w: 1350, h: 2220, cam: 0.38 } },
  { name: 'Galaxy S23 Ultra', brand: 'Samsung', code: 'SGS23U', snap: { w: 1320, h: 2280, cam: 0.38 }, tough: { w: 1380, h: 2310, cam: 0.4 } },
  { name: 'Galaxy S23 FE', brand: 'Samsung', code: 'SGS23FE', snap: null, tough: { w: 1356, h: 2244, cam: 0.38 } },
  { name: 'Galaxy S24', brand: 'Samsung', code: 'SGS24', snap: { w: 1224, h: 2073, cam: 0.39 }, tough: { w: 1251, h: 2097, cam: 0.4 } },
  { name: 'Galaxy S24+', brand: 'Samsung', code: 'SGS24P', snap: { w: 1281, h: 2202, cam: 0.38 }, tough: { w: 1314, h: 2229, cam: 0.39 } },
  { name: 'Galaxy S24 Ultra', brand: 'Samsung', code: 'SGS24U', snap: { w: 1323, h: 2268, cam: 0.39 }, tough: { w: 1362, h: 2295, cam: 0.41 } },
  { name: 'Galaxy S24 FE', brand: 'Samsung', code: 'SGS24FE', snap: null, tough: { w: 1320, h: 2250, cam: 0.4 } },
  { name: 'Galaxy S25', brand: 'Samsung', code: 'SGS25', snap: { w: 1224, h: 2073, cam: 0.39 }, tough: { w: 1251, h: 2097, cam: 0.4 } },
  { name: 'Galaxy S25+', brand: 'Samsung', code: 'SGS25P', snap: { w: 1281, h: 2202, cam: 0.38 }, tough: { w: 1314, h: 2229, cam: 0.39 } },
  { name: 'Galaxy S25 Ultra', brand: 'Samsung', code: 'SGS25U', snap: { w: 1323, h: 2244, cam: 0.39 }, tough: { w: 1359, h: 2244, cam: 0.41 } },
  { name: 'Galaxy S26', brand: 'Samsung', code: 'SGS26', snap: { w: 1243, h: 2103, cam: 0.39 }, tough: { w: 1269, h: 2121, cam: 0.41 } },
  { name: 'Galaxy S26+', brand: 'Samsung', code: 'SGS26P', snap: { w: 1290, h: 2208, cam: 0.37 }, tough: { w: 1316, h: 2226, cam: 0.39 } },
  { name: 'Galaxy S26 Ultra', brand: 'Samsung', code: 'SGS26U', snap: { w: 1318, h: 2262, cam: 0.4 }, tough: { w: 1344, h: 2285, cam: 0.41 } },
  { name: 'Pixel 8', brand: 'Google', code: 'GP8', snap: null, tough: { w: 1230, h: 2130, cam: 0.27 } },
  { name: 'Pixel 8 Pro', brand: 'Google', code: 'GP8P', snap: null, tough: { w: 1320, h: 2250, cam: 0.28 } },
  { name: 'Pixel 9', brand: 'Google', code: 'GP9', snap: null, tough: { w: 1329, h: 2124, cam: 0.28 } },
  { name: 'Pixel 9 Pro', brand: 'Google', code: 'GP9P', snap: null, tough: { w: 1329, h: 2124, cam: 0.28 } },
  { name: 'Pixel 9 Pro XL', brand: 'Google', code: 'GP9PXL', snap: null, tough: { w: 1359, h: 2244, cam: 0.27 } },
];

export const CASE_GRADES: CaseGrade[] = ['snap', 'tough'];
export const CASE_FINISHES: CaseFinish[] = ['gloss', 'matte'];
/** Our retail, VAT-inclusive, free TRACKED delivery baked in (founder, 2026-10-21; whole pounds — D21). */
export const CASE_PRICE_PENCE: Record<CaseGrade, number> = { snap: 2500, tough: 3000 };
export const CASE_GRADE_BLURB: Record<CaseGrade, string> = {
  snap: 'slim and light',
  tough: 'extra padding for the drops',
};

export function prodigiCaseSku(m: PhoneModel, grade: CaseGrade, finish: CaseFinish): string {
  return `GLOBAL-TECH-${m.code}-${grade === 'tough' ? 'TCB-' : ''}CS-${finish === 'gloss' ? 'G' : 'M'}`;
}

export function gradesFor(name: string | null | undefined): CaseGrade[] {
  const m = PHONE_MODELS.find((p) => p.name === name);
  return m ? CASE_GRADES.filter((g) => m[g]) : [];
}

// ── type-to-search ─────────────────────────────────────────────────────────────────────

/** Lower-case words, with the ways people actually type phone names folded together:
 * "16pro" → "16 pro", "s24u" → "s24 ultra", "+" → "plus", "samsung" → "galaxy", "ip" → "iphone". */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/\b(s\d{2})u\b/g, '$1 ultra')
    .replace(/\b(s\d{2})p\b/g, '$1 plus')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w === 'samsung' ? 'galaxy' : w === 'ip' || w === 'apple' ? 'iphone' : w === 'google' ? 'pixel' : w))
    // the "S" of "Galaxy S24" carries no meaning once split off ("s24" and "24" both find it)
    .filter((w) => w !== 's');
}
const modelWords = (m: PhoneModel) => words(m.name);

/**
 * The phones that match what someone typed, best first: every typed word must start one of the
 * model's words (in any order), so "16 pro" finds iPhone 16 Pro (and 16 Pro Max, after it),
 * "s24 ultra" / "samsung s24u" find Galaxy S24 Ultra, and "pixel" lists every Pixel. An exact
 * Newest generation first; within one, the shorter name leads (16 Pro before 16 Pro Max), so an
 * exact match always tops its generation. Empty query → [].
 */
export function searchPhones(query: string, limit = 8): PhoneModel[] {
  const q = words(query);
  if (q.length === 0) return [];
  const scored: { m: PhoneModel; gen: number; extra: number; age: number }[] = [];
  PHONE_MODELS.forEach((m, i) => {
    const mw = modelWords(m);
    const used = new Set<number>();
    for (const [n, t] of q.entries()) {
      // words match by their start ("ul" → ultra); numbers must match whole ("1" isn't 13) —
      // except the word still being typed, so "iphone 1" already lists 13 → 18 as you type
      const typing = n === q.length - 1;
      const j = mw.findIndex((w, k) => !used.has(k) && (w === t || (w.startsWith(t) && (typing || !/^\d+$/.test(t)))));
      if (j === -1) return;
      used.add(j);
    }
    scored.push({ m, gen: Number(m.name.match(/\d+/)?.[0] ?? 0), extra: mw.length - used.size, age: -i });
  });
  scored.sort((a, b) => b.gen - a.gen || a.extra - b.extra || a.age - b.age);
  return scored.slice(0, limit).map((s) => s.m);
}

// ── default placement: clear of the camera ───────────────────────────────────────────────

/**
 * Where a drawing goes on a phone case by default: the WHOLE drawing, as big as it fits in the
 * clear area BELOW the camera cut-out (a small gap under it, the safe margin at the sides and the
 * bottom) — so a face never lands in a camera hole. Same Transform model as every product (a
 * cover-relative scale + a pan within the slack; the case print file has no trim), so the preview,
 * the print file and the print-quality check all agree. null when we can't place it (unknown
 * phone/grade, no image size yet) — the caller keeps the usual "fit the whole drawing".
 */
export function caseDefaultTransform(
  modelName: string | null | undefined,
  grade: string | null | undefined,
  src: { width: number; height: number } | null | undefined,
): { scale: number; offsetX: number; offsetY: number; rotationDeg: 0 } | null {
  const px = PHONE_MODELS.find((m) => m.name === modelName)?.[grade as CaseGrade];
  if (!px || !src || !(src.width > 0) || !(src.height > 0)) return null;
  const CW = px.w;
  const CH = px.h;
  const top = (px.cam + 0.03) * CH;
  const bottom = 0.95 * CH;
  const left = 0.07 * CW;
  const right = 0.93 * CW;
  const fit = Math.min((right - left) / src.width, (bottom - top) / src.height); // px per source px
  const cover = Math.max(CW / src.width, CH / src.height);
  const drawH = src.height * fit;
  const slackY = Math.abs(drawH - CH);
  const offsetY = slackY > 0 ? Math.max(-1, Math.min(1, ((top + bottom) / 2 - CH / 2) * 2 / slackY)) : 0;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return { scale: r4(fit / cover), offsetX: 0, offsetY: r4(offsetY), rotationDeg: 0 };
}
