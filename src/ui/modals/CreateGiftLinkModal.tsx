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
  IconUsersPlus,
} from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { Toggle } from '@/ui/primitives/Toggle';
import { cn } from '@/ui/cn';
import { toast } from '@/lib/store';
import { createGiftLinkAction } from '@/app/actions/giftLink';

export interface GiftKeepsake {
  id: string;
  imageUrl: string | null;
}

const SHARE_MSG = 'A little gift list for you 🎁';
const SHARE: { label: string; icon: TablerIconComponent; href: (u: string) => string | null }[] = [
  { label: 'WhatsApp', icon: IconBrandWhatsapp, href: (u) => `https://wa.me/?text=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'Email', icon: IconMail, href: (u) => `mailto:?subject=${encodeURIComponent(SHARE_MSG)}&body=${encodeURIComponent(`${SHARE_MSG}\n\n${u}`)}` },
  { label: 'Text', icon: IconMessage, href: (u) => `sms:?&body=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'More', icon: IconDots, href: () => null },
];

export function CreateGiftLinkModal({
  open,
  onClose,
  keepsakes,
}: {
  open: boolean;
  onClose: () => void;
  keepsakes: GiftKeepsake[];
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fullUrl = url ? `${typeof window !== 'undefined' ? window.location.origin : ''}${url}` : '';

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = () => {
    if (picked.length === 0) {
      toast('pick at least one keepsake to share');
      return;
    }
    if (invite && !email.trim()) {
      toast('add their email to invite them');
      return;
    }
    startTransition(async () => {
      const res = await createGiftLinkAction({
        assetIds: picked,
        invite: invite && email.trim() ? { email: email.trim(), relationship: 'CLOSE_FRIEND', accessLevel: 'VIEW_BUY' } : null,
      });
      if (res.needsAuth) return toast('log in to share a gift link');
      if (!res.ok || !res.url) return toast('couldn’t create that link — try again');
      setUrl(res.url);
      toast('your gift link is ready ✦');
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
    setPicked([]);
    setInvite(false);
    setEmail('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create a gift link"
      subtitle="share a ready-to-buy cart"
      footer={
        url ? (
          <Button size="lg" className="w-full" onClick={close}>
            done
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={create} disabled={pending}>
            {pending ? 'creating…' : 'create & share link'}
          </Button>
        )
      }
    >
      {url ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-[#E6D8BE] bg-[#F6F0E4] px-3 py-2.5">
            <Icon icon={IconLink} size={15} className="shrink-0 text-[#9C8E7E]" />
            <span className="flex-1 truncate text-xs text-[#6F6358]">{fullUrl.replace(/^https?:\/\//, '')}</span>
            <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-cinnamon">
              <Icon icon={copied ? IconCheck : IconCopy} size={13} /> {copied ? 'copied' : 'copy'}
            </button>
          </div>
          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {SHARE.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => share(s.label, s.href(fullUrl))}
                className="flex flex-col items-center gap-1 rounded-lg border border-[#EFE6D6] bg-[#FBF8F1] py-2 text-[11px] font-semibold text-[#7A6A58] hover:border-honey"
              >
                <Icon icon={s.icon} size={17} className="text-cinnamon" />
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-green-save">
            <Icon icon={IconGift} size={13} /> Private &amp; unguessable. Revoke it any time from your keepsakes.
          </p>
        </>
      ) : keepsakes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] p-5 text-center text-sm text-[#6F6358]">
          Keep a drawing in your keepsake home first — then you can share it as a ready-to-buy gift.
        </div>
      ) : (
        <>
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Which keepsakes?</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {keepsakes.map((k) => {
              const on = picked.includes(k.id);
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(k.id)}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-xl border-2 bg-[#FFFDF8]',
                    on ? 'border-cinnamon' : 'border-[#EFE6D6]',
                  )}
                >
                  {k.imageUrl ? (
                    <img src={k.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[#C9B79B]">
                      <Icon icon={IconGift} size={20} />
                    </span>
                  )}
                  {on ? (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-cinnamon text-cta-text">
                      <Icon icon={IconCheck} size={13} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="my-3.5 rounded-xl border border-[#F0CF9C] bg-honey-band p-3">
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
                  className="mt-2.5 w-full rounded-lg border border-[#E6CCA6] bg-[#FFFDF8] px-3 py-2.5 text-xs text-cocoa placeholder:text-[#A89B8C]"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-[#8A6F52]">
                  They&apos;ll get 5% off and join your Extended circle once they verify it&apos;s them.
                </p>
              </>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  );
}
