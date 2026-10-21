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
  IconSend,
  IconUsersPlus,
} from '@tabler/icons-react';
import { useEffect, useState, useTransition } from 'react';
import { Chip } from '@/ui/primitives/Chip';
import type { AccessLevel, Relationship } from '@/domain/types';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { Toggle } from '@/ui/primitives/Toggle';
import { cn } from '@/ui/cn';
import { gbp, toast } from '@/lib/store';
import { createGiftLinkAction, sendGiftRequestAction } from '@/app/actions/giftLink';

export interface GiftKeepsake {
  id: string;
  imageUrl: string | null;
}

/** A "+ Keepsake" saved design: a drawing on an exact product, ready to request. */
export interface GiftDesign {
  id: string;
  label: string;
  pricePence: number;
  imageUrl: string | null;
}

/** Someone already in the family the request can be sent to. */
export interface GiftRecipient {
  accountId: string;
  name: string;
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

/** The invitee's relationship sets their circle (derived server-side) — same as add-member. */
const INVITE_RELS: { label: string; value: Relationship; circle: string }[] = [
  { label: 'Grandparent', value: 'GRANDPARENT', circle: 'Extended' },
  { label: 'Parent', value: 'PARENT', circle: 'Family' },
  { label: 'Aunt / uncle', value: 'AUNT_UNCLE', circle: 'Extended' },
  { label: 'Close friend', value: 'CLOSE_FRIEND', circle: 'Extended' },
  { label: 'Other', value: 'OTHER', circle: 'Extended' },
];
const SHARE: { label: string; icon: TablerIconComponent; href: (u: string) => string | null }[] = [
  { label: 'WhatsApp', icon: IconBrandWhatsapp, href: (u) => `https://wa.me/?text=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'Email', icon: IconMail, href: (u) => `mailto:?subject=${encodeURIComponent(SHARE_MSG)}&body=${encodeURIComponent(`${SHARE_MSG}\n\n${u}`)}` },
  { label: 'Text', icon: IconMessage, href: (u) => `sms:?&body=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'More', icon: IconDots, href: () => null },
];

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
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedDesigns, setPickedDesigns] = useState<string[]>([]);
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [productKey, setProductKey] = useState('framedPrint');
  const [rel, setRel] = useState<Relationship>('GRANDPARENT');
  const [access, setAccess] = useState<AccessLevel>('VIEW_BUY');
  const [shareCalendar, setShareCalendar] = useState(true);
  // step 2 — who to send it to
  const [sendTo, setSendTo] = useState<string[]>([]);
  const [sendEmails, setSendEmails] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  // Pre-check what's most likely wanted: every saved design, else the newest drawing.
  useEffect(() => {
    if (!open) return;
    if (designs.length > 0 && pickedDesigns.length === 0 && picked.length === 0) setPickedDesigns(designs.map((d) => d.id));
    else if (designs.length === 0 && picked.length === 0 && keepsakes[0]) setPicked([keepsakes[0].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fullUrl = url ? `${typeof window !== 'undefined' ? window.location.origin : ''}${url}` : '';

  const toggleIn = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const create = () => {
    if (picked.length === 0 && pickedDesigns.length === 0) {
      toast('pick at least one thing they could give');
      return;
    }
    if (invite && !email.trim()) {
      toast('add their email to invite them');
      return;
    }
    startTransition(async () => {
      const res = await createGiftLinkAction({
        assetIds: picked,
        designIds: pickedDesigns,
        productKey,
        invite: invite && email.trim() ? { email: email.trim(), relationship: rel, accessLevel: access, shareOccasions: shareCalendar } : null,
      });
      if (res.needsAuth) return toast('log in to create a gift request');
      if (!res.ok || !res.url) return toast('couldn’t create that — try again');
      setUrl(res.url);
      setLinkId(res.linkId ?? null);
      toast('your gift request is ready ✦');
    });
  };

  const send = () => {
    const emails = sendEmails.split(/[,\s;]+/).map((e) => e.trim()).filter(Boolean);
    if (!linkId || (sendTo.length === 0 && emails.length === 0)) {
      toast('pick someone to send it to');
      return;
    }
    startTransition(async () => {
      const res = await sendGiftRequestAction({ linkId, memberAccountIds: sendTo, emails, note });
      if (!res.ok) return toast('couldn’t send that — check the email addresses');
      setSent(true);
      toast(`sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'} ✦`);
    });
  };

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
    setUrl(null);
    setLinkId(null);
    setPicked([]);
    setPickedDesigns([]);
    setInvite(false);
    setEmail('');
    setSendTo([]);
    setSendEmails('');
    setNote('');
    setSent(false);
    onClose();
  };

  const nothingToPick = keepsakes.length === 0 && designs.length === 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create a gift request"
      subtitle={url ? 'now send it to someone special' : 'pick what you’d love them to give'}
      footer={
        url ? (
          sent ? (
            <Button size="lg" className="w-full" onClick={close}>
              done
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={send} disabled={pending}>
              <Icon icon={IconSend} size={16} /> {pending ? 'sending…' : 'send gift request'}
            </Button>
          )
        ) : nothingToPick ? null : (
          <Button size="lg" className="w-full" onClick={create} disabled={pending}>
            {pending ? 'creating…' : 'create gift request'}
          </Button>
        )
      }
    >
      {url ? (
        <>
          {recipients.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Send it to</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="family members to send it to">
                {recipients.map((r) => (
                  <Chip key={r.accountId} active={sendTo.includes(r.accountId)} onClick={() => toggleIn(sendTo, setSendTo, r.accountId)}>
                    {r.name}
                  </Chip>
                ))}
              </div>
            </>
          ) : null}
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
              {recipients.length > 0 ? 'or anyone else (email)' : 'send it to (email)'}
            </span>
            <input
              type="email"
              multiple
              value={sendEmails}
              onChange={(e) => setSendEmails(e.target.value)}
              placeholder="granny@example.com, uncle@example.com"
              className="min-h-11 w-full rounded-lg border-2 border-line bg-paper px-3 text-sm text-cocoa placeholder:text-ink-faint"
            />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">a little note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={40}
              placeholder="for Mia's 5th ✦"
              className="min-h-11 w-full rounded-lg border-2 border-line bg-paper px-3 text-sm text-cocoa placeholder:text-ink-faint"
            />
          </label>

          <p className="mb-2 mt-4 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">or share the link yourself</p>
          {/* just-in-time: who can see it, and for how long — shown right where the link is shared */}
          <p className="mb-2 text-[12px] text-ink-soft">anyone you send it to can see these drawings for 14 days — you can switch it off sooner from your keepsake home.</p>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper-2 px-3 py-2.5">
            <Icon icon={IconLink} size={15} className="shrink-0 text-ink-faint" />
            <span className="flex-1 truncate text-xs text-ink-soft">{fullUrl.replace(/^https?:\/\//, '')}</span>
            <button type="button" onClick={copy} className="flex min-h-9 shrink-0 items-center gap-1 text-[12px] font-bold text-cinnamon">
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
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-green-save">
            <Icon icon={IconGift} size={13} /> Private &amp; unguessable — ticks itself off as things are bought. Switch it off any time.
          </p>
        </>
      ) : nothingToPick ? (
        <div className="rounded-xl border border-dashed border-line bg-paper-2 p-5 text-center text-sm text-ink-soft">
          Tap <b>+ keepsake</b> on anything you design, or keep a drawing — then you can ask the family for it.
        </div>
      ) : (
        <>
          {designs.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Saved for later</p>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {designs.map((d) => (
                  <PickTile
                    key={d.id}
                    on={pickedDesigns.includes(d.id)}
                    onClick={() => toggleIn(pickedDesigns, setPickedDesigns, d.id)}
                    imageUrl={d.imageUrl}
                    caption={`${d.label} · ${gbp(d.pricePence)}`}
                  />
                ))}
              </div>
            </>
          ) : null}

          {keepsakes.length > 0 ? (
            <>
              <p className="mb-2 mt-4 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
                {designs.length > 0 ? 'Or any drawing' : 'Which drawings?'}
              </p>
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

          <div className="my-3.5 rounded-xl border border-sunshine bg-honey-band p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-cocoa">
                <Icon icon={IconUsersPlus} size={15} className="text-cinnamon" /> Also invite them to join the family
              </span>
              <Toggle on={invite} onChange={setInvite} label="Also invite them to join the family" />
            </div>
            {invite ? (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="their email"
                  className="mt-2.5 min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm text-cocoa placeholder:text-ink-faint"
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="their relationship">
                  {INVITE_RELS.map((r) => (
                    <Chip key={r.value} active={rel === r.value} onClick={() => setRel(r.value)}>
                      {r.label}
                    </Chip>
                  ))}
                </div>
                <label className="mt-2.5 flex items-center justify-between gap-2 text-xs text-cocoa">
                  They can
                  <select
                    value={access}
                    onChange={(e) => setAccess(e.target.value as AccessLevel)}
                    className="min-h-[44px] rounded-lg border border-line bg-paper px-2 text-xs font-bold text-cocoa"
                  >
                    <option value="VIEW">view only</option>
                    <option value="VIEW_BUY">view &amp; buy</option>
                    <option value="CONTRIBUTE">view, buy &amp; add</option>
                  </select>
                </label>
                <label className="mt-2.5 flex min-h-[44px] items-start gap-2.5 text-xs text-cocoa">
                  <input
                    type="checkbox"
                    checked={shareCalendar}
                    onChange={(e) => setShareCalendar(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-cta"
                  />
                  <span>
                    <b>share the family calendar</b>
                    <span className="block text-[11px] text-ink-soft">
                      they&apos;ll see your little ones&apos; birthdays coming up, so they never miss one. change it any time.
                    </span>
                  </span>
                </label>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                  They&apos;ll get 5% off and join your {INVITE_RELS.find((r) => r.value === rel)?.circle} circle once they
                  verify it&apos;s them.
                </p>
              </>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  );
}
