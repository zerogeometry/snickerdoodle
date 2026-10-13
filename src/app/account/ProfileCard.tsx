'use client';

import { IconCamera, IconMail, IconPencil, IconPhoto, IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { toast } from '@/lib/store';
import { useProfileImageUpload } from '@/ui/components/useProfileImageUpload';
import { removeProfileImageAction, requestEmailChangeAction, updateNameAction } from '@/app/actions/profile';

export interface ProfileView {
  name: string;
  email: string;
  initial: string;
  avatarUrl: string | null;
  headerUrl: string | null;
}

/**
 * Your profile, as your family sees it: a header picture, your profile picture, your name — plus
 * your email (only you see that). "edit profile" opens the sheet where each can be changed.
 */
export function ProfileCard({ profile }: { profile: ProfileView }) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="mt-5 overflow-hidden rounded-[22px] border-2 border-cocoa/15 bg-paper">
      <div className="relative h-28 w-full bg-honey-band md:h-36">
        {profile.headerUrl ? <img src={profile.headerUrl} alt="your profile header" className="h-full w-full object-cover" /> : <div aria-hidden className="kraft h-full w-full opacity-70" />}
      </div>
      <div className="flex items-end gap-3.5 px-4 pb-4">
        <span className="relative z-10 -mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-paper bg-cinnamon font-display text-2xl font-bold text-cta-text shadow-[0_3px_0_rgb(43_33_24/0.2)]">
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="your profile picture" className="h-full w-full object-cover" /> : profile.initial}
        </span>
        <div className="min-w-0 flex-1 pt-2">
          <div className="truncate text-[17px] font-extrabold text-cocoa">{profile.name}</div>
          <div className="flex items-center gap-1.5 truncate text-xs text-ink-faint">
            <Icon icon={IconMail} size={13} className="shrink-0" /> <span className="truncate">{profile.email}</span>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)} aria-label="edit profile" className="w-11 shrink-0 px-0 sm:w-auto sm:px-4">
          <Icon icon={IconPencil} size={16} className="shrink-0" /> <span className="hidden sm:inline">edit profile</span>
        </Button>
      </div>
      <ProfileEditModal open={editing} onClose={() => setEditing(false)} profile={profile} />
    </section>
  );
}

function ProfileEditModal({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: ProfileView }) {
  const router = useRouter();
  const done = () => router.refresh();
  const avatar = useProfileImageUpload('AVATAR', done);
  const header = useProfileImageUpload('ACCOUNT_HEADER', done);
  const [name, setName] = useState(profile.name);
  const [nameError, setNameError] = useState(false);
  const [email, setEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(profile.name);
    setNameError(false);
    setEmail('');
    setEmailMsg(null);
  }, [open, profile.name]);

  const saveName = () =>
    startTransition(async () => {
      const res = await updateNameAction(name);
      if (!res.ok) return setNameError(true);
      toast('name saved ✓');
      router.refresh();
    });

  const changeEmail = () =>
    startTransition(async () => {
      const res = await requestEmailChangeAction(email);
      if (res.ok) return setEmailMsg({ ok: true, text: `check ${email.trim()} — we’ve sent a link to confirm it. nothing changes until you tap it.` });
      setEmailMsg({
        ok: false,
        text: res.reason === 'taken' ? 'that email is already used by another account' : res.reason === 'same' ? 'that’s already your email' : 'that doesn’t look like an email address',
      });
    });

  const remove = (kind: 'AVATAR' | 'ACCOUNT_HEADER') =>
    startTransition(async () => {
      const res = await removeProfileImageAction(kind);
      toast(res.ok ? 'removed — deleted for good' : 'couldn’t remove that — try again');
      if (res.ok) router.refresh();
    });

  return (
    <Modal open={open} onClose={onClose} title="edit your profile" subtitle="your family sees your name + pictures — never your email">
      {avatar.input}
      {header.input}

      {/* Pictures */}
      <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">your pictures</p>
      <div className="overflow-hidden rounded-[16px] border-2 border-cocoa/15 bg-paper">
        <div className="relative h-24 w-full bg-honey-band">
          {profile.headerUrl ? <img src={profile.headerUrl} alt="your profile header" className="h-full w-full object-cover" /> : <div aria-hidden className="kraft h-full w-full opacity-70" />}
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button type="button" onClick={header.pick} disabled={header.busy} className="press flex min-h-11 items-center gap-1 rounded-pill border-2 border-cocoa bg-paper px-3 text-xs font-extrabold text-cocoa disabled:opacity-60">
              <Icon icon={IconPhoto} size={14} /> {header.busy ? 'uploading…' : profile.headerUrl ? 'change header' : 'add a header'}
            </button>
            {profile.headerUrl ? (
              <button type="button" onClick={() => remove('ACCOUNT_HEADER')} aria-label="remove your header" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa">
                <Icon icon={IconTrash} size={15} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3 p-3">
          <span className="relative z-10 -mt-9 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-paper bg-cinnamon font-display text-xl font-bold text-cta-text">
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt="your profile picture" className="h-full w-full object-cover" /> : profile.initial}
          </span>
          <button type="button" onClick={avatar.pick} disabled={avatar.busy} className="press flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa bg-paper px-3.5 text-xs font-extrabold text-cocoa disabled:opacity-60">
            <Icon icon={IconCamera} size={14} /> {avatar.busy ? 'uploading…' : profile.avatarUrl ? 'change photo' : 'add a photo'}
          </button>
          {profile.avatarUrl ? (
            <button type="button" onClick={() => remove('AVATAR')} className="inline-flex min-h-11 items-center px-1 text-xs font-bold text-ink-soft underline">
              remove
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint">only people in your family can see these. we strip location data from every photo.</p>

      {/* Name */}
      <label className="mt-5 block">
        <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">your name</span>
        <span className="flex gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
            maxLength={40}
            autoComplete="name"
            aria-invalid={nameError || undefined}
            aria-describedby={nameError ? 'name-error' : undefined}
            className="min-h-11 flex-1 rounded-lg border border-line bg-paper px-3 text-[14px] text-cocoa"
          />
          <Button size="sm" onClick={saveName} disabled={pending || name.trim() === profile.name}>
            save
          </Button>
        </span>
      </label>
      {nameError ? (
        <p id="name-error" role="alert" className="mt-1.5 border-l-2 border-berry pl-2 text-xs font-semibold text-cocoa">
          a name between 1 and 40 letters, please
        </p>
      ) : null}

      {/* Email */}
      <div className="mt-5">
        <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">your email</span>
        <p className="text-[13px] text-cocoa">{profile.email}</p>
        <label className="mt-2 flex gap-2">
          <span className="sr-only">new email address</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailMsg(null);
            }}
            placeholder="new email address"
            autoComplete="email"
            className="min-h-11 flex-1 rounded-lg border border-line bg-paper px-3 text-[14px] text-cocoa placeholder:text-ink-faint"
          />
          <Button variant="secondary" size="sm" onClick={changeEmail} disabled={pending || !email.trim()}>
            change
          </Button>
        </label>
        {emailMsg ? (
          <p role={emailMsg.ok ? 'status' : 'alert'} className={`mt-1.5 text-xs ${emailMsg.ok ? 'text-green-save' : 'border-l-2 border-berry pl-2 font-semibold text-cocoa'}`}>
            {emailMsg.text}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
