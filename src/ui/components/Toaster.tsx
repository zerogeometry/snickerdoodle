'use client';

import { useToasts } from '@/lib/store';

/** Renders transient confirmation toasts (e.g. "kept to your keepsake box"). */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto rounded-full bg-cocoa px-4 py-2.5 text-[13px] font-semibold text-oat shadow-[0_8px_24px_rgba(46,39,35,.28)]"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
