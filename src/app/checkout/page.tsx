'use client';

import { IconArrowLeft, IconGift, IconHeart, IconLock, IconMinus, IconPlus, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Toggle } from '@/ui/primitives/Toggle';
import { ProductArt, type ProductKey } from '@/ui/components/ProductArt';
import { basketSubtotal, DELIVERY_PENCE, gbp, toast, useBasket } from '@/lib/store';
import { quoteBasket } from '@/app/actions/quote';
import { placeOrderAction } from '@/app/actions/order';
import { adoptPendingPlacement } from '@/app/actions/adopt';
import type { Quote } from '@/pricing';

const ADDONS: { id: string; product: ProductKey; name: string; pricePence: number }[] = [
  { id: 'addon-card', product: 'card', name: 'card', pricePence: 400 },
  { id: 'addon-wrap', product: 'giftWrap', name: 'gift wrap', pricePence: 300 },
  { id: 'addon-mini', product: 'framedPrint', name: 'mini print', pricePence: 800 },
];

export default function CheckoutPage() {
  const items = useBasket((s) => s.items);
  const add = useBasket((s) => s.add);
  const remove = useBasket((s) => s.remove);
  const setQty = useBasket((s) => s.setQty);
  const clear = useBasket((s) => s.clear);
  const router = useRouter();

  const [gift, setGift] = useState(false);
  const [email, setEmail] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);

  const empty = items.length === 0;

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
    quoteBasket({ items: items.map((i) => ({ productKey: i.sku ?? i.product, qty: i.qty })), gift }).then((q) => {
      if (live) setQuote(q);
    });
    return () => {
      live = false;
    };
  }, [items, gift, empty]);

  // Optimistic client figures until the server quote lands (then it governs).
  const subtotalPence = quote?.subtotalPence ?? basketSubtotal(items);
  const deliveryPence = quote ? quote.deliveryPence : empty ? 0 : DELIVERY_PENCE;
  const savingPence = quote?.joinSavingPence ?? 0;
  const total = quote?.totalPence ?? (empty ? 0 : subtotalPence + DELIVERY_PENCE);

  // Place a REAL order: the server re-prices and persists it. With Stripe
  // configured we redirect to Checkout; in local dev it's marked paid and we go
  // straight to the confirmation.
  const placeOrder = async () => {
    if (empty || placing) return;
    setPlacing(true);
    try {
      const res = await placeOrderAction({
        items: items.map((i) => ({ productKey: i.sku ?? i.product, qty: i.qty, ...(i.artwork ? { artwork: i.artwork } : {}) })),
        gift,
      });
      if (!res.ok) {
        toast('hmm, that didn’t go through — try again');
        return;
      }
      clear();
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl; // → Stripe Checkout
        return;
      }
      router.push(`/checkout/confirmation?ref=${res.ref}`);
    } finally {
      setPlacing(false);
    }
  };

  const summaryRows = (
    <dl className="mt-3 space-y-2 text-[13px] text-[#5F564C]">
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
      <div className="flex justify-between">
        <dt>Delivery</dt>
        <dd>{gbp(deliveryPence)}</dd>
      </div>
      <div className="flex justify-between border-t border-[#EDE2CD] pt-2 text-base font-extrabold text-cocoa">
        <dt>Total</dt>
        <dd>{gbp(total)}</dd>
      </div>
    </dl>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-40 md:pb-0">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/home" className="flex items-center gap-3">
          <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58] md:hidden" />
          <span className="hidden font-display text-xl font-semibold text-cocoa md:inline">snickerdoodle</span>
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-[#6F6358]">
          <Icon icon={IconLock} size={14} className="text-green-save" /> secure checkout
        </span>
      </header>

      {empty ? (
        // ── Empty basket ──
        <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F3E8D6]">
            <Icon icon={IconShieldCheck} size={34} className="text-[#C9B79B]" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-cocoa">Your basket&apos;s empty</h1>
          <p className="mt-1.5 max-w-xs text-sm text-[#6F6358]">
            Pop a drawing on something lovely and it&apos;ll show up here.
          </p>
          <Button href="/catalogue" size="lg" className="mt-6">
            see the range →
          </Button>
        </main>
      ) : (
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
            {/* Basket */}
            <div>
              <h1 className="font-display text-xl font-semibold text-cocoa">Your basket</h1>
              <div className="mt-3 space-y-2.5">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[#EADFC9] bg-[#FFFDF8] p-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#FBF5E9]">
                      <ProductArt product={item.product} size={44} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-cocoa">{item.name}</div>
                      {item.sub ? <div className="text-[11px] text-[#9C8E7E]">{item.sub}</div> : null}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex items-center rounded-full border border-[#E6D8BE] bg-white">
                          <button type="button" aria-label="one fewer" onClick={() => setQty(item.id, item.qty - 1)} className="px-2 py-0.5 text-[#7A6A58]">
                            <Icon icon={IconMinus} size={12} />
                          </button>
                          <span className="min-w-4 text-center text-xs font-bold text-cocoa">{item.qty}</span>
                          <button type="button" aria-label="one more" onClick={() => setQty(item.id, item.qty + 1)} className="px-2 py-0.5 text-cinnamon">
                            <Icon icon={IconPlus} size={12} />
                          </button>
                        </div>
                        <button type="button" onClick={() => router.push(`/customize/${item.product}`)} className="rounded-full border border-[#E6D8BE] bg-white px-2.5 py-0.5 text-[11px] font-bold text-cocoa hover:border-honey">
                          customize
                        </button>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-cocoa">{gift ? 'gift' : gbp(item.pricePence * item.qty)}</div>
                      <button type="button" onClick={() => remove(item.id)} className="text-[11px] text-[#B3A491] hover:text-berry">remove</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Gift fork */}
              <div className="mt-3 rounded-2xl border border-dashed border-[#E2A86C] bg-[#FBEFE0] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold text-cocoa">
                    <Icon icon={IconGift} size={16} className="text-cinnamon" /> Sending this as a gift?
                  </span>
                  <Toggle on={gift} onChange={setGift} label="Send as a gift" />
                </div>
                {gift ? (
                  <div className="mt-2.5">
                    <p className="text-[11px] leading-relaxed text-[#8A6F52]">
                      We&apos;ll wrap it and tuck the prices away, so the only surprise is the lovely one.
                    </p>
                    <textarea
                      placeholder="add a little note (optional)"
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-2 text-xs text-cocoa placeholder:text-[#A89B8C]"
                    />
                  </div>
                ) : null}
                <Link href="/home" className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-cinnamon">
                  <Icon icon={IconHeart} size={13} /> or add to a wishlist to share with family →
                </Link>
              </div>

              {/* Add-ons */}
              <p className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Add a little something</p>
              <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1">
                {ADDONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      add({ id: a.id, name: a.name, product: a.product, pricePence: a.pricePence });
                      toast(`${a.name} added`);
                    }}
                    className="flex w-24 shrink-0 flex-col items-center rounded-xl border border-[#EFE6D6] bg-white p-2.5 text-center hover:border-honey"
                  >
                    <ProductArt product={a.product} size={40} />
                    <span className="mt-1 text-[11px] font-bold text-cocoa">{a.name}</span>
                    <span className="text-[11px] text-[#9C8E7E]">{gbp(a.pricePence)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Order summary (desktop) */}
            <aside className="hidden self-start md:block">
              <div className="rounded-2xl border border-[#EADFC9] bg-white p-4">
                <h2 className="font-display text-base font-semibold text-cocoa">Order summary</h2>
                {summaryRows}
                <label htmlFor="email-d" className="mt-4 block text-[11px] font-bold text-[#6F6358]">
                  email for your receipt
                </label>
                <input
                  id="email-d"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-2.5 text-xs text-cocoa placeholder:text-[#A89B8C]"
                />
                <Button size="lg" className="mt-3 w-full" onClick={placeOrder} disabled={placing}>
                  {placing ? 'placing your order…' : 'checkout'}
                </Button>
                <p className="mt-3 text-center text-[11px] text-[#7A6A58]">
                  <b>No account needed.</b> Checkout as a guest — or{' '}
                  <Link href="/login" className="font-bold text-cinnamon">
                    log in
                  </Link>
                  .
                </p>
                <p className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#EAF1E4] px-2 py-2 text-[11px] text-green-save">
                  <Icon icon={IconShieldCheck} size={14} /> Your data is yours. Nothing shared, ever.
                </p>
              </div>
            </aside>
          </div>
        </main>
      )}

      {/* Mobile pinned total + checkout */}
      {!empty ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EFE6D6] bg-oat px-4 pb-5 pt-3 md:hidden">
          <div className="mb-2 flex items-end justify-between">
            <span className="text-[13px] text-[#6F6358]">
              Total <span className="text-[11px] text-[#9C8E7E]">incl. delivery</span>
            </span>
            <span className="text-base font-extrabold text-cocoa">{gbp(total)}</span>
          </div>
          <Button size="lg" className="w-full" onClick={placeOrder} disabled={placing}>
            {placing ? 'placing…' : 'checkout'}
          </Button>
          <p className="mt-2 text-center text-[11px] text-[#7A6A58]">
            <b>No account needed</b> — guest checkout, perfect for grandparents
          </p>
        </div>
      ) : null}
    </div>
  );
}
