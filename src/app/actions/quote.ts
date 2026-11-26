'use server';

import { lineEconomics, multiBuyTiers, quote, type Quote, type RequestedLine } from '@/pricing';
import { isBundleKey } from '@/lib/christmas-bundle';
import { pickAddOns, type AddOn } from '@/server/addOns';
import { getDb } from '@/db/client';
import { getCatalogue, loadCatalogue } from '@/server/catalogue';
import { normaliseBuyerEmail, resolveCheckoutPromo, welcomeCardOn, type PromoRefusal } from '@/server/promos';
import { getCreditBalance } from '@/server/referrals';
import { getCurrentAccount } from '@/server/session';
import { canOrderSamples } from '@/server/samples';
import { sampleAskFor } from '@/server/admin/context';

/**
 * The authoritative basket quote. The client sends ONLY product keys + quantities
 * (and whether it's a gift); the server re-prices everything from the trusted
 * catalogue and decides — server-side, never from the request — which code applies
 * and whether the free first card does. This is the seam that makes "never trust the
 * client for price / saving" real: a request can claim anything and still gets
 * charged the catalogue total.
 */
export interface QuoteRequest {
  /** `bundle`: the CHRISTMAS BUNDLE's drawings — its price is its size's variant (the key), never a figure. */
  items: { productKey: string; qty: number; bundle?: unknown }[];
  gift?: boolean;
  /** What the customer typed — resolved + priced server-side; its value is never trusted. */
  promoCode?: string;
  /** A guest's own email (the receipt field) — a first-order code is checked against it. */
  email?: string;
  /** "order as a sample, at cost": only ASKS — the server decides (admin + two-step login, src/server/samples.ts). */
  sample?: boolean;
}

/** The client's view of a quote: the partner commission is stripped (server-only). */
export type ClientQuote = Omit<Quote, 'partnerCommissionPence'> & {
  /** A code that couldn't be used at all (unknown / expired / used up / not started). */
  promoError?: PromoRefusal;
  /** The shop's welcome free card, applied by itself (nothing was typed) — `promo` says how it went. */
  promoAuto?: boolean;
  /** Is someone signed in? (checkout asks a guest for their receipt email; an account has one.) */
  signedIn: boolean;
  /** Per priced line: its product's multi-buy tiers for 2, 3, 4, 5+ (basis points), from the SERVER's
   * live costs (src/pricing/multibuy.ts) — the basket's quantity dropdown labels its options with
   * them. All 0 = no offer. (The saving itself is only ever what the quote charges.) */
  lineTiers: number[][];
  /** Up to three things that go with the basket, not in it, with their real same-parcel saving (src/server/addOns.ts). */
  addOns: AddOn[];
  /** May this person order a sample at cost (an admin who has done two-step login)? Shows the basket's switch. */
  sampleAvailable?: boolean;
  /** Signed out, and the shop's welcome free card is switched on: the basket may say "log in and it's on us". */
  welcomeOffered?: boolean;
};

export async function quoteBasket(req: QuoteRequest): Promise<ClientQuote> {
  const items: RequestedLine[] = (req.items ?? []).map((i) => ({
    productKey: String(i.productKey),
    qty: Number(i.qty),
    ...(i.bundle !== undefined ? { bundle: i.bundle } : {}),
  }));
  const db = getDb();
  const catalogue = await getCatalogue(db);
  const account = await getCurrentAccount();
  // An admin's SAMPLE at cost: decided here from the database + the signed step-up cookie, never the request alone.
  const sampleAvailable = account ? await canOrderSamples(db, await sampleAskFor({ id: account.id })) : false;
  if (sampleAvailable && req.sample === true) {
    const { partnerCommissionPence: _none, ...q } = quote(items, { gift: req.gift ?? false, catalogue, sample: true });
    void _none;
    return { ...q, lineTiers: q.lines.map(() => [0, 0, 0, 0]), addOns: [], signedIn: true, sampleAvailable: true };
  }
  const promo = await resolveCheckoutPromo(db, req.promoCode, { accountId: account?.id ?? null, email: account?.email ?? normaliseBuyerEmail(req.email) });
  const creditAvailablePence = account ? await getCreditBalance(db, account.id) : 0;
  const opts = { gift: req.gift ?? false, catalogue, promo: promo.rule, creditAvailablePence, freeCardEligible: promo.cardEligible };
  const { partnerCommissionPence: _hidden, ...q } = quote(items, opts);
  void _hidden;
  // card packs share their postage saving like every other product (founder, 26 Nov 2026); the bundle has none
  const lineTiers = q.lines.map((l) => (isBundleKey(l.productKey) ? [0, 0, 0, 0] : multiBuyTiers(lineEconomics(catalogue, l.productKey))));
  const addOns = q.lines.length ? pickAddOns(await loadCatalogue(db), items, opts) : [];
  const signedIn = !!account;
  const welcomeOffered = !signedIn && q.lines.length > 0 && (await welcomeCardOn(db));
  const base = { ...q, lineTiers, addOns, signedIn, ...(promo.auto ? { promoAuto: true } : {}), ...(sampleAvailable ? { sampleAvailable: true } : {}), ...(welcomeOffered ? { welcomeOffered: true } : {}) };
  return promo.refusal ? { ...base, promoError: promo.refusal } : base;
}
