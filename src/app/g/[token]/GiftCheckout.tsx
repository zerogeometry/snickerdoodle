'use client';

import { IconShieldCheck, IconUsersPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { checkoutGiftLinkAction } from '@/app/actions/giftLink';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { ProductArt, type ProductKey } from '@/ui/components/ProductArt';
import { gbp } from '@/lib/store';

interface GiftItem {
  assetId: string;
  productKey: string;
  label: string;
  unitPricePence: number;
  imageUrl: string | null;
  /** Already bought by someone — ticked off (never says who; only the parent sees that). */
  purchased: boolean;
}

export function GiftCheckout({
  token,
  items,
  inviteToken,
  familyName,
  pricing,
  defaultFrom,
}: {
  token: string;
  items: GiftItem[];
  inviteToken: string | null;
  familyName: string | null;
  /** The server's quote for this viewer (incl. a join saving if they joined this family). */
  pricing: { subtotalPence: number; deliveryPence: number; joinSavingPence: number; totalPence: number };
  /** Pre-fills "who's it from?" for a signed-in relative. */
  defaultFrom: string;
}) {
  const [fromName, setFromName] = useState(defaultFrom);
  const remaining = items.filter((i) => !i.purchased);
  const allBought = remaining.length === 0;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  // The gift is bought straight from the link: the server rebuilds the order from the
  // token's frozen snapshot (keepsake + product), so the client never carries the art.
  const toCheckout = () => {
    setProblem(null);
    startTransition(async () => {
      const res = await checkoutGiftLinkAction(token, fromName);
      if (res.ok && res.checkoutUrl) return void (window.location.href = res.checkoutUrl);
      if (res.ok && res.ref) return router.push(`/checkout/confirmation?ref=${encodeURIComponent(res.ref)}`);
      setProblem(
        res.reason === 'all-bought'
          ? 'someone has just bought the last of these — refresh to see the list'
          : res.reason === 'unavailable'
          ? 'this gift list has just been changed by the family — refresh to see the latest'
          : 'something went wrong on our side — please try again in a moment',
      );
    });
  };
  const joined = pricing.joinSavingPence > 0;

  return (
    <div className="grid gap-6 md:grid-cols-[1.35fr_1fr]">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Ready to give</p>
        <div className="mt-2 space-y-2.5">
          {items.map((item) => (
            <div
              key={item.assetId + item.productKey}
              className={'relative flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5' + (item.purchased ? ' opacity-70' : '')}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-oat">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ProductArt product={item.productKey as ProductKey} size={30} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-cocoa">{item.label}</div>
                <div className="text-[11px] text-ink-faint">a keepsake from {familyName ?? 'the family'}</div>
              </div>
              {item.purchased ? (
                <span className="pop-in -rotate-6 rounded-md border-2 border-green-save bg-leaf-pale px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-green-save">
                  already bought ✓
                </span>
              ) : (
                <span className="text-[13px] font-bold text-cocoa">{gbp(item.unitPricePence)}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <aside className="self-start rounded-2xl border border-line bg-white p-4">
        <dl className={allBought ? "hidden" : "space-y-1.5 text-[13px] text-ink-soft"}>
          <div className="flex justify-between">
            <dt>
              {remaining.length} {remaining.length === 1 ? 'gift' : 'gifts'}
            </dt>
            <dd>{gbp(pricing.subtotalPence)}</dd>
          </div>
          {joined ? (
            <div className="flex justify-between font-semibold text-green-save">
              <dt>Family saving</dt>
              <dd>−{gbp(pricing.joinSavingPence)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt>Delivery</dt>
            <dd>{pricing.deliveryPence === 0 ? <span className="font-semibold text-green-save">Free</span> : gbp(pricing.deliveryPence)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 text-[15px] font-extrabold text-cocoa">
            <dt>Total</dt>
            <dd>{gbp(pricing.totalPence)}</dd>
          </div>
        </dl>

        {allBought ? (
          <div className="mt-3 rounded-xl border-2 border-green-save bg-leaf-pale p-4 text-center">
            <p className="font-display text-lg text-cocoa">everything&apos;s been bought!</p>
            <p className="mt-1 text-[13px] text-ink-soft">lucky them — the whole list is ticked off. thank you for thinking of them.</p>
          </div>
        ) : (
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">who&apos;s it from?</span>
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              maxLength={40}
              placeholder="e.g. Granny & Grandad"
              className="min-h-11 w-full rounded-lg border-2 border-line bg-paper px-3 text-[14px] text-cocoa placeholder:text-ink-faint"
            />
            <span className="mt-1.5 block text-[12px] leading-snug text-ink-soft">
              we&apos;ll let the family know it&apos;s from you and tick it off their list — so nobody doubles up.
            </span>
          </label>
        )}

        {!allBought && inviteToken ? (
          <div className="mt-3 rounded-xl border border-sunshine bg-honey-band p-3 text-center">
            <span className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-ink-soft">
              <Icon icon={IconUsersPlus} size={14} className="text-cinnamon" /> Invited to join the family
            </span>
            <Button href={`/join/${inviteToken}?next=${encodeURIComponent(`/g/${token}`)}`} size="md" className="mt-2 w-full">
              join the family · 5% off
            </Button>
            <p className="mt-1.5 text-[11px] text-ink-faint">then check out with your saving applied</p>
            <p className="my-2.5 text-[11px] text-ink-faint">— or —</p>
          </div>
        ) : null}

        {joined ? (
          <p className="mt-3 rounded-xl bg-leaf-pale px-3 py-2 text-center text-[12px] font-semibold text-green-save">
            welcome to the family — your 5% is applied
          </p>
        ) : null}
        {allBought ? null : (
        <Button
          variant={inviteToken ? 'secondary' : 'primary'}
          size="lg"
          className="mt-3 w-full"
          onClick={toCheckout}
          disabled={pending}
        >
          {pending ? 'one moment…' : joined ? 'checkout' : 'checkout as guest'}
        </Button>
        )}
        {problem ? (
          <p role="alert" className="mt-2 rounded-lg border border-berry bg-berry-pale px-3 py-2 text-center text-[12px] font-semibold text-cocoa">
            {problem}
          </p>
        ) : null}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-green-save">
          <Icon icon={IconShieldCheck} size={13} /> Secure — your details are never shared.
        </p>
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          <Link href="/" className="hover:text-cinnamon">
            about snickerdoodle
          </Link>
        </p>
      </aside>
    </div>
  );
}
