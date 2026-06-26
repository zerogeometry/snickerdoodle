'use client';

import { IconX } from '@tabler/icons-react';
import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Accessible modal dialog — dimmed backdrop, Escape/backdrop to close, scrollable body. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  headerLeading,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerLeading?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-cocoa/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex max-h-[90vh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl bg-[#FFFDF8] shadow-[0_20px_50px_rgba(46,39,35,.28)]"
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
            className="-mr-1 -mt-1 rounded-full p-1 text-[#B3A491] hover:bg-[#F2EADB]"
          >
            <Icon icon={IconX} size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-2">{children}</div>
        {footer ? <div className="border-t border-[#F2EADB] px-5 pb-5 pt-3">{footer}</div> : null}
      </div>
    </div>
  );
}
