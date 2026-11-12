'use client';

import { IconBalloon, IconCake, IconCalendarHeart, IconHeart, IconPhoto, IconStar } from '@tabler/icons-react';
import type { TablerIconComponent } from '@/ui/primitives/Icon';
import { Icon } from '@/ui/primitives/Icon';
import type { ConnectSyncDraft, SyncKeepsakes } from '@/lib/drawSync';

/** The keepsakes choice, in the brief's order (DRAW-APP-sync-choices.md §The slate). */
export const KEEPSAKE_OPTIONS: { value: SyncKeepsakes; label: string; hint: string; icon: TablerIconComponent }[] = [
  { value: 'none', label: 'nothing automatic', hint: 'a grown-up keeps (or makes real) one drawing at a time, as and when.', icon: IconHeart },
  {
    value: 'proud',
    label: 'the proud pile only',
    hint: 'a drawing starred into the proud pile goes to your keepsake box — whoever stars it, your little one included. the gentle choice if you’d like some sent.',
    icon: IconStar,
  },
  { value: 'all', label: 'all drawings', hint: 'every single drawing saved in draw goes to your keepsake box, scribbles and all — it adds up fast.', icon: IconPhoto },
];

export const SYNC_BOXES: { key: 'children' | 'progress' | 'birthdays'; label: string; hint: string; icon: TablerIconComponent }[] = [
  {
    key: 'children',
    label: 'first names',
    hint: 'keep your little ones’ first names the same in both places — a rename in draw updates here. birthdays you add here stay here; the app goes by age group.',
    icon: IconCake,
  },
  {
    key: 'progress',
    label: 'drawing days',
    hint: 'back up each little one’s drawing days (the days they drew, rest weeks, their best run, lessons done) so a new phone can pick them up.',
    icon: IconCalendarHeart,
  },
  {
    key: 'birthdays',
    label: 'family birthdays and special days',
    hint: 'show the same list in draw and on snickerdoodle — a name, what they are to you if you like, and the day and month. never a year. everyone you share your family calendar with can see them.',
    icon: IconBalloon,
  },
];

/**
 * The one slate of sync choices — on the connect page (nothing picked yet) and on the account page
 * (what's chosen now). Privacy by default: the parent picks; nothing is pre-selected here. Native
 * radios and checkboxes inside big labels (≥44px), so it's keyboard- and screen-reader-friendly.
 */
export function DrawSyncSlate({
  value,
  onChange,
  disabled = false,
  name,
}: {
  value: ConnectSyncDraft;
  onChange: (next: ConnectSyncDraft) => void;
  disabled?: boolean;
  /** unique per slate on a page (radio group name + ids) */
  name: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={disabled} aria-describedby={`${name}-keepsakes-hint`}>
        <legend className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
          drawings → your keepsake box <span className="normal-case tracking-normal text-cinnamon">(pick one)</span>
        </legend>
        <p id={`${name}-keepsakes-hint`} className="mb-2 text-xs leading-snug text-ink-faint">
          each one sends the drawing, the day it was made and whether it was drawn on screen or on paper — nothing else.
        </p>
        <div className="flex flex-col gap-2">
          {KEEPSAKE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-[14px] border-2 border-cocoa/20 bg-paper px-3 py-2.5 has-[:checked]:border-cocoa has-[:checked]:bg-honey-band has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cobalt"
            >
              <input
                type="radio"
                name={`${name}-keepsakes`}
                value={o.value}
                required
                checked={value.keepsakes === o.value}
                onChange={() => onChange({ ...value, keepsakes: o.value })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-cta"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-bold text-cocoa">
                  <Icon icon={o.icon} size={16} className="shrink-0 text-cinnamon" /> {o.label}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
          also keep in step <span className="normal-case tracking-normal text-ink-faint">(optional)</span>
        </legend>
        <div className="flex flex-col gap-2">
          {SYNC_BOXES.map((b) => (
            <label
              key={b.key}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-[14px] border-2 border-cocoa/20 bg-paper px-3 py-2.5 has-[:checked]:border-cocoa has-[:checked]:bg-leaf-pale has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cobalt"
            >
              <input
                type="checkbox"
                name={`${name}-${b.key}`}
                checked={value[b.key]}
                onChange={(e) => onChange({ ...value, [b.key]: e.target.checked })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-cta"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-bold text-cocoa">
                  <Icon icon={b.icon} size={16} className="shrink-0 text-cinnamon" /> {b.label}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{b.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
