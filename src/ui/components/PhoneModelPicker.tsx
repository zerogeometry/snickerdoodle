'use client';

import { IconCheck, IconDeviceMobile, IconSearch } from '@tabler/icons-react';
import { useId, useMemo, useRef, useState } from 'react';
import { PHONE_MODELS, searchPhones, type PhoneModel } from '@/lib/phone-cases';
import { Icon } from '@/ui/primitives/Icon';

/**
 * "Which phone?" — type and pick. Matches however people type it ("16 pro", "s24u", "samsung
 * s25+"), newest first; a phone we can't make for says so plainly. A wrong model is a ruined,
 * personalised case, so the chosen phone stays on show with where-to-check help. An ARIA combobox:
 * arrows move, Enter picks, Escape closes; 16px text so phones don't zoom the page.
 */
export function PhoneModelPicker({ value, onChange }: { value: string | null; onChange: (model: string) => void }) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchPhones(query), [query]);
  const chosen = PHONE_MODELS.find((m) => m.name === value) ?? null;

  const pick = (m: PhoneModel) => {
    onChange(m.name);
    setQuery('');
    setOpen(false);
    setActive(0);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const typed = query.trim().length > 0;
  return (
    <div className="mt-5">
      <label htmlFor={`${id}-input`} className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
        Your phone
      </label>
      <div className="relative mt-2">
        <Icon icon={IconSearch} size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-expanded={open && typed}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={chosen ? 'type to change phone…' : 'type your phone, e.g. iPhone 16 Pro'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="block min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper pl-10 pr-3 text-base text-cocoa placeholder:text-ink-faint focus:border-cocoa"
        />
        {open && typed ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="matching phones"
            className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-auto rounded-[14px] border-2 border-cocoa bg-paper p-1 shadow-[0_4px_0_var(--color-cocoa)]"
          >
            {results.length === 0 ? (
              <li role="option" aria-selected={false} aria-disabled className="px-3 py-3 text-sm text-ink-soft">
                <b className="text-cocoa">we can&apos;t make a case for that phone yet</b>
                <br />
                we cover recent iPhone, Samsung Galaxy S and Google Pixel — and we&apos;re adding more.
              </li>
            ) : (
              results.map((m, i) => (
                <li
                  key={m.name}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown (not click) so it lands before the input's blur closes the list
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(m);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-[10px] px-3 text-sm font-bold ${i === active ? 'bg-honey-band text-cocoa' : 'text-ink-soft'}`}
                >
                  <span>{m.name}</span>
                  {m.name === value ? <Icon icon={IconCheck} size={16} className="text-green-save" /> : null}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      {chosen ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-soft" aria-live="polite">
          <Icon icon={IconDeviceMobile} size={15} className="mt-px shrink-0 text-cocoa" />
          <span>
            for <b className="text-cocoa">{chosen.name}</b> — not sure?{' '}
            {chosen.brand === 'Apple' ? 'Settings → General → About → Model Name' : 'Settings → About phone'}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-soft">pick your exact phone — a case only fits the model it&apos;s made for.</p>
      )}
    </div>
  );
}
