'use client';

import {
  IconCake,
  IconCameraPlus,
  IconLock,
  IconMailShare,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { Toggle } from '@/ui/primitives/Toggle';
import { toast, useFamily } from '@/lib/store';

type Rel = 'Child' | 'Parent' | 'Grandparent' | 'Aunt / uncle' | 'Close friend' | 'Other';

const RELS: { label: Rel; circle: 'Family' | 'Extended' | 'subject' }[] = [
  { label: 'Child', circle: 'subject' },
  { label: 'Parent', circle: 'Family' },
  { label: 'Grandparent', circle: 'Extended' },
  { label: 'Aunt / uncle', circle: 'Extended' },
  { label: 'Close friend', circle: 'Extended' },
  { label: 'Other', circle: 'Extended' },
];

const PALETTE = ['#84BBD0', '#93B97C', '#E8786E', '#F2A640', '#C8623A'];

function circleOf(rel: Rel) {
  return RELS.find((r) => r.label === rel)!.circle;
}

export function AddFamilyMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rel, setRel] = useState<Rel>('Grandparent');
  const [invite, setInvite] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [access, setAccess] = useState('view_buy');
  const [photo, setPhoto] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const members = useFamily((s) => s.members);
  const add = useFamily((s) => s.add);

  const circle = circleOf(rel);
  const isChild = circle === 'subject';

  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPhoto(String(r.result));
    r.readAsDataURL(f);
  };

  const reset = () => {
    setName('');
    setEmail('');
    setBirthday('');
    setPhoto(null);
    setRel('Grandparent');
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast('add a name first');
      return;
    }
    if (!isChild && invite && !email.trim()) {
      toast('add their email to send the invite');
      return;
    }
    const first = trimmed.split(' ')[0] ?? trimmed;
    const color = PALETTE[members.length % PALETTE.length] ?? '#84BBD0';
    add({
      id: `m-${Date.now()}`,
      initial: trimmed.charAt(0).toUpperCase(),
      name: first,
      sub: isChild ? 'little one' : rel.toLowerCase(),
      color,
      textColor: color === '#F2A640' ? '#3A2E1E' : undefined,
    });
    toast(isChild ? `${first} added to your family` : invite ? `invite emailed to ${first}` : `${first} added`);
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a family member"
      subtitle="Grow your family circle"
      footer={
        <Button size="lg" className="w-full" onClick={submit}>
          <Icon icon={IconUserPlus} size={16} /> {isChild ? 'add to family' : 'send invite & add to family'}
        </Button>
      }
    >
      <input ref={photoRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
      {/* Photo */}
      <div className="mb-4 flex items-center gap-3.5">
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[#D7B894] bg-[#FCF6EC] text-cinnamon"
        >
          {photo ? (
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <>
              <Icon icon={IconCameraPlus} size={20} />
              <span className="mt-0.5 text-[11px] font-bold">add photo</span>
            </>
          )}
        </button>
        <p className="text-xs leading-relaxed text-[#7A6A58]">
          <b className="block text-[13px] text-cocoa">Add a photo</b>So everyone knows who&apos;s who in the circle.
          Change it any time.
        </p>
      </div>

      {/* Name */}
      <label className="mb-3 block">
        <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First name"
          className="w-full rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-2.5 text-[13px] text-cocoa placeholder:text-[#A89B8C]"
        />
      </label>

      {/* Relationship */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
          Relationship <span className="font-normal normal-case text-[#B3A491]">· sets which keepsakes they&apos;ll see</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RELS.map((r) => (
            <Chip key={r.label} active={rel === r.label} onClick={() => setRel(r.label)}>
              {r.label}
            </Chip>
          ))}
        </div>
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-[#BFD6A8] bg-[#E8F0DF] px-3 py-2.5">
          <Icon icon={IconUsers} size={16} className="mt-0.5 shrink-0 text-green-save" />
          <p className="text-xs leading-relaxed text-[#46402F]">
            {isChild ? (
              <>
                Added as one of your little ones — a <b className="text-[#3F6E29]">keepsake subject</b>, not an account
                holder.
              </>
            ) : circle === 'Family' ? (
              <>
                Joins your <b className="text-[#3F6E29]">Family</b> — they&apos;ll see keepsakes you share with your
                family, and your Extended ones too.
              </>
            ) : (
              <>
                Joins your <b className="text-[#3F6E29]">Extended family</b> — they&apos;ll see keepsakes you share with
                Extended family, never your Family-only or private ones.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Birthday */}
      <div className="mb-3">
        <label htmlFor="member-bday" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
          Birthday <span className="font-normal normal-case text-[#B3A491]">· optional</span>
        </label>
        <div className="flex items-center gap-2.5 rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-2.5">
          <Icon icon={IconCake} size={15} className="text-[#9C8E7E]" />
          <input
            id="member-bday"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="flex-1 bg-transparent text-[13px] text-cocoa outline-none"
          />
        </div>
      </div>

      {/* Invite (hidden for a child — a subject, not an invitee) */}
      {!isChild ? (
        <div className="rounded-xl border border-[#F0CF9C] bg-honey-band p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-cocoa">
              <Icon icon={IconMailShare} size={15} className="text-cinnamon" /> Invite to the family workspace
            </span>
            <Toggle on={invite} onChange={setInvite} label="Invite to the family workspace" />
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
              <label className="mt-2 flex items-center justify-between rounded-lg border border-[#EAD9BE] bg-white px-3 py-2 text-xs">
                <span className="text-[#5F564C]">They can</span>
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
              <p className="mt-2 text-[11px] leading-relaxed text-[#8A6F52]">
                We&apos;ll email them a link to join. Once they verify it&apos;s them, they&apos;ll see your family
                workspace at the level you set.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#9C8E7E]">
        <Icon icon={IconLock} size={14} className="text-green-save" /> You&apos;re always in control — change a
        relationship, access, or remove anyone, any time.
      </p>
    </Modal>
  );
}
