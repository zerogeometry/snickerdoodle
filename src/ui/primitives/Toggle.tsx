import { cn } from '../cn';

/** An on/off switch. Controlled — pass `on` and `onChange`. */
export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange?.(!on)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-cocoa transition-colors',
        on ? 'bg-cta' : 'bg-paper-2',
      )}
    >
      <span
        className={cn(
          'inline-block h-[18px] w-[18px] rounded-full border-2 border-cocoa bg-white transition-transform duration-300 ease-[var(--ease-pop)]',
          on ? 'translate-x-[22px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}
