'use client';

import { IconHeart, IconLock } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { SUBJECT_KEY, toast, useFamily } from '@/lib/store';

/**
 * "Who's this for?" — the shared gate both Checkout and Share a Wish pass through.
 * Names the child the keepsake is FOR (the subject), so it files into their corner
 * of the family keepsake box. Child FIRST NAME ONLY — we never ask a surname.
 * The choice is carried across the (magic-link) round-trip via sessionStorage.
 */
export function WhoForModal({
  open,
  mode,
  onClose,
}: {
  open: boolean;
  mode: 'checkout' | 'share';
  onClose: () => void;
}) {
  const router = useRouter();
  const members = useFamily((s) => s.members);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');

  const subject = (selected ?? name).trim();

  const proceed = () => {
    if (!subject) {
      toast('pop in their first name');
      return;
    }
    if (/\s/.test(subject)) {
      toast('just their first name — no surname');
      return;
    }
    try {
      sessionStorage.setItem(SUBJECT_KEY, subject);
    } catch {
      // sessionStorage unavailable — proceed without carrying the name
    }
    onClose();
    router.push(mode === 'share' ? '/share-wish' : '/checkout');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Who's this for?"
      subtitle={mode === 'share' ? 'we’ll keep it in their corner, then make a link to share' : 'we’ll tuck it into their corner of your keepsake box'}
      footer={
        <Button size="lg" className="w-full" onClick={proceed}>
          {mode === 'share' ? 'keep it & share a wish' : 'keep it & checkout'}
        </Button>
      }
    >
      {members.length > 0 ? (
        <>
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Your little ones</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {members.map((m) => {
              const on = selected === m.name;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setSelected(on ? null : m.name);
                    setName('');
                  }}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    on ? 'border-cinnamon bg-paper-2 text-cocoa' : 'border-line bg-white text-ink-soft hover:border-honey'
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold" style={{ backgroundColor: m.color, color: m.textColor ?? '#fff' }}>
                    {m.initial}
                  </span>
                  {m.name}
                </button>
              );
            })}
          </div>
          <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">…or someone new</p>
        </>
      ) : (
        <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Their first name</p>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3">
        <Icon icon={IconHeart} size={16} className="shrink-0 text-cinnamon" />
        <input
          type="text"
          value={name}
          maxLength={24}
          onChange={(e) => {
            setName(e.target.value);
            setSelected(null);
          }}
          placeholder="e.g. Mia"
          className="w-full bg-transparent py-2.5 text-sm text-cocoa placeholder:text-ink-faint focus:outline-none"
        />
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-green-save">
        <Icon icon={IconLock} size={13} className="mt-px shrink-0" />
        First name&apos;s all we need — we never ask a child&apos;s surname. It stays private in your family box.
      </p>
    </Modal>
  );
}
