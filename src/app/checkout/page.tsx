'use client';

import { IconArrowLeft, IconGift, IconHeart, IconLock, IconPencil, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Toggle } from '@/ui/primitives/Toggle';
import { ProductArt, type ProductKey } from '@/ui/components/ProductArt';
import { MockupPreview } from '@/ui/components/MockupPreview';
import { CardPackThumb } from '@/ui/components/CardPackThumb';
import { BundleThumb } from '@/ui/components/BundleThumb';
import { MultiBuyChip, MultiBuyQty } from '@/ui/components/MultiBuy';
import { CheckoutAddOns } from '@/ui/components/CheckoutAddOns';
import { productOfKey } from '@/pricing';
import { hasMultiBuy } from '@/pricing/multibuy';
import { basketSubtotal, CHECKOUT_REF_KEY, DELIVERY_PENCE, gbp, isBundleLine, isCalendarLine, isPackLine, orderItemsFor, SUBJECT_KEY, toast, useBasket } from '@/lib/store';
import { quoteBasket } from '@/app/actions/quote';
import { placeOrderAction } from '@/app/actions/order';
import { adoptPendingPlacement } from '@/app/actions/adopt';
import type { ClientQuote } from '@/app/actions/quote';
import { ChristmasPromise } from '@/ui/components/ChristmasPromise';
import { GIFT_NOTE_MAX } from '@/lib/gift-note';


export default function CheckoutPage() {
  const items = useBasket((s) => s.items);
  const add = useBasket((s) => s.add);
  const remove = useBasket((s) => s.remove);
  const setQty = useBasket((s) => s.setQty);
  const clear = useBasket((s) => s.clear);
  const router = useRouter();

  const [gift, setGift] = useState(false);
  // the gift's little note — sent with the order (screened server-side) and on the receipt
  const [giftNote, setGiftNote] = useState('');
  // a GUEST's receipt email (an account has its own): sent with the order; a friend's code is checked against it
  const [email, setEmail] = useState('');
  const quoteEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? email.trim() : undefined;
  const [quote, setQuote] = useState<ClientQuote | null>(null);
  // A discount / partner code: the server resolves + prices it; we only hold the text.
  const [codeInput, setCodeInput] = useState('');
  const [promoCode, setPromoCode] = useState<string | undefined>(undefined);
  const [placing, setPlacing] = useState(false);
  const [subject, setSubject] = useState<string | null>(null);
  // bumped to re-ask the server (e.g. a code's last use went while this page was open)
  const [quoteNonce, setQuoteNonce] = useState(0);

  const empty = items.length === 0;
  // A personalised line (a drawing on a product, a card pack, a calendar, the bundle) needs the
  // controlling parent — so checkout asks a guest to sign up; pure add-ons can still guest-checkout.
  const hasPersonalised = items.some((i) => i.artwork || i.cards?.length || isCalendarLine(i) || isBundleLine(i));
  // (from the server's quote: someone signed in needs no sign-up line, and has their own email)
  const signedIn = quote?.signedIn ?? false;

  // The child this is for, named in "Who's this for?" before checkout.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setSubject(sessionStorage.getItem(SUBJECT_KEY));
    } catch {
      // sessionStorage unavailable — no subject line
    }
  }, []);

  // Returning from the guest "keep it & check out" flow: a placement was stashed
  // before sign-in. Now that they're (hopefully) signed in, adopt the draft into
  // their family and seed the basket with the server-priced line.
  const consumedRef = useRef(false);
  useEffect(() => {
    if (consumedRef.current || typeof window === 'undefined') return;
    const raw = sessionStorage.getItem('sd_pending_place');
    if (!raw) return;
    consumedRef.current = true;
    let pending: { assetId: string; variantId: string; transform: unknown; sourceObjectId?: string | null };
    try {
      pending = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem('sd_pending_place');
      return;
    }
    void (async () => {
      const res = await adoptPendingPlacement({
        assetId: pending.assetId,
        variantId: pending.variantId,
        transform: pending.transform as never,
        sourceObjectId: pending.sourceObjectId ?? undefined,
      });
      if (!res.ok) {
        if (res.needsAuth) {
          consumedRef.current = false; // keep the pending placement for after login
          toast('one quick sign-in to finish keeping this');
          router.push('/login?next=/checkout');
          return;
        }
        toast('hmm — couldn’t add that, try again');
        sessionStorage.removeItem('sd_pending_place');
        return;
      }
      sessionStorage.removeItem('sd_pending_place');
      add({ ...res.line, product: res.line.product as ProductKey });
      toast('kept to your keepsake box ✓');
    })();
  }, [add, router]);

  // The authoritative total comes from the server — it re-prices every line from
  // the trusted catalogue, so the client can't influence what's charged.
  useEffect(() => {
    let live = true;
    if (empty) {
      setQuote(null);
      return;
    }
    // (the christmas bundle sends its drawings + extras: the server counts + prices them)
    quoteBasket({ items: items.map((i) => ({ productKey: i.sku ?? i.product, qty: i.qty, ...(isBundleLine(i) ? { bundle: i.bundle } : {}) })), gift, promoCode, email: quoteEmail }).then((q) => {
      if (live) setQuote(q);
    });
    return () => {
      live = false;
    };
  }, [items, gift, empty, promoCode, quoteEmail, quoteNonce]);

  // What to tell the customer about their code — plain, friendly, never a dead end.
  const promoMessage = (() => {
    if (!promoCode || !quote) return null;
    if (quote.promoError === 'unknown') return { ok: false, text: 'we don’t recognise that code — check the spelling?' };
    if (quote.promoError === 'expired') return { ok: false, text: 'that code has finished, sorry' };
    if (quote.promoError === 'not-started') return { ok: false, text: 'that code isn’t live yet' };
    if (quote.promoError === 'used-up') return { ok: false, text: 'that code has been fully used' };
    if (quote.promoError === 'own-code') return { ok: false, text: 'that’s your own code — share it with a friend instead ✦' };
    if (quote.promoError === 'first-order-only')
      return { ok: false, text: quote.creditPence > 0 ? 'that code is for a first order — your credit still applies' : 'that code is for a first order — lovely to see you back ✦' };
    if (quote.promoError === 'needs-buyer') return { ok: false, text: 'that code is for a first order — log in (or add your email) and we’ll check it ✦' };
    const p = quote.promo;
    if (!p) return null;
    if (p.applied && p.kind === 'FREE_CARD') return { ok: true, text: `${p.code} applied — one greetings card is on us ✦` };
    if (p.applied) return { ok: true, text: p.capped ? `${p.code} applied — this basket’s maximum saving` : `${p.code} applied ✦` };
    if (p.reason === 'needs-card') return { ok: false, text: `${p.code} gives you a greetings card free — add one to your basket ✦` };
    if (p.reason === 'needs-more') return { ok: false, text: `your free card comes with a slightly bigger order — add something else and it’s on us` };
    if (p.reason === 'min-spend') return { ok: false, text: `${p.code} works on orders over ${gbp(p.minSpendPence ?? 0)}` };
    if (p.reason === 'better-saving-applied') return { ok: true, text: `you’re already getting a better saving — we’ve kept that one` };
    return { ok: false, text: `${p.code} doesn’t apply to these items` };
  })();

  // Optimistic client figures until the server quote lands (then it governs).
  const subtotalPence = quote?.subtotalPence ?? basketSubtotal(items);
  const deliveryPence = quote ? quote.deliveryPence : empty ? 0 : DELIVERY_PENCE;
  const savingPence = quote?.joinSavingPence ?? 0;
  const setSavingPence = quote?.familySetSavingPence ?? 0;
  const parcelSavingPence = quote?.parcelSavingPence ?? 0;
  const multiBuySavingPence = quote?.multiBuySavingPence ?? 0;
  const promoSavingPence = quote?.promoSavingPence ?? 0;
  const creditPence = quote?.creditPence ?? 0;
  const total = quote?.totalPence ?? (empty ? 0 : subtotalPence + DELIVERY_PENCE);
  // Each line's price from the SERVER quote (its lines align 1:1 with the basket when every line is
  // sellable); the client figure only fills in until the quote lands.
  const linePence = (i: number) => (quote && quote.lines.length === items.length ? quote.lines[i]!.linePence : items[i]!.pricePence * items[i]!.qty);
  // The SERVER's multi-buy on this line (only when it's the saving the basket gets) — never worked out here.
  // the line's product's multi-buy tiers — the SERVER's (quoteBasket), aligned with the lines
  const tiersOf = (i: number) => (quote && quote.lines.length === items.length ? (quote.lineTiers?.[i] ?? null) : null);
  // how many of the same product sit on the OTHER lines (multi-buy counts the product across lines)
  const othersOf = (i: number) => {
    const p = productOfKey(items[i]!.sku ?? items[i]!.product);
    return items.reduce((n, x, j) => n + (j !== i && !isBundleLine(x) && productOfKey(x.sku ?? x.product) === p ? x.qty : 0), 0);
  };
  const multiBuyOf = (i: number) => {
    const l = quote && quote.lines.length === items.length ? quote.lines[i] : undefined;
    return l?.multiBuyBps && l.multiBuySavingPence ? { bps: l.multiBuyBps, pence: l.multiBuySavingPence } : null;
  };

  // Place a REAL order: the server re-prices and persists it. With Stripe
  // configured we redirect to Checkout; in local dev it's marked paid and we go
  // straight to the confirmation.
  const placeOrder = async () => {
    if (empty || placing) return;
    setPlacing(true);
    try {
      // Read the subject FRESH (it may have been set just before, or carried across
      // the magic-link round-trip) rather than the mount-time value.
      let liveSubject = subject;
      try {
        liveSubject = sessionStorage.getItem(SUBJECT_KEY) ?? subject;
      } catch {
        // ignore
      }
      const res = await placeOrderAction({
        // Fold the per-print details (cushion back, card inside message) into the artwork payload
        // — the server freezes + screens them and the fulfilment renderer reads them. Harmless elsewhere.
        // A card pack sends qty 1 + its cards instead (orderItemsFor).
        items: orderItemsFor(items),
        gift,
        giftNote: gift && giftNote.trim() ? giftNote : undefined,
        subject: liveSubject ?? undefined,
        promoCode,
        email: signedIn ? undefined : quoteEmail,
      });
      if (res.needsAuth) {
        // a personalised order needs the controlling parent — keep + order after sign-up.
        // basket + "who's this for" persist (sessionStorage) across the magic-link round-trip.
        toast('a quick sign-up keeps your keepsake safe');
        router.push('/login?next=/checkout');
        return;
      }
      if (!res.ok && res.reason === 'too-small') {
        toast('one of your drawings is too small to print well at that size — tap customize to pick a size that works');
        setPlacing(false);
        return;
      }
      if (!res.ok && res.reason === 'promo') {
        // e.g. a limited code's last use went a moment ago — say so, and show the basket without it
        toast(res.promoError === 'used-up' ? 'that code has just been fully used, sorry — here’s your basket without it' : 'that code can’t be used on this order — here’s your basket without it');
        setQuoteNonce((n) => n + 1);
        return;
      }
      if (!res.ok && res.reason === 'gift-note') {
        toast('we can’t send that gift note — could you reword it?');
        return;
      }
      if (!res.ok) {
        toast('hmm, that didn’t go through — try again');
        return;
      }
      if (res.checkoutUrl) {
        // The basket stays put until the payment's through: "back" from Stripe finds it as it was.
        // The confirmation page empties it, for this order only (CHECKOUT_REF_KEY).
        try {
          if (res.ref) sessionStorage.setItem(CHECKOUT_REF_KEY, res.ref);
        } catch {
          // ignore
        }
        window.location.href = res.checkoutUrl; // → Stripe Checkout
        return;
      }
      clear(); // dev: paid already
      try {
        sessionStorage.removeItem(SUBJECT_KEY); // consumed — don't leak into a later checkout
      } catch {
        // ignore
      }
      router.push(`/checkout/confirmation?ref=${res.ref}`);
    } finally {
      setPlacing(false);
    }
  };

  const promoBox = (where: 'mobile' | 'desktop') => (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        setPromoCode(codeInput.trim() || undefined);
      }}
    >
      <label htmlFor={`promo-code-${where}`} className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
        got a code?
      </label>
      <div className="flex gap-2">
        <input
          id={`promo-code-${where}`}
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={32}
          placeholder="e.g. WELCOME10"
          className="min-h-11 min-w-0 flex-1 rounded-lg border-2 border-line bg-paper px-3 text-sm font-bold tracking-wide text-cocoa placeholder:font-normal placeholder:text-ink-faint"
        />
        <button type="submit" className="press min-h-11 rounded-lg border-2 border-cocoa bg-paper px-4 text-sm font-extrabold text-cocoa">
          apply
        </button>
      </div>
      {promoMessage ? (
        <p role="status" className={'mt-1.5 text-[12px] font-semibold ' + (promoMessage.ok ? 'text-green-save' : 'text-ink-soft')}>
          {promoMessage.text}
        </p>
      ) : null}
    </form>
  );

  const summaryRows = (
    <>
    <dl className="mt-3 space-y-2 text-[13px] text-ink-soft">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{gbp(subtotalPence)}</dd>
      </div>
      {savingPence > 0 ? (
        <div className="flex justify-between text-green-save">
          <dt>Family saving (5%)</dt>
          <dd>−{gbp(savingPence)}</dd>
        </div>
      ) : null}
      {setSavingPence > 0 ? (
        <div className="flex justify-between text-green-save">
          <dt>Family set saving (5%)</dt>
          <dd>−{gbp(setSavingPence)}</dd>
        </div>
      ) : null}
      {parcelSavingPence > 0 ? (
        <div className="flex justify-between text-green-save">
          {/* D24: the postage we save by packing them together, handed back (src/pricing/parcels.ts) */}
          <dt>Same-parcel saving</dt>
          <dd>−{gbp(parcelSavingPence)}</dd>
        </div>
      ) : null}
      {multiBuySavingPence > 0 ? (
        <div className="flex justify-between text-green-save">
          {/* buy more of the same, save more — each product's own tiers, from its costs (src/pricing/multibuy.ts) */}
          <dt>Buy more &amp; save</dt>
          <dd>−{gbp(multiBuySavingPence)}</dd>
        </div>
      ) : null}
      {creditPence > 0 ? (
        <div className="pop-in flex justify-between font-semibold text-green-save">
          <dt>Your credit</dt>
          <dd>−{gbp(creditPence)}</dd>
        </div>
      ) : null}
      {promoSavingPence > 0 && quote?.promo ? (
        <div className="pop-in flex justify-between font-semibold text-green-save">
          <dt>{quote.promo.kind === 'FREE_CARD' ? `Free card (${quote.promo.code})` : `Code ${quote.promo.code}`}</dt>
          <dd>−{gbp(promoSavingPence)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between">
        <dt>Delivery</dt>
        <dd>{deliveryPence === 0 ? <span className="font-semibold text-green-save">Free</span> : gbp(deliveryPence)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold text-cocoa">
        <dt>Total</dt>
        <dd>{gbp(total)}</dd>
      </div>
    </dl>
    {/* Christmas (D24): will it ALL arrive in time? Honest per-line answer, in season only. */}
    {!empty ? (
      <div className="mt-2">
        <ChristmasPromise lineKeys={items.map((i) => i.sku ?? i.product)} labelFor={(k) => items.find((i) => (i.sku ?? i.product) === k)?.name ?? k} />
      </div>
    ) : null}
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-40 md:pb-0">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-1">
          <Link href="/start-creating" aria-label="Back to your collection" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center">
            <Icon icon={IconArrowLeft} size={20} className="text-ink-soft" />
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center truncate font-display text-xl font-semibold text-cocoa">snickerdoodle</Link>
        </div>
        {/* narrow phones: just the padlock (the words from 360px), never wrapping into the logo */}
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-ink-soft" aria-label="secure checkout">
          <Icon icon={IconLock} size={14} className="text-green-save" /> <span className="hidden min-[360px]:inline">secure checkout</span>
        </span>
      </header>

      {empty ? (
        // ── Empty basket ──
        <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-paper-2">
            <Icon icon={IconShieldCheck} size={34} className="text-line" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-cocoa">Your basket&apos;s empty</h1>
          <p className="mt-1.5 max-w-xs text-sm text-ink-soft">
            Pop a drawing on something lovely and it&apos;ll show up here.
          </p>
          <Button href="/start-creating" size="lg" className="mt-6">
            see the range →
          </Button>
        </main>
      ) : (
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          {/* min-w-0: a long line in one column must never stretch it past a narrow phone's edge */}
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
            {/* Basket */}
            <div>
              <h1 className="font-display text-xl font-semibold text-cocoa">Your basket</h1>
              {subject ? (
                <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-faint">
                  <Icon icon={IconHeart} size={13} className="text-cinnamon" /> a keepsake for {subject}
                </p>
              ) : null}
              <div className="mt-3 space-y-2.5">
                {items.map((item, idx) => {
                  const oneOff = isPackLine(item) || isBundleLine(item);
                  // every line re-opens ITS OWN customize, with "update basket" (as the basket sidebar does)
                  const editHref = `/customize/${item.product}?edit=${encodeURIComponent(item.id)}`;
                  const editLabel = isBundleLine(item) ? `edit your ${item.name}` : isPackLine(item) ? `edit the cards in your ${item.name}` : `customize your ${item.name}`;
                  return (
                  // (founder, 29 Oct) desktop: thumbnail · title + subtitle · buy more & save + quantity · prices · remove / edit;
                  // a phone stacks the same things in the same order
                  <div
                    key={item.id}
                    className="grid items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-paper p-3 [grid-template-areas:'thumb_title_actions'_'thumb_qty_price'] [grid-template-columns:3.5rem_minmax(0,1fr)_auto] md:[grid-template-areas:'thumb_title_qty_price_actions'] md:[grid-template-columns:3.5rem_minmax(0,1fr)_auto_minmax(4.5rem,auto)_auto]"
                  >
                    <div className="relative h-14 w-14 overflow-hidden rounded-xl bg-oat [grid-area:thumb] self-start md:self-center">
                      {/* The ACTUAL creation — this drawing, on this variant, at its saved
                          placement — so checkout shows every unique instance exactly as it prints. */}
                      {isPackLine(item) ? (
                        <CardPackThumb item={item} px={56} />
                      ) : isBundleLine(item) ? (
                        <BundleThumb item={item} px={56} />
                      ) : item.artwork && item.variantId ? (
                        <MockupPreview
                          productKey={item.product}
                          assetId={item.artwork.assetId}
                          variantId={item.variantId}
                          transform={item.artwork.transform}
                          sourceObjectId={item.artwork.sourceObjectId}
                          ground={item.ground}
                          size="thumb"
                          px={56}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ProductArt product={item.product} size={44} />
                        </div>
                      )}
                    </div>
                    {/* (b) title + subtitle */}
                    <div className="min-w-0 [grid-area:title]">
                      <div className="break-words text-sm font-bold text-cocoa">{item.name}</div>
                      {item.sub ? <div className="break-words text-[11px] text-ink-faint">{item.sub}</div> : null}
                    </div>
                    {/* (c) buy more & save + the quantity (a card pack / the bundle is always ONE — no quantity) */}
                    <div className="min-w-0 [grid-area:qty]">
                      {oneOff ? null : (
                        // the same dropdown as the product page — each option's discount from the SERVER's tiers; no offer → just the quantity
                        <MultiBuyQty compact tiers={tiersOf(idx) && hasMultiBuy(tiersOf(idx)!) ? tiersOf(idx) : null} value={Math.min(item.qty, 10)} others={othersOf(idx)} onChange={(q) => setQty(item.id, q)} productLabel={item.name} />
                      )}
                    </div>
                    {/* (d) the price — struck through + the new one + "−X%" when buy more & save applies */}
                    <div className="text-right [grid-area:price]">
                      {!gift && multiBuyOf(idx) ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[11px] text-ink-faint line-through">{gbp(linePence(idx))}</span>
                          <span className="text-sm font-bold text-cocoa">{gbp(linePence(idx) - multiBuyOf(idx)!.pence)}</span>
                          <MultiBuyChip bps={multiBuyOf(idx)!.bps} />
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-cocoa">{gift ? 'gift' : gbp(linePence(idx))}</div>
                      )}
                    </div>
                    {/* (e) remove, and edit beneath — labelled 44px icon buttons */}
                    <div className="flex flex-col items-center [grid-area:actions] self-start md:self-center">
                      <button type="button" onClick={() => remove(item.id)} aria-label={`remove ${item.name} from your basket`} className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:text-berry focus-visible:outline-2">
                        <Icon icon={IconTrash} size={18} />
                      </button>
                      <button type="button" onClick={() => router.push(editHref)} aria-label={editLabel} className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:text-cocoa focus-visible:outline-2">
                        <Icon icon={IconPencil} size={18} />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Goes nicely with it — made with their drawing, the server's real saving (src/server/addOns.ts) */}
              {quote?.addOns?.length ? <CheckoutAddOns addOns={quote.addOns} items={items} gift={gift} /> : null}

              {/* Gift fork */}
              <div className="mt-3 rounded-2xl border border-dashed border-tomato bg-paper-2 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold text-cocoa">
                    <Icon icon={IconGift} size={16} className="text-cinnamon" /> Sending this as a gift?
                  </span>
                  <Toggle on={gift} onChange={setGift} label="Send as a gift" />
                </div>
                {gift ? (
                  <div className="mt-2.5">
                    <p className="text-[11px] leading-relaxed text-ink-faint">
                      We&apos;ll wrap it and tuck the prices away, so the only surprise is the lovely one.
                    </p>
                    <label htmlFor="gift-note" className="sr-only">a little note for the gift (optional)</label>
                    <textarea
                      id="gift-note"
                      value={giftNote}
                      onChange={(e) => setGiftNote(e.target.value)}
                      maxLength={GIFT_NOTE_MAX}
                      placeholder="add a little note (optional)"
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-cocoa placeholder:text-ink-faint sm:text-xs"
                    />
                  </div>
                ) : null}
                <Link href="/home" className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-cinnamon">
                  <Icon icon={IconHeart} size={13} /> or add to a wishlist to share with family →
                </Link>
              </div>

              {/* Phones: the code box + breakdown live in the flow (the sticky bar shows the total) */}
              <div className="mt-5 rounded-2xl border border-line bg-paper p-4 md:hidden">
                {promoBox('mobile')}
                {summaryRows}
              </div>
            </div>

            {/* Order summary (desktop) */}
            <aside className="hidden self-start md:block">
              <div className="rounded-2xl border border-line bg-white p-4">
                <h2 className="font-display text-base font-semibold text-cocoa">Order summary</h2>
                {promoBox('desktop')}
{summaryRows}
                {signedIn ? null : (
                  <>
                    <label htmlFor="email-d" className="mt-4 block text-[11px] font-bold text-ink-soft">
                      email for your receipt
                    </label>
                    <input
                      id="email-d"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-xs text-cocoa placeholder:text-ink-faint"
                    />
                  </>
                )}
                <Button size="lg" className="mt-3 w-full" onClick={placeOrder} disabled={placing}>
                  {placing ? 'placing your order…' : 'checkout'}
                </Button>
                {signedIn ? null : (
                <p className="mt-3 text-center text-[11px] text-ink-soft">
                  {hasPersonalised ? (
                    <>
                      A quick <b>magic-link sign-up</b> keeps your keepsake safe — no password. already signed up?{' '}
                      <Link href="/login?next=/checkout" className="font-bold text-cinnamon">log in</Link>.
                    </>
                  ) : (
                    <>
                      <b>No account needed.</b> Checkout as a guest — or{' '}
                      <Link href="/login?next=/checkout" className="font-bold text-cinnamon">log in</Link>.
                    </>
                  )}
                </p>
                )}
                <p className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-leaf-pale px-2 py-2 text-[11px] text-green-save">
                  <Icon icon={IconShieldCheck} size={14} /> Your data is yours. Nothing shared, ever.
                </p>
              </div>
            </aside>
          </div>
        </main>
      )}

      {/* Mobile pinned total + checkout */}
      {!empty ? (
        <section aria-label="your total" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-oat px-4 pb-5 pt-3 md:hidden">
          <div className="mb-2 flex items-end justify-between">
            <span className="text-[13px] text-ink-soft">
              Total <span className="text-[11px] text-ink-faint">incl. delivery</span>
            </span>
            <span className="text-base font-extrabold text-cocoa">{gbp(total)}</span>
          </div>
          <Button size="lg" className="w-full" onClick={placeOrder} disabled={placing}>
            {placing ? 'placing…' : 'checkout'}
          </Button>
          {signedIn ? null : (
          <p className="mt-2 text-center text-[11px] text-ink-soft">
            {hasPersonalised ? (
              <>a quick sign-up keeps your keepsake safe — no password</>
            ) : (
              <>
                <b>No account needed</b> — guest checkout, perfect for grandparents
              </>
            )}
          </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
