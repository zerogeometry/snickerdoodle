import { Button } from '../primitives/Button';

/**
 * The primary action pinned to the thumb zone on phones (as on the landing page). Render it as a
 * DIRECT child of the page, never inside an animated (pop-in / tilted) ancestor — a transform on an
 * ancestor breaks position:fixed. Includes its own spacer so the page's end isn't hidden under it.
 */
export function ThumbCta({ href, label, note }: { href: string; label: string; note?: string }) {
  return (
    <>
      <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:hidden">
        <Button href={href} size="lg" className="w-full" attention>
          {label}
        </Button>
        {note ? <p className="mt-1.5 pb-1 text-center text-[12px] font-semibold text-ink-soft">{note}</p> : <div className="h-2" />}
      </div>
      <div className="h-28 md:hidden" aria-hidden />
    </>
  );
}
