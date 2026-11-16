// Discount + partner codes: the ONE set of rules for making a code — PURE (no I/O, no database).
// Both scripts/promo-codes.mjs (the terminal) and the admin app's codes screen (src/server/admin/codes.ts) build the
// row to insert here, so a code made either way is the same code. src/lib/__tests__/promoCodeRules.test.ts pins it.
//
// The shop prices a code ONLY server-side (src/pricing/promo.ts evaluatePromo, src/server/promos.ts resolvePromo);
// these rules refuse anything it can't price: one kind of offer per code (percent off, pounds off, or one free card),
// percent 0–50 (0 = a partner code that only earns commission), pounds above £0, commission 0–30%, dates in order.
// Whatever is set here, the margin guard still keeps every order above 10% contribution.

/** The code format the shop accepts (src/pricing/promo.ts normalisePromoCode): 3–32 letters, digits or dashes. */
export const CODE_FORMAT = /^[A-Z0-9-]{3,32}$/;
export const KINDS = /** @type {const} */ (['PERCENT', 'FIXED', 'FREE_CARD']);
/** Partner types a code can be MADE with. REFERRAL codes are made by the shop, one per parent (src/server/referrals.ts). */
export const MAKEABLE_PARTNER_TYPES = /** @type {const} */ (['INFLUENCER', 'PTA', 'CAMPAIGN']);
export const LIMITS = { maxPercent: 50, maxPounds: 100, maxMinSpendPounds: 1000, maxCommissionPercent: 30, maxUses: 100_000, partnerName: 80, classLabel: 40 };

/**
 * @typedef {'PERCENT' | 'FIXED' | 'FREE_CARD'} PromoKind
 * @typedef {'INFLUENCER' | 'PTA' | 'CAMPAIGN'} MakeablePartnerType
 * @typedef {{
 *   code?: string | null,
 *   kind?: string | null,
 *   amount?: string | number | null,
 *   minSpend?: string | number | null,
 *   maxUses?: string | number | null,
 *   startsOn?: string | null,
 *   endsOn?: string | null,
 *   firstOrder?: boolean | null,
 *   commission?: string | number | null,
 *   partnerName?: string | null,
 *   partnerType?: string | null,
 *   partnerEmail?: string | null,
 *   classLabel?: string | null,
 * }} CodeInput  what a person typed: the terminal's options, or the codes screen's form (every field a string)
 * @typedef {{
 *   code: string, kind: PromoKind, value: number, minSpendPence: number,
 *   partnerName: string | null, partnerType: MakeablePartnerType | null, partnerEmail: string | null,
 *   commissionBps: number, classLabel: string | null, firstOrderOnly: boolean,
 *   startsAt: Date | null, endsAt: Date | null, maxRedemptions: number | null,
 * }} CodeRow  a promo_codes row, ready to insert (src/db/schema.ts promoCodes)
 * @typedef {'code' | 'kind' | 'amount' | 'minSpend' | 'maxUses' | 'startsOn' | 'endsOn' | 'commission' | 'partnerName' | 'partnerType' | 'partnerEmail' | 'classLabel'} CodeField
 * @typedef {{ field: CodeField, message: string }} CodeProblem
 */

/** What a person typed as a code: trimmed, upper-cased, spaces taken out (then checked against {@link CODE_FORMAT}). */
export function normaliseCode(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

const blank = (v) => v === undefined || v === null || String(v).trim() === '';
const text = (v) => (blank(v) ? null : String(v).trim().replace(/\s+/g, ' '));

/** "10", "10.5", "£10", "12.50%" → hundredths (1000, 1050, 1000, 1250); anything else → NaN. Never rounds. */
export function hundredths(v) {
  const s = String(v ?? '').trim().replace(/^£/, '').replace(/%$/, '').trim();
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return Number.NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** UTC instant of 00:00 on a London calendar day (GMT or BST). */
export function londonMidnight(ymd) {
  const guess = new Date(`${ymd}T00:00:00Z`);
  const name =
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' }).formatToParts(guess).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-]\d+)?/.exec(name);
  return new Date(guess.getTime() - (m && m[1] ? Number(m[1]) : 0) * 3_600_000);
}

/** A day (YYYY-MM-DD → midnight UK time as it begins) or an exact ISO moment (2026-12-24T18:00Z); else null. */
export function parseWhen(v) {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : londonMidnight(s);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check what was typed and build the row. Every problem is reported at once, each against its field.
 * @param {CodeInput} input
 * @param {Date} [now]  a code that has already ended is refused
 * @returns {{ ok: true, row: CodeRow } | { ok: false, problems: CodeProblem[] }}
 */
export function buildCodeRow(input, now = new Date()) {
  /** @type {CodeProblem[]} */
  const problems = [];
  const bad = (field, message) => problems.push({ field, message });

  const code = normaliseCode(input.code);
  if (!code) bad('code', 'give the code a name, like WELCOME10');
  else if (!CODE_FORMAT.test(code)) bad('code', 'a code is 3 to 32 letters, numbers or dashes (no spaces or symbols)');

  const kind = /** @type {PromoKind} */ (String(input.kind ?? '').toUpperCase());
  if (!KINDS.includes(kind)) bad('kind', 'choose what the code gives: percent off, pounds off or a free card');

  const commissionBps = blank(input.commission) ? 0 : hundredths(input.commission);
  if (!(commissionBps >= 0 && commissionBps <= LIMITS.maxCommissionPercent * 100)) bad('commission', `commission is a percent from 0 to ${LIMITS.maxCommissionPercent}`);

  let value = 0;
  if (kind === 'PERCENT') {
    value = blank(input.amount) ? Number.NaN : hundredths(input.amount);
    if (!(value >= 0 && value <= LIMITS.maxPercent * 100)) bad('amount', `percent off is a number from 0 to ${LIMITS.maxPercent}`);
    else if (value === 0 && !(commissionBps > 0)) bad('amount', '0% off only works as a partner code that earns commission: add a commission, or a discount');
  } else if (kind === 'FIXED') {
    value = blank(input.amount) ? Number.NaN : hundredths(input.amount);
    if (!(value > 0 && value <= LIMITS.maxPounds * 100)) bad('amount', `pounds off is more than £0 and at most £${LIMITS.maxPounds}`);
  } // FREE_CARD: the card's own price comes off, so the value is always 0 (an amount, if sent, is ignored)

  const minSpendPence = blank(input.minSpend) ? 0 : hundredths(input.minSpend);
  if (!(minSpendPence >= 0 && minSpendPence <= LIMITS.maxMinSpendPounds * 100)) bad('minSpend', `minimum spend is in pounds, from £0 to £${LIMITS.maxMinSpendPounds}`);

  let maxRedemptions = null;
  if (!blank(input.maxUses)) {
    const s = String(input.maxUses).trim();
    maxRedemptions = /^\d+$/.test(s) ? Number(s) : Number.NaN;
    if (!(maxRedemptions >= 1 && maxRedemptions <= LIMITS.maxUses)) bad('maxUses', `uses is a whole number from 1 to ${LIMITS.maxUses.toLocaleString('en-GB')}`);
  }

  const startsAt = blank(input.startsOn) ? null : parseWhen(input.startsOn);
  if (!blank(input.startsOn) && !startsAt) bad('startsOn', 'the start date isn’t a real date (YYYY-MM-DD)');
  const endsAt = blank(input.endsOn) ? null : parseWhen(input.endsOn);
  if (!blank(input.endsOn) && !endsAt) bad('endsOn', 'the end date isn’t a real date (YYYY-MM-DD)');
  else if (endsAt && startsAt && endsAt <= startsAt) bad('endsOn', 'the code has to end after it starts');
  else if (endsAt && endsAt <= now) bad('endsOn', 'that end date has already passed');

  const partnerName = text(input.partnerName);
  if (partnerName && partnerName.length > LIMITS.partnerName) bad('partnerName', `keep the partner’s name under ${LIMITS.partnerName} letters`);
  const typeRaw = text(input.partnerType)?.toUpperCase() ?? null;
  const partnerType = /** @type {MakeablePartnerType | null} */ (typeRaw);
  if (typeRaw === 'REFERRAL') bad('partnerType', 'referral codes are made by the shop, one for each parent: choose creator, school PTA or campaign');
  else if (typeRaw && !MAKEABLE_PARTNER_TYPES.includes(/** @type {MakeablePartnerType} */ (typeRaw))) bad('partnerType', 'choose creator, school PTA or campaign');
  if (commissionBps > 0 && !partnerName) bad('partnerName', 'a code that earns commission needs the partner it’s paid to');
  if (commissionBps > 0 && !typeRaw) bad('partnerType', 'a code that earns commission needs a partner type');
  if (typeRaw && !partnerName && !(commissionBps > 0)) bad('partnerName', 'name the partner this code is for');

  const partnerEmail = text(input.partnerEmail)?.toLowerCase() ?? null;
  if (partnerEmail && (partnerEmail.length > 254 || !EMAIL.test(partnerEmail))) bad('partnerEmail', 'the partner’s email doesn’t look like an email address');

  const classLabel = text(input.classLabel);
  if (classLabel && classLabel.length > LIMITS.classLabel) bad('classLabel', `keep the class under ${LIMITS.classLabel} letters`);
  if (classLabel && !partnerName) bad('classLabel', 'a class belongs to a school: name the partner too');

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    row: {
      code,
      kind,
      value,
      minSpendPence,
      partnerName,
      partnerType: typeRaw ? partnerType : null,
      partnerEmail,
      commissionBps,
      classLabel,
      firstOrderOnly: input.firstOrder === true,
      startsAt,
      endsAt,
      maxRedemptions,
    },
  };
}

/**
 * The terminal's options (scripts/promo-codes.mjs create CODE …) as a {@link CodeInput}.
 * @param {string[]} args  everything after `create`
 * @returns {{ ok: true, input: CodeInput } | { ok: false, message: string }}
 */
export function inputFromArgs(args) {
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const percent = opt('percent');
  const pounds = opt('pounds');
  const freeCard = args.includes('--free-card');
  if ([percent !== undefined, pounds !== undefined, freeCard].filter(Boolean).length !== 1) return { ok: false, message: 'give exactly one of --percent N, --pounds N or --free-card' };
  return {
    ok: true,
    input: {
      code: args[0],
      kind: freeCard ? 'FREE_CARD' : percent !== undefined ? 'PERCENT' : 'FIXED',
      amount: freeCard ? null : (percent ?? pounds),
      minSpend: opt('min'),
      maxUses: opt('max'),
      startsOn: opt('starts'),
      endsOn: opt('ends'),
      firstOrder: args.includes('--first-order'),
      commission: opt('commission'),
      partnerName: opt('partner'),
      partnerType: opt('type'),
      partnerEmail: opt('partner-email'),
      classLabel: opt('class'),
    },
  };
}

const gbp = (p) => `£${(p / 100).toFixed(2)}`;

/** What a code gives, in words: "10% off", "£5.00 off", "one card free", "no discount". */
export function describeOffer(row) {
  if (row.kind === 'FREE_CARD') return 'one card free';
  if (row.kind === 'PERCENT') return row.value ? `${row.value / 100}% off` : 'no discount';
  return `${gbp(row.value)} off`;
}
