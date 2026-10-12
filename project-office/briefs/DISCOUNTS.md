# Discounts, vouchers & partner codes — what the margins allow (2026-10-12)

> Source: `node --env-file=.env scripts/discount-headroom.mjs` (live shop prices × Prodigi GB costs,
> free delivery baked in, card fees 1.5% + 20p, VAT not counted as revenue). Full table regenerates
> to `.prodigi-assets/DISCOUNT-HEADROOM.md`.

## What each shop product keeps per sale (contribution)
| Product | Price | Keeps | Margin | Break-even % off | Max % keeping 10% | After £5 off | After £10 off |
|---|--:|--:|--:|--:|--:|--:|--:|
| greetings card | £5 | £1.94 | 47% | 47% | 37% | −£2.15 | −£6.24 |
| mug | £18 | £5.23 | 35% | 35% | 25% | £1.14 | −£2.95 |
| cushion (small heart/round) | £20 | £2.87 | 17% | 17% | 7% | −£1.23 | −£5.32 |
| cushion 12″ / 18″ round | £30 | £7–8 | 28–32% | 28–32% | 18–22% | ~£3–4 | ~−£1 |
| cushion 22″ / double-sided | £35–45 | £7–10 | 22–35% | | 11–25% | £3–6 | −£1 to £2 |
| jigsaw 30 / 110 / 252 | £25–35 | £3.51–8.69 | 17–30% | | 6–20% | −£0.58 to £4.60 | negative to £0.51 |
| framed print 11×14 → 28×40 | £65–130 | £15–19 | 16–30% | | 6–19% | £11–15 | £7–10.50 |
| fleece blanket M / L | £60 / £75 | £12.60 / £17.88 | 25–29% | | 15–18% | £8.51 / £13.78 | £4.42 / £9.69 |

**Read-out:** margins are healthy on frames and blankets, thin on the entry items (card, small
cushion, 30-piece jigsaw). A flat £ voucher loses money on cheap items, so vouchers need a minimum
spend; a % code scales with the basket and is safe at 10% across the whole shop.

## Recommended menu (created in dev; founder to confirm)
| Code | Offer | Why |
|---|---|---|
| `WELCOME10` | 10% off, no minimum | Safe on every shop item (thinnest still keeps ~£1.20) |
| `FIVEOFF` | £5 off orders £30+ | Feels generous on mid-range gifts; minimum keeps it profitable |
| `TENOFF` | £10 off orders £60+ | Frames/blankets: £10 still leaves £4.40–£10 |
| influencer (e.g. `SARAHMAKES`) | 10% off for viewers + **5%** commission | 10% + 10% is too rich for frames (the guard trims it); 10% + 5% fits |
| PTA (e.g. `STMARYSPTA`) | no discount, **10%** of sales to the PTA | Easy pitch; the guard trims it only on the thinnest items |

**% or £?** Use **% for broad codes** (welcome, influencer) because it scales safely with what's
bought. Use **£5/£10 vouchers with minimum spends** for apology/goodwill, competitions and seasonal
pushes, where a round number feels nicer.

## Safety built in (D15)
- Codes are priced **only on the server**: the customer types text; value, minimum spend and
  commission live in `promo_codes`.
- **Best single saving:** a code never stacks with the 5% join/family-set savings; the customer
  gets the bigger one.
- **Margin guard:** whatever a code says, an order always keeps at least **10%** of its ex-VAT goods
  revenue after product, delivery, card fees, discount and partner commission. The discount is trimmed
  first, then the commission. Items with no known cost (gift wrap) are never discounted.
- Limits: start/end dates and a maximum number of *paid* redemptions. **Not yet:** one use per
  customer (guests have no account; would need an email check at payment).
- Manage with `scripts/promo-codes.mjs` (create / list / off / earnings).

## Referral + class codes (D17)
- **Give £5, get £5:** every parent's code is on their account page with copy/share. The friend gets £5 off their first order over £30; the referrer gets £5 credit once it's paid, which comes off their next order automatically.
- **PTA class codes:** `create STMARYS-Y2 --percent 0 --commission 10 --partner "St Mary's PTA" --class "Year 2" --type PTA`. `scripts/promo-codes.mjs partners` shows each school's total and per-class split (the number to pay the PTA).
