'use client';

import { IconX } from '@tabler/icons-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible modal dialog — dimmed backdrop, Escape/backdrop to close, scrollable
 * body, and a focus TRAP that returns focus to the trigger on close (NN7). */
const SIZE = { sm: 'max-w-[440px]', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  headerLeading,
  children,
  footer,
  size = 'sm',
  fill = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerLeading?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZE;
  /** Lock the dialog to a constant tall height (body scrolls inside) so its size doesn't
   * jump as content changes — e.g. the Full Catalogue while you search/filter. */
  fill?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
        : [];
    // Move focus into the dialog on open.
    (focusables()[0] ?? dialog)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        dialog?.focus();
        return;
      }
      const first = els[0]!;
      const last = els[els.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.(); // restore focus to whatever opened the modal
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-cocoa/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative z-10 flex ${fill ? 'h-[85vh]' : 'max-h-[90vh]'} w-full ${SIZE[size]} flex-col overflow-hidden rounded-2xl bg-[#FFFDF8] shadow-[0_20px_50px_rgba(46,39,35,.28)] focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="flex items-center gap-3">
            {headerLeading}
            <div>
              <h2 className="font-display text-lg font-semibold text-cocoa">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-xs text-[#9C8E7E]">{subtitle}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-[#B3A491] hover:bg-[#F2EADB]"
          >
            <Icon icon={IconX} size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>
        {footer ? <div className="border-t border-[#F2EADB] px-5 pb-5 pt-3">{footer}</div> : null}
      </div>
    </div>
  );
}
