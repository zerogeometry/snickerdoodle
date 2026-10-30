'use client';

import { IconCalendarHeart, IconHeart, IconMailForward, IconPlus, IconTree, IconUsers } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { resendInviteAction, revokeInviteAction } from '@/app/actions/family';
import type { AccessLevel, Relationship } from '@/domain/types';
import { toast } from '@/lib/store';
import type { FamilyChild, FamilyData, FamilyMember, FamilyPendingInvite } from '@/server/family';
import { Icon } from '@/ui/primitives/Icon';
import type { Rel } from '@/ui/modals/AddFamilyMemberModal';

/**
 * "Your family circles" as a pinboard (founder's mockup, 27 Oct): taped polaroids in three rows — home
 * (you and the little ones), the Family circle, the Extended family — with the family's numbers on
 * stickers above. A leader should feel proud looking at it; every polaroid is also the way in to that
 * person (what they can see and do, change or remove — owner only).
 */
const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .8)', 'rgb(232 120 110 / .75)', 'rgb(127 166 94 / .75)'];
const FILLS = ['var(--color-honey)', 'var(--color-berry)', 'var(--color-sky)', 'var(--color-leaf)', 'var(--color-honey-band)', 'var(--color-berry-pale)', 'var(--color-sky-pale)', 'var(--color-leaf-pale)'];
const REL: Record<Relationship, string> = { CHILD: 'little one', PARENT: 'parent', GRANDPARENT: 'grandparent', AUNT_UNCLE: 'aunt / uncle', CLOSE_FRIEND: 'close friend', OTHER: 'family friend' };
const ACCESS: Record<AccessLevel, string> = { VIEW: 'views', VIEW_BUY: 'views & buys', CONTRIBUTE: 'views, buys & adds' };

function ageOf(iso: string | null): string | null {
  if (!iso) return null;
  const b = new Date(`${iso.slice(0, 10)}T12:00:00Z`), now = new Date();
  let years = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) years--;
  if (years >= 1) return `age ${years}`;
  const months = (now.getUTCFullYear() - b.getUTCFullYear()) * 12 + now.getUTCMonth() - b.getUTCMonth() - (now.getUTCDate() < b.getUTCDate() ? 1 : 0);
  return months <= 0 ? 'newborn' : `${months} month${months === 1 ? '' : 's'}`;
}

function Polaroid({ i, fill, picture, initial, name, sub, onOpen, label }: { i: number; fill: string; picture?: string | null; initial: string; name: string; sub: string; onOpen?: () => void; label: string }) {
  const body = (
    <>
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden" style={{ background: fill }}>
        {picture ? <img src={picture} alt="" className="h-full w-full object-cover" /> : <span className="font-display text-4xl font-extrabold text-cocoa">{initial}</span>}
      </span>
      <span className="mt-1.5 block text-center">
        <span className="block truncate text-[13px] font-extrabold leading-tight text-cocoa">{name}</span>
        <span className="block truncate text-[11px] text-ink-soft">{sub}</span>
      </span>
    </>
  );
  const style = { ['--tilt' as string]: `${i % 2 ? 2.5 : -2.5}deg`, ['--tape' as string]: TAPES[(i + 1) % TAPES.length], ['--i' as string]: i };
  return onOpen ? (
    <button type="button" onClick={onOpen} aria-label={label} className="polaroid tape lift pop-in press block w-[104px] text-left" style={style}>
      {body}
    </button>
  ) : (
    <figure className="polaroid tape pop-in w-[104px]" style={style}>
      {body}
    </figure>
  );
}

function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press flex h-[138px] w-[104px] flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed border-tomato bg-paper-2 px-2 text-center text-cinnamon">
      <Icon icon={IconPlus} size={22} />
      <span className="text-xs font-bold leading-tight">{label}</span>
    </button>
  );
}

function Invited({ inv, owner }: { inv: FamilyPendingInvite; owner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const who = inv.email.split('@')[0]!;
  const resend = () =>
    start(async () => {
      const r = await resendInviteAction(inv.id);
      toast(r.ok ? `sent again to ${who} — a fresh link, good for 14 days` : 'couldn’t resend that — try again');
      router.refresh();
    });
  const cancel = () =>
    start(async () => {
      const r = await revokeInviteAction(inv.id);
      toast(r.ok ? `invite to ${who} cancelled — the link no longer works` : 'couldn’t cancel that — try again');
      router.refresh();
    });
  const days = Math.max(0, Math.ceil((new Date(inv.expiresAtISO).getTime() - Date.now()) / 86_400_000));
  return (
    <div className="flex w-[104px] flex-col items-center">
      <div className="flex h-[104px] w-full flex-col items-center justify-center rounded-[6px] border-2 border-dashed border-cocoa/30 bg-paper-2 text-ink-faint">
        <Icon icon={IconMailForward} size={22} />
        <span className="mt-1 max-w-full truncate px-1 text-[12px] font-extrabold text-cocoa">{who}</span>
        <span className="text-[10px]">invited · {days}d left</span>
      </div>
      {owner ? (
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={resend} disabled={pending} aria-label={`resend the invite to ${inv.email}`} className="min-h-11 text-[11px] font-bold text-cinnamon underline disabled:opacity-60">
            resend
          </button>
          <button type="button" onClick={cancel} disabled={pending} aria-label={`cancel the invite to ${inv.email}`} className="min-h-11 text-[11px] font-bold text-ink-soft underline disabled:opacity-60">
            cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, tape, sub, children }: { label: string; tape: string; sub: string; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="sticker absolute -left-1 -top-3 z-10 -rotate-3 rounded-pill px-3 py-1 text-xs font-extrabold text-cocoa" style={{ background: tape }}>
        {label}
      </span>
      <div className="flex flex-wrap items-start justify-center gap-5 rounded-[20px] border-2 border-dashed border-cocoa/20 px-3 pb-4 pt-7">{children}</div>
      <p className="mt-1.5 text-center text-xs text-ink-soft">{sub}</p>
    </div>
  );
}

export function FamilyPinboard({
  data,
  onManageMember,
  onManageChild,
  onAdd,
}: {
  data: FamilyData;
  onManageMember: (m: FamilyMember) => void;
  onManageChild: (c: FamilyChild) => void;
  onAdd: (rel: Rel) => void;
}) {
  const owner = data.viewerIsOwner;
  const me = data.members.find((m) => m.isOwner) ?? null;
  const familyCircle = data.members.filter((m) => !m.isOwner && m.circle === 'FAMILY');
  const extended = data.members.filter((m) => !m.isOwner && m.circle === 'EXTENDED');
  let n = 0;
  const memberTile = (m: FamilyMember) => (
    <Polaroid
      key={m.accountId}
      i={n++}
      fill={FILLS[n % FILLS.length]!}
      picture={m.avatarUrl}
      initial={m.initial}
      name={m.isYou ? `${m.name} (you)` : m.name}
      sub={m.isOwner ? 'family lead' : `${REL[m.relationship]} · ${ACCESS[m.accessLevel]}`}
      label={`${m.name}: what they can see and do`}
      onOpen={owner && !m.isOwner ? () => onManageMember(m) : undefined}
    />
  );
  const stats = [
    { n: data.stats.people, l: 'people', i: IconUsers },
    { n: data.stats.generations, l: data.stats.generations === 1 ? 'generation' : 'generations', i: IconTree },
    { n: data.stats.keepsakes, l: 'keepsakes kept', i: IconHeart },
    { n: data.stats.occasions, l: 'occasions', i: IconCalendarHeart },
  ];
  return (
    <section aria-labelledby="circles" className="kraft rounded-[28px] border-2 border-cocoa/10 p-4 shadow-[0_6px_18px_rgb(43_33_24/0.08)] sm:p-6">
      <h2 id="circles" className="text-center font-display text-3xl font-extrabold text-cocoa">your family circles</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.l} className="sticker pop-in rounded-[16px] bg-paper px-2 py-2.5 text-center" style={{ rotate: `${i % 2 ? 1.5 : -1.5}deg`, ['--i' as string]: i }}>
            <Icon icon={s.i} size={18} className="mx-auto text-cinnamon" />
            <p className="font-display text-3xl font-extrabold text-cocoa">{s.n}</p>
            <p className="text-xs font-bold text-ink-soft">{s.l}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-8">
        <Row label="home" tape={TAPES[0]!} sub="you and the little ones — every keepsake starts here">
          {me ? memberTile(me) : null}
          {data.children.map((c) => (
            <Polaroid
              key={c.id}
              i={n++}
              fill={FILLS[n % FILLS.length]!}
              initial={c.firstName.charAt(0).toUpperCase()}
              name={c.firstName}
              sub={ageOf(c.birthdayISO) ?? 'little one'}
              label={`${c.firstName}: name and birthday`}
              onOpen={owner ? () => onManageChild(c) : undefined}
            />
          ))}
          {owner ? <AddTile label="add a little one" onClick={() => onAdd('Child')} /> : null}
        </Row>
        <Row label="family circle" tape={TAPES[1]!} sub="sees everything you share with family">
          {familyCircle.map(memberTile)}
          {data.pendingInvites.filter((i) => i.circle === 'FAMILY').map((inv) => <Invited key={inv.id} inv={inv} owner={owner} />)}
          {owner ? <AddTile label="invite" onClick={() => onAdd('Parent')} /> : null}
          {!owner && familyCircle.length === 0 ? <p className="py-6 text-xs text-ink-faint">nobody here yet</p> : null}
        </Row>
        <Row label="extended family" tape={TAPES[3]!} sub="grandparents, aunts, uncles and close friends — sees what you share with them">
          {extended.map(memberTile)}
          {data.pendingInvites.filter((i) => i.circle === 'EXTENDED').map((inv) => <Invited key={inv.id} inv={inv} owner={owner} />)}
          {owner ? <AddTile label="invite" onClick={() => onAdd('Grandparent')} /> : null}
          {!owner && extended.length === 0 ? <p className="py-6 text-xs text-ink-faint">nobody here yet</p> : null}
        </Row>
      </div>
    </section>
  );
}
