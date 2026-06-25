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
        'relative inline-flex h-6 w-[42px] shrink-0 items-center rounded-full transition-colors',
        on ? 'bg-cinnamon' : 'bg-[#D7C4A6]',
      )}
    >
      <span
        className={cn(
          'inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform',
          on ? 'translate-x-[21px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}
