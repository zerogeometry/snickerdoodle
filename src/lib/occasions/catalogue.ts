/**
 * "The days we celebrate" (founder, 27 Oct): the festival groups a family can put on its calendar.
 * Client-safe metadata only — the DATES are worked out on the server (src/server/occasions/dates.ts).
 *
 * Opt-in per group. On by default: the everyday family days and Christmas (we already run the
 * Christmas order-by dates); everything else only when the family ticks it. A family's choices can
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
  /** shown under one heading with its siblings (the East Asian regions) */
  family?: 'east-asian';
}

export const FESTIVAL_GROUPS: FestivalGroup[] = [
  { id: 'everyday', name: 'Everyday family days', blurb: 'Mothering Sunday, Father’s Day, Valentine’s, New Year', festivals: ['mothering-sunday', 'fathers-day', 'valentines', 'new-year'], defaultOn: true },
  { id: 'christmas', name: 'Christmas', blurb: 'Christmas Day', festivals: ['christmas'], defaultOn: true },
  { id: 'easter', name: 'Easter', blurb: 'Easter Sunday, Shrove Tuesday', festivals: ['easter', 'shrove-tuesday'] },
  { id: 'jewish', name: 'Jewish festivals', blurb: 'Rosh Hashanah, Hanukkah, Passover', festivals: ['rosh-hashanah', 'hanukkah', 'passover'] },
  { id: 'muslim', name: 'Muslim festivals', blurb: 'Ramadan begins, Eid al-Fitr, Eid al-Adha', festivals: ['ramadan', 'eid-al-fitr', 'eid-al-adha'], expected: true },
  { id: 'hindu', name: 'Hindu festivals', blurb: 'Diwali, Holi, Raksha Bandhan', festivals: ['diwali', 'holi', 'raksha-bandhan'], expected: true },
  { id: 'sikh', name: 'Sikh festivals', blurb: 'Vaisakhi, Bandi Chhor Divas', festivals: ['vaisakhi', 'bandi-chhor'], expected: true },
  { id: 'east-asian-cn', name: 'Chinese', blurb: 'Chinese New Year, Mid-Autumn Festival', festivals: ['lny-cn', 'mid-autumn-cn'], family: 'east-asian' },
  { id: 'east-asian-kr', name: 'Korean', blurb: 'Seollal, Chuseok', festivals: ['seollal', 'chuseok'], family: 'east-asian' },
  { id: 'east-asian-vn', name: 'Vietnamese', blurb: 'Tết, Tết Trung Thu', festivals: ['tet', 'trung-thu'], family: 'east-asian' },
  { id: 'buddhist', name: 'Buddhist festivals', blurb: 'Buddha’s Birthday (the 8th day of the 4th lunar month)', festivals: ['buddhas-birthday'] },
  { id: 'milestones', name: 'Baby milestones', blurb: 'Full month, 100 days (baek-il), first birthday (dol) — for each little one', festivals: [] },
];

export const DEFAULT_CELEBRATE = FESTIVAL_GROUPS.filter((g) => g.defaultOn).map((g) => g.id);
const KNOWN = new Set(FESTIVAL_GROUPS.map((g) => g.id));
/** A family's stored choice, cleaned (unknown ids dropped, no duplicates). */
export function cleanCelebrate(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CELEBRATE];
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && KNOWN.has(x)))];
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
