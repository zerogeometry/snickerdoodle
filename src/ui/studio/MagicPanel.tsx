'use client';

import { IconBackground, IconCircleCheck, IconSparkles } from '@tabler/icons-react';
import { MAGIC_EDITS, type MagicEdits } from '@/lib/studio-magic';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Section, Stack } from './panel';

/**
 * One-tap magic edits — warm switches, never knobs. Each is a step you can undo, and the
 * original is always kept. (Remove background lives in its own tool; it's a jump away here.)
 */
export function MagicPanel({ magic, busy, onToggle, onRemoveBg, hadCutout }: { magic: MagicEdits | null; busy: boolean; onToggle: (id: keyof MagicEdits) => void; onRemoveBg: () => void; hadCutout: boolean }) {
  return (
    <Stack>
      <Section label="one tap">
        <div className="flex flex-col gap-2" role="group" aria-label="magic edits">
          {MAGIC_EDITS.map((m) => {
            const on = !!magic?.[m.id];
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => onToggle(m.id)}
                className={`press flex min-h-14 items-center gap-3 rounded-[14px] border-2 px-3 text-left disabled:opacity-60 ${on ? 'border-cocoa bg-honey-band' : 'border-cocoa/20 bg-paper hover:border-cocoa'}`}
              >
                <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${on ? 'bg-cocoa text-paper' : 'bg-paper-2 text-cobalt'}`}>
                  <Icon icon={on ? IconCircleCheck : IconSparkles} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-extrabold text-cocoa">{m.label}</span>
                  <span className="block text-[11px] leading-snug text-ink-soft">{m.note}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-soft">tap again to take it off. done here, on our own computers — your original is always kept.</p>
      </Section>
      {!hadCutout ? (
        <Section label="also">
          <Button variant="secondary" size="sm" className="w-full" onClick={onRemoveBg}>
            <Icon icon={IconBackground} size={15} /> remove background
          </Button>
        </Section>
      ) : null}
    </Stack>
  );
}
