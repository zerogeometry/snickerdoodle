'use client';

import { IconCake, IconLock, IconMailShare, IconUserPlus, IconUsers } from '@tabler/icons-react';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { toast } from '@/lib/store';
import { createInviteAction } from '@/app/actions/invite';
import { addChildAction } from '@/app/actions/family';
import { useRouter } from 'next/navigation';
import type { AccessLevel, Relationship } from '@/domain/types';
import { LunarChoice, type LunarValue } from '@/ui/components/LunarChoice';

export type Rel = 'Child' | 'Parent' | 'Grandparent' | 'Aunt / uncle' | 'Close friend' | 'Other';

const RELS: { label: Rel; circle: 'Family' | 'Extended' | 'subject'; enum: Relationship }[] = [
  { label: 'Child', circle: 'subject', enum: 'CHILD' },
  { label: 'Parent', circle: 'Family', enum: 'PARENT' },
  { label: 'Grandparent', circle: 'Extended', enum: 'GRANDPARENT' },
  { label: 'Aunt / uncle', circle: 'Extended', enum: 'AUNT_UNCLE' },
  { label: 'Close friend', circle: 'Extended', enum: 'CLOSE_FRIEND' },
  { label: 'Other', circle: 'Extended', enum: 'OTHER' },
];

const ACCESS_ENUM: Record<string, AccessLevel> = { view: 'VIEW', view_buy: 'VIEW_BUY', contribute: 'CONTRIBUTE' };

function relOf(rel: Rel) {
  return RELS.find((r) => r.label === rel)!;
}

export function AddFamilyMemberModal({ open, onClose, initialRel = 'Grandparent' }: { open: boolean; onClose: () => void; /** where it opens (the pinboard row tapped) */ initialRel?: Rel }) {
  const [rel, setRel] = useState<Rel>(initialRel);
  // opened from a different row of the pinboard: start on that kind of person
  useEffect(() => {
    if (open) setRel(initialRel);
  }, [open, initialRel]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [lunar, setLunar] = useState<LunarValue>(null);
  const [access, setAccess] = useState('view_buy');
  // The family calendar is the point of inviting family — pre-ticked, visible, changeable later.
  const [shareCalendar, setShareCalendar] = useState(true);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const circle = relOf(rel).circle;
  const isChild = circle === 'subject';

  const reset = () => {
    setName('');
    setEmail('');
    setBirthday('');
    setRel('Grandparent');
    setShareCalendar(true);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast('add a name first');
      return;
    }
    const first = trimmed.split(' ')[0] ?? trimmed;

    if (isChild) {
      // A child is a keepsake SUBJECT, not an invitee: no email, no account, first name only.
      startTransition(async () => {
        const res = await addChildAction({ firstName: trimmed, birthday: birthday || null, birthdayLunar: birthday ? lunar : null });
        if (res.needsAuth) return toast('log in to add your little one');
        if (!res.ok) {
          setError(
            res.reason === 'surname'
              ? 'just their first name, please — we never keep a little one’s surname'
              : res.reason === 'birthday'
                ? 'that birthday doesn’t look quite right'
                : res.reason === 'not-owner'
                  ? 'only the family’s parent can add little ones'
                  : 'letters only for a first name, please',
          );
          return;
        }
        toast(`${res.firstName} is in the family ✦`);
        reset();
        onClose();
        router.refresh();
      });
      return;
    }
    if (!email.trim()) {
      toast('add their email to send the invite');
      return;
    }

    startTransition(async () => {
      const res = await createInviteAction({
        email: email.trim(),
        relationship: relOf(rel).enum,
        accessLevel: ACCESS_ENUM[access] ?? 'VIEW_BUY',
        shareOccasions: shareCalendar,
        name: first, // only to say hello in the invite email — not kept
      });
      if (res.needsAuth) {
        toast('log in to invite family');
        return;
      }
      if (!res.ok) {
        // already in the family (04-B4): say so plainly — their level is changed from their card
        if (res.reason === 'already-member') setError(`${first} is already in your family — change what they can see from their card on this page`);
        else toast('couldn’t send that invite — try again');
        return;
      }
      toast(`invite sent to ${first} — they’ll appear once they join`);
      reset();
      onClose();
      router.refresh(); // the pending invite shows in the circle
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a family member"
      subtitle="Grow your family circle"
      footer={
        <Button size="lg" className="w-full" onClick={submit} disabled={pending}>
          <Icon icon={IconUserPlus} size={16} />{' '}
          {pending ? 'sending…' : isChild ? 'add to family' : 'send invite'}
        </Button>
      }
    >
      {/* Name */}
      <label className="mb-3 block">
        <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="First name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'add-member-error' : undefined}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-[13px] text-cocoa placeholder:text-ink-faint"
        />
        {error ? (
          <span id="add-member-error" role="alert" className="mt-1.5 block border-l-2 border-berry pl-2 text-xs font-semibold text-cocoa">
            {error}
          </span>
        ) : null}
      </label>

      {/* Relationship */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
          Relationship <span className="font-normal normal-case text-ink-faint">· sets which keepsakes they&apos;ll see</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RELS.map((r) => (
            <Chip key={r.label} active={rel === r.label} onClick={() => setRel(r.label)}>
              {r.label}
            </Chip>
          ))}
        </div>
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-leaf bg-leaf-pale px-3 py-2.5">
          <Icon icon={IconUsers} size={16} className="mt-0.5 shrink-0 text-green-save" />
          <p className="text-xs leading-relaxed text-ink-soft">
            {isChild ? (
              <>
                Added as one of your little ones — a <b className="text-green-save">keepsake subject</b>, not an account
                holder.
              </>
            ) : circle === 'Family' ? (
              <>
                Joins your <b className="text-green-save">Family</b> — they&apos;ll see keepsakes you share with your
                family, and your Extended ones too.
              </>
            ) : (
              <>
                Joins your <b className="text-green-save">Extended family</b> — they&apos;ll see keepsakes you share with
                Extended family, never your Family-only or private ones.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Birthday: a little one's, for the family calendar (an adult's isn't needed — 04-B8) */}
      {isChild ? (
        <div className="mb-3">
          <label htmlFor="member-bday" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
            Birthday <span className="font-normal normal-case text-ink-faint">· optional</span>
          </label>
          <div className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2.5">
            <Icon icon={IconCake} size={15} className="text-ink-faint" />
            <input
              id="member-bday"
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-cocoa outline-none"
            />
          </div>
          {birthday ? <LunarChoice value={lunar} onChange={setLunar} /> : null}
        </div>
      ) : null}

      {/* Invite (hidden for a child — a subject, not an invitee). A grown-up only ever joins from an
          invite they accept, so there's no "add without inviting" switch (04-B8). */}
      {!isChild ? (
        <div className="rounded-xl border border-sunshine bg-honey-band p-3">
          <label htmlFor="member-email" className="flex items-center gap-1.5 text-[13px] font-bold text-cocoa">
            <Icon icon={IconMailShare} size={15} className="text-cinnamon" /> Their email
          </label>
          <input
            id="member-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="their email"
            className="mt-2.5 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-xs text-cocoa placeholder:text-ink-faint"
          />
          <label className="mt-2 flex items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-xs">
            <span className="text-ink-soft">They can</span>
            <select
              value={access}
              onChange={(e) => setAccess(e.target.value)}
              className="bg-transparent font-bold text-cocoa outline-none"
            >
              <option value="view">view only</option>
              <option value="view_buy">view &amp; buy</option>
              <option value="contribute">view, buy &amp; add</option>
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
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            We&apos;ll email them a link to join, saying it&apos;s from you. Once they verify it&apos;s them,
            they&apos;ll see your family workspace at the level you set — and they can add their own photo.
          </p>
        </div>
      ) : null}

      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Icon icon={IconLock} size={14} className="text-green-save" /> You&apos;re always in control — change a
        relationship, access, or remove anyone, any time.
      </p>
    </Modal>
  );
}
