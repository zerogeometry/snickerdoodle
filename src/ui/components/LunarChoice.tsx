'use client';

/**
 * "This birthday follows…" — the Gregorian calendar, or the lunar one (founder, 27 Oct: many Chinese,
 * Korean and Vietnamese families keep birthdays on the lunar calendar). The date entered is still the
 * day it happened; a lunar one is kept on that same lunar day every year (src/server/occasions/dates.ts).
 */
export type LunarValue = 'CHINESE' | 'KOREAN' | null;
const OPTIONS: { value: LunarValue; label: string }[] = [
  { value: null, label: 'the calendar' },
  { value: 'CHINESE', label: 'lunar (Chinese / Vietnamese)' },
  { value: 'KOREAN', label: 'lunar (Korean)' },
];

export function LunarChoice({ value, onChange, label = 'this birthday follows' }: { value: LunarValue; onChange: (v: LunarValue) => void; label?: string }) {
  return (
    <fieldset className="mt-3">
      <legend className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`press min-h-11 rounded-pill border-2 px-3.5 text-xs font-bold ${value === o.value ? 'border-cocoa bg-cocoa text-paper' : 'border-cocoa/25 bg-paper text-cocoa'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value ? <p className="mt-1.5 text-[11px] text-ink-soft">we’ll keep it on the same lunar day each year — a different date on the calendar every time.</p> : null}
    </fieldset>
  );
}
