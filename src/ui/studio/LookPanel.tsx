'use client';

import { IconRestore } from '@tabler/icons-react';
import { useMemo } from 'react';
import { applyLook, IDENTITY_LOOK, LOOKS, lookIsIdentity, type LookId, type StudioLook } from '@/lib/studio-look';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Section, SliderRow, Stack } from './panel';

// three brand crayons + paper (cta, honey, sky, paper — the @theme tokens), to show what a look does
const SAMPLE = [200, 64, 42, 246, 196, 69, 143, 181, 214, 255, 251, 242];

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/** Colour & light sliders, then the preset looks with how-much. Everything stays undoable. */
export function LookPanel({ look, onChange, onPick }: { look: StudioLook; onChange: (patch: Partial<StudioLook>) => void; onPick: (patch: Partial<StudioLook>) => void }) {
  const swatches = useMemo(
    () =>
      Object.fromEntries(
        LOOKS.map((l) => {
          const px = new Uint8ClampedArray(SAMPLE);
          applyLook(px, 3, { ...IDENTITY_LOOK, filter: l.id, intensity: 100 });
          return [l.id, [0, 3, 6, 9].map((i) => `rgb(${px[i]} ${px[i + 1]} ${px[i + 2]})`)];
        }),
      ) as Record<LookId, string[]>,
    [],
  );
  const row = (key: 'brightness' | 'contrast' | 'saturation' | 'warmth', label: string, aria: string) => (
    <SliderRow label={label} min={-100} max={100} value={look[key]} onChange={(v) => onChange({ [key]: v })} ariaLabel={aria} valueText={signed(look[key])} display={signed(look[key])} />
  );
  return (
    <Stack>
      <Section label="light & colour">
        {row('brightness', 'brightness', 'brightness')}
        {row('contrast', 'contrast', 'contrast')}
        {row('saturation', 'colour', 'colour strength')}
        {row('warmth', 'warmth', 'warmth — cooler to warmer')}
      </Section>
      <Section label="a look">
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="looks">
          <LookChip label="none" on={!look.filter} colours={[0, 3, 6, 9].map((i) => `rgb(${SAMPLE[i]} ${SAMPLE[i + 1]} ${SAMPLE[i + 2]})`)} onClick={() => onPick({ filter: null })} />
          {LOOKS.map((l) => (
            <LookChip key={l.id} label={l.label} on={look.filter === l.id} colours={swatches[l.id]} onClick={() => onPick({ filter: l.id, intensity: look.filter === l.id ? look.intensity : 100 })} />
          ))}
        </div>
        {look.filter ? <SliderRow label="how much" min={0} max={100} value={look.intensity} onChange={(v) => onChange({ intensity: v })} ariaLabel="how much of the look" display={`${look.intensity}%`} /> : null}
      </Section>
      <Section>
        <Button variant="secondary" size="sm" className="w-full" onClick={() => onPick(IDENTITY_LOOK)} disabled={lookIsIdentity(look)}>
          <Icon icon={IconRestore} size={15} /> back to how it was
        </Button>
        <p className="text-[11px] text-ink-soft">these change how it prints, not your original — that’s always kept.</p>
      </Section>
    </Stack>
  );
}

function LookChip({ label, on, colours, onClick }: { label: string; on: boolean; colours: string[]; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`press flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 py-1.5 text-[11px] font-extrabold ${on ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/20 bg-paper text-cocoa hover:border-cocoa'}`}
    >
      <span aria-hidden className="flex overflow-hidden rounded-md border border-cocoa/20">
        {colours.map((c, i) => (
          <span key={i} className="h-4 w-3.5" style={{ background: c }} />
        ))}
      </span>
      {label}
    </button>
  );
}
