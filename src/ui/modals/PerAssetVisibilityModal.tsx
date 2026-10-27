'use client';

import { IconHomeHeart, IconLock, IconShieldCheck, IconTrash, IconUser, IconUsers } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { cn } from '@/ui/cn';

type Tier = 'ONLY_ME' | 'FAMILY' | 'EXTENDED';
type Who = { label: string; color: string; textColor?: string };

const OPTIONS: {
  tier: Tier;
  icon: TablerIconComponent;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  who: 'lock' | 'FAMILY' | 'EXTENDED';
}[] = [
  { tier: 'ONLY_ME', icon: IconLock, iconBg: '#EFE6D6', iconColor: '#7A6A58', title: 'Only me', desc: 'Private to you — no one else sees it', who: 'lock' },
  { tier: 'FAMILY', icon: IconHomeHeart, iconBg: '#FBE4DA', iconColor: '#C8623A', title: 'Family', desc: 'Your core household', who: 'FAMILY' },
  {
    tier: 'EXTENDED',
    icon: IconUsers,
    iconBg: '#E8F0DF',
    iconColor: '#5C8A3F',
    title: 'Extended family',
    desc: 'Everyone in your circle, incl. grandparents',
    who: 'EXTENDED',
  },
];

/** Another member of the family, as the "who's included" stack shows them. */
export interface VisibilityPerson {
  initial: string;
  circle: 'FAMILY' | 'EXTENDED';
}

const STACK_COLORS = ['#93B97C', '#84BBD0', '#F2A640', '#E8786E'];

/** The REAL people a tier reaches (a FAMILY-circle member sees Family + Extended; an
 * Extended-circle member sees only Extended) — never placeholder faces (NN1: show the
 * parent exactly who a choice exposes their child's art to). */
function whoFor(tier: 'FAMILY' | 'EXTENDED', people: VisibilityPerson[]): Who[] {
  const reached = tier === 'FAMILY' ? people.filter((p) => p.circle === 'FAMILY') : people;
  const shown: Who[] = reached.slice(0, 3).map((p, i) => ({
    label: p.initial,
    color: STACK_COLORS[i % STACK_COLORS.length]!,
    textColor: STACK_COLORS[i % STACK_COLORS.length] === '#F2A640' ? '#3A2E1E' : undefined,
  }));
  if (reached.length > 3) shown.push({ label: `+${reached.length - 3}`, color: '#E8786E' });
  return shown;
}

function WhoStack({ who }: { who: Who[] | 'lock' }) {
  if (who !== 'lock' && who.length === 0) {
    return <span className="text-[11px] text-ink-faint">no one else yet</span>;
  }
  if (who === 'lock') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-line text-ink-faint">
        <Icon icon={IconUser} size={13} />
      </span>
    );
  }
  return (
    <div className="flex">
      {who.map((w, i) => (
        <span
          key={w.label}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-paper font-display text-[10px] font-bold"
          style={{ background: w.color, color: w.textColor ?? '#FFF6E9', marginLeft: i === 0 ? 0 : -6 }}
        >
          {w.label}
        </span>
      ))}
    </div>
  );
}

export function PerAssetVisibilityModal({
  open,
  name,
  image,
  tier: initialTier,
  onClose,
  onSave,
  onDelete,
  people = [],
  extra,
}: {
  open: boolean;
  name: string;
  image?: string;
  tier: Tier;
  onClose: () => void;
  onSave: (tier: Tier) => void;
  /** When provided, shows a two-tap "delete this keepsake" control (NN8). */
  onDelete?: () => void;
  /** The family's OTHER members (not the viewer) — drives the real "who's included". */
  people?: VisibilityPerson[];
  /** Anything else this keepsake can do here (e.g. the Studio's "make a copy"), above delete. */
  extra?: ReactNode;
}) {
  const [tier, setTier] = useState<Tier>(initialTier);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reflect the keepsake that was actually tapped each time the modal opens.
  useEffect(() => {
    if (open) {
      setTier(initialTier);
      setConfirmDelete(false);
    }
  }, [open, initialTier, name]);

  const thumb = image ? (
    <img src={image} alt="" className="h-[46px] w-[46px] rounded-lg border border-line object-cover" />
  ) : (
    <span className="flex h-[46px] w-[46px] items-center justify-center rounded-lg bg-sky-pale">
      <svg viewBox="0 0 50 50" width="30" height="30" aria-hidden>
        <path d="M25 7 C34 16 34 33 30 42 L20 42 C16 33 16 16 25 7 Z" fill="#FFFDF8" stroke="#C8623A" strokeWidth="2.5" />
        <circle cx="25" cy="22" r="4" fill="none" stroke="#84BBD0" strokeWidth="2" />
        <path d="M20 42 L14 48 L18 42 M30 42 L36 48 L32 42" fill="none" stroke="#93B97C" strokeWidth="2" />
      </svg>
    </span>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={name || 'Keepsake'}
      subtitle="choose who can see it"
      headerLeading={thumb}
      footer={
        <Button size="lg" className="w-full" onClick={() => onSave(tier)}>
          done
        </Button>
      }
    >
      <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
        Who can see this keepsake?
      </p>
      <div className="space-y-2.5">
        {OPTIONS.map((o) => {
          const on = tier === o.tier;
          return (
            <button
              key={o.tier}
              type="button"
              onClick={() => setTier(o.tier)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border-[1.5px] p-3 text-left',
                on ? 'border-cinnamon bg-paper-2' : 'border-line',
              )}
            >
              <span
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                  on ? 'border-cinnamon' : 'border-line',
                )}
              >
                {on ? <span className="h-2.5 w-2.5 rounded-full bg-cinnamon" /> : null}
              </span>
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg"
                style={{ background: o.iconBg, color: o.iconColor }}
              >
                <Icon icon={o.icon} size={16} />
              </span>
              <span className="flex-1">
                <span className="block text-[13px] font-bold text-cocoa">{o.title}</span>
                <span className="block text-[11px] text-ink-faint">{o.desc}</span>
              </span>
              <WhoStack who={o.who === 'lock' ? 'lock' : whoFor(o.who, people)} />
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
        <Icon icon={IconShieldCheck} size={14} className="mt-0.5 shrink-0 text-green-save" />
        <span>
          New keepsakes start as <b>Family</b>. Widen to Extended any time — nothing is ever public.
        </span>
      </p>
      {extra ? <div className="mt-3 border-t border-line pt-3">{extra}</div> : null}
      {onDelete ? (
        <div className="mt-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              onDelete();
            }}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-berry hover:underline"
          >
            <Icon icon={IconTrash} size={14} /> {confirmDelete ? 'tap again to delete for good' : 'delete this keepsake'}
          </button>
          {confirmDelete ? (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
              this removes the original from our store, processors &amp; backups — it can’t be undone.
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
