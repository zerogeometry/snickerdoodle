'use client';

import { IconHome, IconHomeHeart, IconLock, IconShieldCheck, IconTrash, IconUser, IconUsers } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { cn } from '@/ui/cn';

type Tier = 'ONLY_ME' | 'HOME' | 'FAMILY' | 'EXTENDED';
const RANK: Record<Tier, number> = { ONLY_ME: 0, HOME: 1, FAMILY: 2, EXTENDED: 3 };
type Who = { label: string; color: string; textColor?: string };

const OPTIONS: {
  tier: Tier;
  icon: TablerIconComponent;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  who: 'lock' | 'HOME' | 'FAMILY' | 'EXTENDED';
}[] = [
  { tier: 'ONLY_ME', icon: IconLock, iconBg: '#EFE6D6', iconColor: '#7A6A58', title: 'Only me', desc: 'Private to you — no one else sees it', who: 'lock' },
  // D27: home = the family leader, a partner / co-parent and grown-up children
  { tier: 'HOME', icon: IconHome, iconBg: 'var(--color-honey-band)', iconColor: 'var(--color-cinnamon)', title: 'Home', desc: 'You and the grown-ups at home', who: 'HOME' },
  { tier: 'FAMILY', icon: IconHomeHeart, iconBg: '#FBE4DA', iconColor: '#C8623A', title: 'Family', desc: 'Home and the family circle', who: 'FAMILY' },
  {
    tier: 'EXTENDED',
    icon: IconUsers,
    iconBg: '#E8F0DF',
    iconColor: '#5C8A3F',
    title: 'Extended family',
    desc: 'Everyone you’ve invited, grandparents too',
    who: 'EXTENDED',
  },
];

/** Another member of the family, as the "who's included" stack shows them. */
export interface VisibilityPerson {
  initial: string;
  /** their circle (the family leader counts as home) */
  circle: 'HOME' | 'FAMILY' | 'EXTENDED';
}

const STACK_COLORS = ['#93B97C', '#84BBD0', '#F2A640', '#E8786E'];

/** The REAL people a tier reaches (tiers nest: home sees home, family and extended; family sees family and
 * extended; extended sees only extended) — never placeholder faces (NN1: show exactly who a choice exposes a
 * child's art to). */
const CIRCLE_RANK = { HOME: 1, FAMILY: 2, EXTENDED: 3 } as const;
function whoFor(tier: 'HOME' | 'FAMILY' | 'EXTENDED', people: VisibilityPerson[]): Who[] {
  const reached = people.filter((p) => CIRCLE_RANK[p.circle] <= RANK[tier]);
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
  role = 'adder',
  widest = 'EXTENDED',
  addedByName = null,
  childParentName = null,
}: {
  open: boolean;
  name: string;
  image?: string;
  /** who sees it now */
  tier: Tier;
  /** D27: the viewer added it (they choose, up to `widest`), or they're the little one's parent (narrower only) */
  role?: 'adder' | 'childParent';
  /** the widest choice open to them */
  widest?: Tier;
  /** who added it, when it wasn't the viewer ("Granny added this…") */
  addedByName?: string | null;
  /** on a little one's keepsake someone else added: the child's parent (so "only me" reads "just you and Sam") */
  childParentName?: string | null;
  onClose: () => void;
  onSave: (tier: Tier) => void;
  /** When provided, shows a two-tap "delete this keepsake" control (NN8). */
  onDelete?: () => void;
  /** The family's OTHER members (not the viewer) — drives the real "who's included". */
  people?: VisibilityPerson[];
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
          // wider than they may go: shown (so they see the whole ladder) but not choosable
          const locked = RANK[o.tier] > RANK[widest];
          const desc =
            o.tier === 'ONLY_ME'
              ? role === 'childParent' && addedByName
                ? `Just you and ${addedByName}`
                : childParentName
                  ? `Just you and ${childParentName}`
                  : o.desc
              : o.desc;
          return (
            <button
              key={o.tier}
              type="button"
              onClick={() => setTier(o.tier)}
              disabled={locked}
              aria-pressed={on}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-xl border-[1.5px] p-3 text-left disabled:cursor-not-allowed disabled:opacity-45',
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
                <span className="block text-[11px] text-ink-faint">{desc}</span>
              </span>
              <WhoStack who={o.who === 'lock' ? 'lock' : whoFor(o.who, people)} />
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
        <Icon icon={IconShieldCheck} size={14} className="mt-0.5 shrink-0 text-green-save" />
        {role === 'childParent' ? (
          <span>
            {addedByName ? `${addedByName} added this.` : 'Someone else added this.'} You can make it more private, or take it off — it never goes wider than they chose.
          </span>
        ) : widest !== 'EXTENDED' ? (
          <span>
            {childParentName ? `${childParentName} has` : 'The little one’s parent has'} kept this one to <b>{OPTIONS.find((x) => x.tier === widest)?.title.toLowerCase()}</b> at most. Nothing is ever public.
          </span>
        ) : (
          <span>
            New keepsakes start as <b>Family</b>. It’s your choice who sees what you add — nothing is ever public.
          </span>
        )}
      </p>
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
            <Icon icon={IconTrash} size={14} /> {confirmDelete ? 'tap again to delete for good' : role === 'childParent' ? 'take it off' : 'delete this keepsake'}
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
