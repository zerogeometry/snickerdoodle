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
  snap: { w: number; h: number } | null;
  tough: { w: number; h: number } | null;
}

/** Oldest → newest within each brand (the picker shows newest first). */
export const PHONE_MODELS: PhoneModel[] = [
  { name: 'iPhone 13', brand: 'Apple', code: 'IP13', snap: { w: 1204, h: 2019 }, tough: { w: 1238, h: 2042 } },
  { name: 'iPhone 13 mini', brand: 'Apple', code: 'IP13MN', snap: { w: 1097, h: 1830 }, tough: { w: 1122, h: 1830 } },
  { name: 'iPhone 13 Pro', brand: 'Apple', code: 'IP13P', snap: { w: 1204, h: 2019 }, tough: { w: 1238, h: 2042 } },
  { name: 'iPhone 13 Pro Max', brand: 'Apple', code: 'IP13PM', snap: { w: 1286, h: 2185 }, tough: { w: 1322, h: 2219 } },
  { name: 'iPhone 14', brand: 'Apple', code: 'IP14', snap: { w: 1200, h: 2040 }, tough: { w: 1260, h: 2100 } },
  { name: 'iPhone 14 Plus', brand: 'Apple', code: 'IP14PL', snap: { w: 1320, h: 2190 }, tough: { w: 1350, h: 2250 } },
  { name: 'iPhone 14 Pro', brand: 'Apple', code: 'IP14PR', snap: { w: 1200, h: 2040 }, tough: { w: 1260, h: 2100 } },
  { name: 'iPhone 14 Pro Max', brand: 'Apple', code: 'IP14PM', snap: { w: 1320, h: 2190 }, tough: { w: 1350, h: 2250 } },
  { name: 'iPhone 15', brand: 'Apple', code: 'IP15', snap: { w: 1200, h: 2040 }, tough: { w: 1260, h: 2100 } },
  { name: 'iPhone 15 Plus', brand: 'Apple', code: 'IP15PL', snap: { w: 1320, h: 2190 }, tough: { w: 1350, h: 2250 } },
  { name: 'iPhone 15 Pro', brand: 'Apple', code: 'IP15PR', snap: { w: 1200, h: 2040 }, tough: { w: 1260, h: 2100 } },
  { name: 'iPhone 15 Pro Max', brand: 'Apple', code: 'IP15PM', snap: { w: 1320, h: 2190 }, tough: { w: 1350, h: 2250 } },
  { name: 'iPhone 16', brand: 'Apple', code: 'IP16', snap: { w: 1209, h: 2049 }, tough: { w: 1245, h: 2085 } },
  { name: 'iPhone 16 Plus', brand: 'Apple', code: 'IP16PL', snap: { w: 1311, h: 2196 }, tough: { w: 1359, h: 2244 } },
  { name: 'iPhone 16 Pro', brand: 'Apple', code: 'IP16PR', snap: { w: 1209, h: 2049 }, tough: { w: 1245, h: 2085 } },
  { name: 'iPhone 16 Pro Max', brand: 'Apple', code: 'IP16PM', snap: { w: 1311, h: 2196 }, tough: { w: 1359, h: 2244 } },
  { name: 'iPhone 16e', brand: 'Apple', code: 'IP16E', snap: null, tough: { w: 1254, h: 2069 } },
  { name: 'iPhone 17', brand: 'Apple', code: 'IP17', snap: { w: 1233, h: 2094 }, tough: { w: 1266, h: 2121 } },
  { name: 'iPhone 17 Air', brand: 'Apple', code: 'IP17A', snap: { w: 1272, h: 2172 }, tough: { w: 1305, h: 2196 } },
  { name: 'iPhone 17 Pro', brand: 'Apple', code: 'IP17PR', snap: { w: 1233, h: 2091 }, tough: { w: 1266, h: 2115 } },
  { name: 'iPhone 17 Pro Max', brand: 'Apple', code: 'IP17PM', snap: { w: 1305, h: 2250 }, tough: { w: 1338, h: 2274 } },
  { name: 'iPhone 18 Pro', brand: 'Apple', code: 'IP18PR', snap: { w: 1233, h: 2092 }, tough: { w: 1266, h: 2115 } },
  { name: 'iPhone 18 Pro Max', brand: 'Apple', code: 'IP18PM', snap: { w: 1305, h: 2251 }, tough: { w: 1338, h: 2274 } },
  { name: 'Galaxy S23', brand: 'Samsung', code: 'SGS23', snap: { w: 1200, h: 2040 }, tough: { w: 1260, h: 2070 } },
  { name: 'Galaxy S23+', brand: 'Samsung', code: 'SGS23P', snap: { w: 1290, h: 2190 }, tough: { w: 1350, h: 2220 } },
  { name: 'Galaxy S23 Ultra', brand: 'Samsung', code: 'SGS23U', snap: { w: 1320, h: 2280 }, tough: { w: 1380, h: 2310 } },
  { name: 'Galaxy S23 FE', brand: 'Samsung', code: 'SGS23FE', snap: null, tough: { w: 1356, h: 2244 } },
  { name: 'Galaxy S24', brand: 'Samsung', code: 'SGS24', snap: { w: 1224, h: 2073 }, tough: { w: 1251, h: 2097 } },
  { name: 'Galaxy S24+', brand: 'Samsung', code: 'SGS24P', snap: { w: 1281, h: 2202 }, tough: { w: 1314, h: 2229 } },
  { name: 'Galaxy S24 Ultra', brand: 'Samsung', code: 'SGS24U', snap: { w: 1323, h: 2268 }, tough: { w: 1362, h: 2295 } },
  { name: 'Galaxy S24 FE', brand: 'Samsung', code: 'SGS24FE', snap: null, tough: { w: 1320, h: 2250 } },
  { name: 'Galaxy S25', brand: 'Samsung', code: 'SGS25', snap: { w: 1224, h: 2073 }, tough: { w: 1251, h: 2097 } },
  { name: 'Galaxy S25+', brand: 'Samsung', code: 'SGS25P', snap: { w: 1281, h: 2202 }, tough: { w: 1314, h: 2229 } },
  { name: 'Galaxy S25 Ultra', brand: 'Samsung', code: 'SGS25U', snap: { w: 1323, h: 2244 }, tough: { w: 1359, h: 2244 } },
  { name: 'Galaxy S26', brand: 'Samsung', code: 'SGS26', snap: { w: 1243, h: 2103 }, tough: { w: 1269, h: 2121 } },
  { name: 'Galaxy S26+', brand: 'Samsung', code: 'SGS26P', snap: { w: 1290, h: 2208 }, tough: { w: 1316, h: 2226 } },
  { name: 'Galaxy S26 Ultra', brand: 'Samsung', code: 'SGS26U', snap: { w: 1318, h: 2262 }, tough: { w: 1344, h: 2285 } },
  { name: 'Pixel 8', brand: 'Google', code: 'GP8', snap: null, tough: { w: 1230, h: 2130 } },
  { name: 'Pixel 8 Pro', brand: 'Google', code: 'GP8P', snap: null, tough: { w: 1320, h: 2250 } },
  { name: 'Pixel 9', brand: 'Google', code: 'GP9', snap: null, tough: { w: 1329, h: 2124 } },
  { name: 'Pixel 9 Pro', brand: 'Google', code: 'GP9P', snap: null, tough: { w: 1329, h: 2124 } },
  { name: 'Pixel 9 Pro XL', brand: 'Google', code: 'GP9PXL', snap: null, tough: { w: 1359, h: 2244 } },
];

export const CASE_GRADES: CaseGrade[] = ['snap', 'tough'];
export const CASE_FINISHES: CaseFinish[] = ['gloss', 'matte'];
/** Our retail, VAT-inclusive, free TRACKED delivery baked in (founder, 2026-10-21). */
export const CASE_PRICE_PENCE: Record<CaseGrade, number> = { snap: 2499, tough: 2999 };
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
