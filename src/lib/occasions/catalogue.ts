/**
 * "The days we celebrate" (founder, 27 Oct): the festival groups a family can put on its calendar.
 * Client-safe metadata only — the DATES are worked out on the server (src/server/occasions/dates.ts).
 *
 * Opt-in per group. On by default: the everyday family days and the Christian holidays (Christmas —
 * we already run the Christmas order-by dates — and Easter); everything else only when the family
 * ticks it. Shown "Everyday family days" first, then the rest A–Z (founder, 10 Nov). A family's choices can
 * reveal religion / ethnicity (UK GDPR special-category data): they're stored as a calendar preference,
 * private to the family, and NEVER used for marketing, emails beyond the family's own reminders, or
 * segmentation (DPIA; privacy notice).
 */
export type FestivalKey =
  | 'new-year' | 'valentines' | 'mothering-sunday' | 'fathers-day'
  | 'christmas'
  | 'shrove-tuesday' | 'easter'
  | 'rosh-hashanah' | 'hanukkah' | 'passover'
  | 'ramadan' | 'eid-al-fitr' | 'eid-al-adha'
  | 'diwali' | 'holi' | 'raksha-bandhan'
  | 'vaisakhi' | 'bandi-chhor'
  | 'lny-cn' | 'mid-autumn-cn'
  | 'seollal' | 'chuseok'
  | 'tet' | 'trung-thu'
  | 'buddhas-birthday';

export interface FestivalGroup {
  id: string;
  name: string;
  /** what's in it, for the settings card */
  blurb: string;
  festivals: FestivalKey[];
  /** on for a new family */
  defaultOn?: boolean;
  /** the dates come from a moon sighting / a regional almanac — shown as "expected" */
  expected?: boolean;
}

const EVERYDAY: FestivalGroup = { id: 'everyday', name: 'Everyday family days', blurb: 'Mothering Sunday, Father’s Day, Valentine’s, New Year', festivals: ['mothering-sunday', 'fathers-day', 'valentines', 'new-year'], defaultOn: true };
const THE_REST: FestivalGroup[] = [
  { id: 'christian', name: 'Christian holidays', blurb: 'Christmas Day, Easter Sunday, Shrove Tuesday', festivals: ['christmas', 'easter', 'shrove-tuesday'], defaultOn: true },
  { id: 'jewish', name: 'Jewish festivals', blurb: 'Rosh Hashanah, Hanukkah, Passover', festivals: ['rosh-hashanah', 'hanukkah', 'passover'] },
  { id: 'muslim', name: 'Muslim festivals', blurb: 'Ramadan begins, Eid al-Fitr, Eid al-Adha', festivals: ['ramadan', 'eid-al-fitr', 'eid-al-adha'], expected: true },
  { id: 'hindu', name: 'Hindu festivals', blurb: 'Diwali, Holi, Raksha Bandhan', festivals: ['diwali', 'holi', 'raksha-bandhan'], expected: true },
  { id: 'sikh', name: 'Sikh festivals', blurb: 'Vaisakhi, Bandi Chhor Divas', festivals: ['vaisakhi', 'bandi-chhor'], expected: true },
  // the East Asian festivals get a region each — the customs and, for Korea, the dates differ
  { id: 'east-asian-cn', name: 'Chinese festivals', blurb: 'Chinese New Year, Mid-Autumn Festival', festivals: ['lny-cn', 'mid-autumn-cn'] },
  { id: 'east-asian-kr', name: 'Korean festivals', blurb: 'Seollal, Chuseok', festivals: ['seollal', 'chuseok'] },
  { id: 'east-asian-vn', name: 'Vietnamese festivals', blurb: 'Tết, Tết Trung Thu', festivals: ['tet', 'trung-thu'] },
  { id: 'buddhist', name: 'Buddhist festivals', blurb: 'Buddha’s Birthday (the 8th day of the 4th lunar month)', festivals: ['buddhas-birthday'] },
  { id: 'milestones', name: 'Baby milestones', blurb: 'Full month, 100 days (baek-il), first birthday (dol) — for each little one', festivals: [] },
];
/** In the order the settings card shows them: the everyday days first, then the rest A–Z. */
export const FESTIVAL_GROUPS: FestivalGroup[] = [EVERYDAY, ...THE_REST.sort((a, b) => a.name.localeCompare(b.name, 'en'))];

export const DEFAULT_CELEBRATE = FESTIVAL_GROUPS.filter((g) => g.defaultOn).map((g) => g.id);
const KNOWN = new Set(FESTIVAL_GROUPS.map((g) => g.id));
/**
 * Group ids a family may still have stored from before a merge → the group they're in now.
 * Christmas and Easter became "Christian holidays" (10 Nov): ticking EITHER one before means it's on.
 * (Mapped on read, so the stored column — and its '["everyday","christmas"]' default — needs no migration;
 * the next save writes the new id.)
 */
const RENAMED: Record<string, string> = { christmas: 'christian', easter: 'christian' };
/** A family's stored choice, cleaned (old ids mapped, unknown ids dropped, no duplicates). */
export function cleanCelebrate(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CELEBRATE];
  const ids = raw.filter((x): x is string => typeof x === 'string').map((x) => RENAMED[x] ?? x);
  return [...new Set(ids.filter((x) => KNOWN.has(x)))];
}

export const FESTIVAL_NAMES: Record<FestivalKey, string> = {
  'new-year': 'New Year’s Day',
  valentines: 'Valentine’s Day',
  'mothering-sunday': 'Mothering Sunday',
  'fathers-day': 'Father’s Day',
  christmas: 'Christmas Day',
  'shrove-tuesday': 'Shrove Tuesday',
  easter: 'Easter Sunday',
  'rosh-hashanah': 'Rosh Hashanah',
  hanukkah: 'Hanukkah begins',
  passover: 'Passover begins',
  ramadan: 'Ramadan begins',
  'eid-al-fitr': 'Eid al-Fitr',
  'eid-al-adha': 'Eid al-Adha',
  diwali: 'Diwali',
  holi: 'Holi',
  'raksha-bandhan': 'Raksha Bandhan',
  vaisakhi: 'Vaisakhi',
  'bandi-chhor': 'Bandi Chhor Divas',
  'lny-cn': 'Chinese New Year',
  'mid-autumn-cn': 'Mid-Autumn Festival',
  seollal: 'Seollal',
  chuseok: 'Chuseok',
  tet: 'Tết',
  'trung-thu': 'Tết Trung Thu',
  'buddhas-birthday': 'Buddha’s Birthday',
};

/** Festivals whose date can move by a day (moon sighting / regional almanac). */
export const EXPECTED_FESTIVALS = new Set<FestivalKey>(FESTIVAL_GROUPS.filter((g) => g.expected).flatMap((g) => g.festivals));
