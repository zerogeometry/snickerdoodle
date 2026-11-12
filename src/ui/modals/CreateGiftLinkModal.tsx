'use client';

import {
  IconBrandWhatsapp,
  IconCheck,
  IconCopy,
  IconDots,
  IconGift,
  IconLink,
  IconMail,
  IconMessage,
  IconPlus,
  IconSend,
  IconUsersPlus,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Chip } from '@/ui/primitives/Chip';
import type { AccessLevel, Circle, Relationship, VisibilityTier } from '@/domain/types';
import { circleSees } from '@/authz/tiers';
import { defaultCircleFor } from '@/domain/relationships';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { isChristmasSeason } from '@/lib/season';
import { useNow } from '@/ui/useNow';
import { Toggle } from '@/ui/primitives/Toggle';
import { cn } from '@/ui/cn';
import { gbp, toast } from '@/lib/store';
import { createOpenGiftLinkAction, sendGiftLinksAction } from '@/app/actions/giftLink';

/**
 * "Create a gift request" (D27, founder 10 Nov 2026: ONE LINK PER PERSON). Pick what they could give → pick the
 * people → each gets their OWN link, sent only to them, showing only what their circle may see (the server decides;
 * the sheet just says so up front: "Granny will see 2 of 4"). Or copy one open link to share yourself, for a circle
 * you pick (extended unless you say otherwise — founder answer C).
 */

export interface GiftKeepsake {
  id: string;
  imageUrl: string | null;
  /** who sees it now */
  visibility: VisibilityTier;
}

/** A "+ Keepsake" saved design: a drawing on an exact product, ready to request. */
export interface GiftDesign {
  id: string;
  label: string;
  pricePence: number;
  imageUrl: string | null;
  assetId: string;
  visibility: VisibilityTier;
}

/** Someone already in the family the request can be sent to. */
export interface GiftRecipient {
  accountId: string;
  name: string;
  /** their circle (the leader counts as home) */
  circle: Circle;
}

const SHARE_MSG = 'A little gift request for you 🎁';

/** What a plain drawing can be bought as (the server re-validates against the live shop). */
const GIFT_PRODUCTS: { key: string; label: string }[] = [
  { key: 'framedPrint', label: 'framed print' },
  { key: 'mug', label: 'mug' },
  { key: 'cushion', label: 'cushion' },
  { key: 'jigsaw', label: 'jigsaw' },
  { key: 'blanket', label: 'blanket' },
];

/** Someone new's relationship sets the circle their link (and invite) is for — same as add-member. */
const INVITE_RELS: { label: string; value: Relationship }[] = [
  { label: 'Grandparent', value: 'GRANDPARENT' },
  { label: 'Parent', value: 'PARENT' },
  { label: 'Grown-up child', value: 'ADULT_CHILD' },
  { label: 'Aunt / uncle', value: 'AUNT_UNCLE' },
  { label: 'Close friend', value: 'CLOSE_FRIEND' },
  { label: 'Other', value: 'OTHER' },
];
const CIRCLE_WORD: Record<Circle, string> = { HOME: 'home', FAMILY: 'family', EXTENDED: 'extended' };
const OPEN_CIRCLES: { value: Circle; label: string }[] = [
  { value: 'HOME', label: 'home' },
  { value: 'FAMILY', label: 'family' },
  { value: 'EXTENDED', label: 'extended family' },
];
const SHARE: { label: string; icon: TablerIconComponent; href: (u: string) => string | null }[] = [
  { label: 'WhatsApp', icon: IconBrandWhatsapp, href: (u) => `https://wa.me/?text=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'Email', icon: IconMail, href: (u) => `mailto:?subject=${encodeURIComponent(SHARE_MSG)}&body=${encodeURIComponent(`${SHARE_MSG}\n\n${u}`)}` },
  { label: 'Text', icon: IconMessage, href: (u) => `sms:?&body=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'More', icon: IconDots, href: () => null },
];
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const LAB = 'mb-2 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint';

function PickTile({ on, onClick, imageUrl, caption }: { on: boolean; onClick: () => void; imageUrl: string | null; caption?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="wiggle text-left">
      <span className={cn('relative block aspect-square overflow-hidden rounded-xl border-2 bg-paper', on ? 'border-cta' : 'border-line')}>
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-line">
            <Icon icon={IconGift} size={20} />
          </span>
        )}
        {on ? (
          <span className="pop-in absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-cta text-cta-text">
            <Icon icon={IconCheck} size={14} />
          </span>
        ) : null}
      </span>
      {caption ? <span className="mt-1 block text-[11px] font-bold leading-tight text-cocoa">{caption}</span> : null}
    </button>
  );
}

/** "sees 2 of 4" — what this person's link will show (the server applies the same rule). */
function SeesLine({ sees, of }: { sees: number; of: number }) {
  if (sees === of) return null;
  return (
    <span className={cn('block text-[11px] font-semibold', sees === 0 ? 'text-cinnamon' : 'text-ink-soft')}>
      {sees === 0 ? 'won’t see any of these — they’re kept closer to home' : `will see ${sees} of ${of} — the rest are kept closer to home`}
    </span>
  );
}

export function CreateGiftLinkModal({
  open,
  onClose,
  keepsakes,
  designs = [],
  recipients = [],
}: {
  open: boolean;
  onClose: () => void;
  keepsakes: GiftKeepsake[];
  designs?: GiftDesign[];
  recipients?: GiftRecipient[];
}) {
  const [step, setStep] = useState<'pick' | 'who' | 'sent'>('pick');
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedDesigns, setPickedDesigns] = useState<string[]>([]);
  const [productKey, setProductKey] = useState('framedPrint');
  // step 2 — who it's for (one link each)
  const [sendTo, setSendTo] = useState<string[]>([]);
  const [people, setPeople] = useState<{ email: string; rel: Relationship }[]>([]);
  const [email, setEmail] = useState('');
  const [rel, setRel] = useState<Relationship>('GRANDPARENT');
  const [invite, setInvite] = useState(false);
  const [access, setAccess] = useState<AccessLevel>('VIEW_BUY');
  // "also invite": the family calendar starts unticked here too (founder, 10 Nov 2026).
  const [shareCalendar, setShareCalendar] = useState(false);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ sent: number; skipped: string[] } | null>(null);
  // or: one open link to share yourself
  const [openCircle, setOpenCircle] = useState<Circle>('EXTENDED');
  const [showOpen, setShowOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  // Pre-check what's most likely wanted: every saved design, else the newest drawing.
  useEffect(() => {
    if (!open) return;
    if (designs.length > 0 && pickedDesigns.length === 0 && picked.length === 0) setPickedDesigns(designs.map((d) => d.id));
    else if (designs.length === 0 && picked.length === 0 && keepsakes[0]) setPicked([keepsakes[0].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fullUrl = url ? `${typeof window !== 'undefined' ? window.location.origin : ''}${url}` : '';
  // functional update: two quick taps never undo each other
  const toggleIn = (_list: string[], set: (fn: (prev: string[]) => string[]) => void, id: string) => set((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // the tiers of what's picked — to say, before sending, what each person's link will show
  const pickedTiers = useMemo(
    () => [...keepsakes.filter((k) => picked.includes(k.id)).map((k) => k.visibility), ...designs.filter((d) => pickedDesigns.includes(d.id)).map((d) => d.visibility)],
    [keepsakes, designs, picked, pickedDesigns],
  );
  const seesFor = (c: Circle) => pickedTiers.filter((t) => circleSees(c, t)).length;
  const newPersonCircle = (r: Relationship): Circle => (invite ? defaultCircleFor(r) : 'EXTENDED');

  const next = () => {
    if (picked.length === 0 && pickedDesigns.length === 0) return toast('pick at least one thing they could give');
    setStep('who');
  };

  const addPerson = () => {
    const v = email.trim().toLowerCase();
    if (!isEmail(v)) return toast('that email doesn’t look quite right');
    if (people.some((p) => p.email === v)) return setEmail('');
    setPeople([...people, { email: v, rel }]);
    setEmail('');
  };

  const send = () => {
    const typed = email.trim() && isEmail(email) ? [{ email: email.trim().toLowerCase(), rel }] : [];
    const all = [...people, ...typed.filter((t) => !people.some((p) => p.email === t.email))];
    if (sendTo.length === 0 && all.length === 0) return toast('pick someone to send it to');
    startTransition(async () => {
      const res = await sendGiftLinksAction({
        assetIds: picked,
        designIds: pickedDesigns,
        productKey,
        memberAccountIds: sendTo,
        people: all.map((p) => ({ email: p.email, relationship: invite ? p.rel : null })),
        invite: invite ? { accessLevel: access, shareOccasions: shareCalendar } : null,
        note,
      });
      if (!res.ok && !res.skipped?.length) return toast('couldn’t send that — check the email addresses');
      setResult({ sent: res.sent ?? 0, skipped: res.skipped ?? [] });
      setStep('sent');
    });
  };

  const makeOpen = () =>
    startTransition(async () => {
      const res = await createOpenGiftLinkAction({ assetIds: picked, designIds: pickedDesigns, productKey, circle: openCircle });
      if (res.needsAuth) return toast('log in to create a gift request');
      if (res.reason === 'too-private') return toast(`none of these are shared with your ${CIRCLE_WORD[openCircle]} yet`);
      if (!res.ok || !res.url) return toast('couldn’t create that — try again');
      setUrl(res.url);
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast('link copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('press and hold to copy the link');
    }
  };
  const share = async (label: string, href: string | null) => {
    if (label === 'More') {
      if (navigator.share) await navigator.share({ title: SHARE_MSG, url: fullUrl }).catch(() => {});
      else copy();
      return;
    }
    if (href) window.open(href, '_blank', 'noopener');
  };

  const close = () => {
    setStep('pick');
    setUrl(null);
    setPicked([]);
    setPickedDesigns([]);
    setSendTo([]);
    setPeople([]);
    setEmail('');
    setInvite(false);
    setNote('');
    setResult(null);
    setShowOpen(false);
    setOpenCircle('EXTENDED');
    onClose();
  };

  const nothingToPick = keepsakes.length === 0 && designs.length === 0;
  const howMany = sendTo.length + people.length + (email.trim() && isEmail(email) && !people.some((p) => p.email === email.trim().toLowerCase()) ? 1 : 0);
  // Christmas (D24): the same gift link, framed for the season.
  const now = useNow();
  const christmas = now !== null && isChristmasSeason(now);
  const nameOf = (id: string) => recipients.find((r) => r.accountId === id)?.name ?? id;

  return (
    <Modal
      open={open}
      onClose={close}
      title={christmas ? 'Send it to the grandparents for christmas' : 'Create a gift request'}
      subtitle={step === 'pick' ? 'pick what you’d love them to give' : step === 'who' ? 'who’s it for? each person gets their own link' : 'on its way ✦'}
      footer={
        step === 'sent' ? (
          <Button size="lg" className="w-full" onClick={close}>
            done
          </Button>
        ) : step === 'who' ? (
          url ? null : (
            <Button size="lg" className="w-full" onClick={send} disabled={pending}>
              <Icon icon={IconSend} size={16} /> {pending ? 'sending…' : howMany > 1 ? `send ${howMany} links` : 'send their link'}
            </Button>
          )
        ) : nothingToPick ? null : (
          <Button size="lg" className="w-full" onClick={next}>
            next: who’s it for?
          </Button>
        )
      }
    >
      {step === 'sent' && result ? (
        <div className="text-center">
          <p className="font-display text-xl text-cocoa">{result.sent === 1 ? 'sent to 1 person' : `sent to ${result.sent} people`}</p>
          <p className="mt-2 text-sm text-ink-soft">
            each has their own link, just for them. it ticks itself off as things are bought, and you can switch any one off from your keepsake home.
          </p>
          {result.skipped.length ? (
            <p className="mt-3 rounded-lg border-2 border-dashed border-cocoa/20 bg-paper-2 px-3 py-2 text-left text-[12px] text-cocoa">
              not sent to {result.skipped.map(nameOf).join(', ')}: everything you picked is kept closer to home than their circle.
            </p>
          ) : null}
        </div>
      ) : step === 'who' ? (
        url ? (
          <>
            <p className="mb-2 text-[12px] text-ink-soft">
              anyone with this link sees only what your <b>{CIRCLE_WORD[openCircle]}</b> can see, for 14 days — you can switch it off sooner from your keepsake home.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-paper-2 px-3 py-2.5">
              <Icon icon={IconLink} size={15} className="shrink-0 text-ink-faint" />
              <span className="flex-1 truncate text-xs text-ink-soft">{fullUrl.replace(/^https?:\/\//, '')}</span>
              <button type="button" onClick={copy} className="flex min-h-11 shrink-0 items-center gap-1 px-1 text-[12px] font-bold text-cinnamon">
                <Icon icon={copied ? IconCheck : IconCopy} size={13} /> {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2">
              {SHARE.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => share(s.label, s.href(fullUrl))}
                  className="press flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-line bg-paper-2 text-[11px] font-semibold text-ink-soft"
                >
                  <Icon icon={s.icon} size={17} className="text-cinnamon" />
                  {s.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="md" className="mt-4 w-full" onClick={close}>
              done
            </Button>
          </>
        ) : (
          <>
            {recipients.length > 0 ? (
              <>
                <p className={LAB}>family members</p>
                <div className="space-y-1.5" role="group" aria-label="family members to send it to">
                  {recipients.map((r) => {
                    const on = sendTo.includes(r.accountId);
                    return (
                      <button
                        key={r.accountId}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleIn(sendTo, setSendTo, r.accountId)}
                        className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-xl border-[1.5px] px-3 py-2 text-left', on ? 'border-cinnamon bg-paper-2' : 'border-line')}
                      >
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-cinnamon bg-cinnamon text-paper' : 'border-line')}>
                          {on ? <Icon icon={IconCheck} size={12} /> : null}
                        </span>
                        <span className="flex-1">
                          <span className="block text-[13px] font-bold text-cocoa">
                            {r.name} <span className="font-semibold text-ink-faint">· {CIRCLE_WORD[r.circle]}</span>
                          </span>
                          <SeesLine sees={seesFor(r.circle)} of={pickedTiers.length} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <p className={cn(LAB, 'mt-4')}>{recipients.length > 0 ? 'someone new (email)' : 'send it to (email)'}</p>
            {people.length ? (
              <ul className="mb-2 space-y-1.5">
                {people.map((p) => (
                  <li key={p.email} className="flex items-center gap-2 rounded-xl border border-line bg-paper-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-cocoa">
                        {p.email} <span className="font-semibold text-ink-faint">· {CIRCLE_WORD[newPersonCircle(p.rel)]}</span>
                      </span>
                      <SeesLine sees={seesFor(newPersonCircle(p.rel))} of={pickedTiers.length} />
                    </span>
                    <button type="button" aria-label={`remove ${p.email}`} onClick={() => setPeople(people.filter((x) => x.email !== p.email))} className="flex h-11 w-11 items-center justify-center text-ink-soft">
                      <Icon icon={IconX} size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => (e.key === 'Enter' ? (e.preventDefault(), addPerson()) : null)}
                aria-label="their email"
                placeholder="granny@example.com"
                className="min-h-11 w-full rounded-lg border-2 border-line bg-paper px-3 text-sm text-cocoa placeholder:text-ink-faint"
              />
              <Button variant="secondary" size="md" onClick={addPerson} aria-label="add another person">
                <Icon icon={IconPlus} size={15} />
              </Button>
            </div>
            {invite ? (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="how they’re related">
                {INVITE_RELS.map((r) => (
                  <Chip key={r.value} active={rel === r.value} onClick={() => setRel(r.value)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-ink-soft">someone not in the family yet sees what you share with extended family.</p>
            )}

            <div className="my-3.5 rounded-xl border border-sunshine bg-honey-band p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-cocoa">
                  <Icon icon={IconUsersPlus} size={15} className="text-cinnamon" /> Also invite them to join the family
                </span>
                <Toggle on={invite} onChange={setInvite} label="Also invite them to join the family" />
              </div>
              {invite ? (
                <>
                  <label className="mt-2.5 flex items-center justify-between gap-2 text-xs text-cocoa">
                    They can
                    <select value={access} onChange={(e) => setAccess(e.target.value as AccessLevel)} className="min-h-[44px] rounded-lg border border-line bg-paper px-2 text-xs font-bold text-cocoa">
                      <option value="VIEW">view only</option>
                      <option value="VIEW_BUY">view &amp; buy</option>
                      <option value="CONTRIBUTE">view, buy &amp; add</option>
                    </select>
                  </label>
                  <label className="mt-2.5 flex min-h-[44px] items-start gap-2.5 text-xs text-cocoa">
                    <input type="checkbox" checked={shareCalendar} onChange={(e) => setShareCalendar(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-cta" />
                    <span>
                      <b>share the family calendar</b>
                      <span className="block text-[11px] text-ink-soft">they&apos;ll see your little ones&apos; birthdays coming up, so they never miss one. change it any time.</span>
                    </span>
                  </label>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                    Each gets their own invite, only to their own address: 5% off, and they join the circle their relationship gives them once they say yes.
                  </p>
                </>
              ) : null}
            </div>

            <label className="block">
              <span className={LAB}>a little note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={40}
                placeholder="for Mia's 5th ✦"
                className="min-h-11 w-full rounded-lg border-2 border-line bg-paper px-3 text-sm text-cocoa placeholder:text-ink-faint"
              />
            </label>

            <div className="mt-4 border-t border-line pt-3">
              {showOpen ? (
                <>
                  <p className={LAB}>or copy a link yourself — who&apos;s it for?</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="who the link is for">
                    {OPEN_CIRCLES.map((c) => (
                      <Chip key={c.value} active={openCircle === c.value} onClick={() => setOpenCircle(c.value)}>
                        {c.label}
                      </Chip>
                    ))}
                  </div>
                  <SeesLine sees={seesFor(openCircle)} of={pickedTiers.length} />
                  <Button variant="secondary" size="md" className="mt-2.5 w-full" onClick={makeOpen} disabled={pending || seesFor(openCircle) === 0}>
                    <Icon icon={IconLink} size={15} /> make the link
                  </Button>
                </>
              ) : (
                <button type="button" onClick={() => setShowOpen(true)} className="flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-cinnamon">
                  <Icon icon={IconLink} size={15} /> or copy a link to share yourself
                </button>
              )}
            </div>
          </>
        )
      ) : nothingToPick ? (
        <div className="rounded-xl border border-dashed border-line bg-paper-2 p-5 text-center text-sm text-ink-soft">
          Tap <b>+ keepsake</b> on anything you design, or keep a drawing — then you can ask the family for it.
        </div>
      ) : (
        <>
          {designs.length > 0 ? (
            <>
              <p className={LAB}>Saved for later</p>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {designs.map((d) => (
                  <PickTile key={d.id} on={pickedDesigns.includes(d.id)} onClick={() => toggleIn(pickedDesigns, setPickedDesigns, d.id)} imageUrl={d.imageUrl} caption={`${d.label} · ${gbp(d.pricePence)}`} />
                ))}
              </div>
            </>
          ) : null}

          {keepsakes.length > 0 ? (
            <>
              <p className={cn(LAB, 'mt-4')}>{designs.length > 0 ? 'Or any drawing' : 'Which drawings?'}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {keepsakes.map((k) => (
                  <PickTile key={k.id} on={picked.includes(k.id)} onClick={() => toggleIn(picked, setPicked, k.id)} imageUrl={k.imageUrl} />
                ))}
              </div>
              {picked.length > 0 ? (
                <>
                  <p className="mb-2 mt-3.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Drawings as a…</p>
                  <div className="flex flex-wrap gap-1.5">
                    {GIFT_PRODUCTS.map((p) => (
                      <Chip key={p.key} active={productKey === p.key} onClick={() => setProductKey(p.key)}>
                        {p.label}
                      </Chip>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : null}
          <p className="mt-3.5 flex items-center gap-1.5 text-[12px] text-green-save">
            <Icon icon={IconGift} size={13} /> Each person gets their own private link, showing only what their circle can see.
          </p>
        </>
      )}
    </Modal>
  );
}
