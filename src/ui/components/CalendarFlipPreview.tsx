'use client';

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { CALENDAR_PAGE_COUNT, CALENDAR_YEAR, monthWeeks, pageLabel } from '@/lib/calendar';
import { clampTransform, computeLayerRect, type TemplateGeom } from '@/server/print/geometry';
import type { PackCardLine } from '@/lib/store';

/**
 * The calendar FLIP-THROUGH: the cover, then each month, one page at a time — like lifting the
 * pages of the real thing on the wall. The picture is laid out with the SAME shared geometry the
 * print renderer uses (computeLayerRect on the page's print area), so where the drawing sits here is
 * where it prints. The date grid under each month is illustrative — Prodigi prints the real 2027 one.
 *
 * Not in /mockups — extends the Scrapbook language (a taped polaroid page, ink chips, ≥44px arrows).
 * Keyboard: ← / → turn the page; a swipe does too. The page change pops in (pop-in), still under
 * prefers-reduced-motion. `page` is controlled so the builder's page grid can jump here.
 */
const WEEKDAYS = ['m', 't', 'w', 't', 'f', 's', 's'];

export function CalendarFlipPreview({
  pages,
  imageFor,
  dimsFor,
  geom,
  page,
  onPage,
  ground = '#ffffff',
}: {
  /** All 13 pages, filled (null only while nothing is chosen yet). */
  pages: ReadonlyArray<PackCardLine | null>;
  imageFor: (p: PackCardLine) => string | null;
  dimsFor: (p: PackCardLine) => { width: number; height: number } | null;
  geom: TemplateGeom | null;
  page: number;
  onPage: (i: number) => void;
  /** the page's base colour under the drawing (#rrggbb) */
  ground?: string;
}) {
  const swipe = useRef<number | null>(null);
  const [turns, setTurns] = useState(0); // re-keys the page so each turn pops in
  const go = (i: number) => {
    const next = Math.max(0, Math.min(CALENDAR_PAGE_COUNT - 1, i));
    if (next === page) return;
    setTurns((t) => t + 1);
    onPage(next);
  };
  const p = pages[page] ?? null;
  const month = page - 1; // -1 = the cover
  const name = page === 0 ? 'the cover' : `${pageLabel(page)} ${CALENDAR_YEAR}`;

  return (
    <section aria-label="flip through your calendar" aria-roledescription="carousel" className="select-none">
      <div
        className="relative mx-auto max-w-md touch-pan-y"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(page + 1);
          else if (e.key === 'ArrowLeft') go(page - 1);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          swipe.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (swipe.current === null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 40) go(page + (dx < 0 ? 1 : -1));
        }}
        aria-label={`${name}, page ${page + 1} of ${CALENDAR_PAGE_COUNT} — use the arrow keys to turn the page`}
      >
        {/* the wire binding along the top, like the real calendar */}
        <div aria-hidden className="relative z-10 mx-6 -mb-2 flex justify-between">
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className="h-4 w-1.5 rounded-full border-2 border-cocoa/70 bg-paper-2" />
          ))}
        </div>
        <div key={turns} className="pop-in polaroid !p-2.5" style={{ ['--tilt' as string]: page % 2 ? '0.6deg' : '-0.6deg', ['--pop-rot' as string]: '0deg' }}>
          <PicturePage page={p} imageFor={imageFor} dimsFor={dimsFor} geom={geom} label={name} ground={ground} />
          {month >= 0 ? <DatePad monthIndex={month} /> : (
            <p className="mt-2 text-center text-[11px] font-bold text-ink-soft">the cover · the twelve months are underneath</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page === 0}
          aria-label="previous page"
          className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa shadow-[0_2px_0_var(--color-cocoa)] disabled:opacity-40"
        >
          <Icon icon={IconChevronLeft} size={18} />
        </button>
        <p className="min-w-32 text-center text-sm font-extrabold text-cocoa" aria-live="polite">
          {name}
          <span className="block text-[11px] font-bold text-ink-faint">
            page {page + 1} of {CALENDAR_PAGE_COUNT}
          </span>
        </p>
        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page === CALENDAR_PAGE_COUNT - 1}
          aria-label="next page"
          className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa shadow-[0_2px_0_var(--color-cocoa)] disabled:opacity-40"
        >
          <Icon icon={IconChevronRight} size={18} />
        </button>
      </div>
    </section>
  );
}

/** The picture page: the drawing placed on the print area exactly as the renderer will place it. */
function PicturePage({
  page,
  imageFor,
  dimsFor,
  geom,
  label,
  ground,
}: {
  ground: string;
  page: PackCardLine | null;
  imageFor: (p: PackCardLine) => string | null;
  dimsFor: (p: PackCardLine) => { width: number; height: number } | null;
  geom: TemplateGeom | null;
  label: string;
}) {
  const aspect = geom ? geom.printWidthPx / geom.printHeightPx : 297 / 210;
  const url = page ? imageFor(page) : null;
  const src = page ? dimsFor(page) : null;
  const r = page && geom && src ? computeLayerRect(geom, src, clampTransform(page.transform)) : null;
  // the layer box is the drawing AFTER rotation; the <img> is drawn upright and turned about its centre
  const swap = r ? r.rotationDeg % 180 !== 0 : false;
  const rect = r
    ? { ...r, x: r.x + r.width / 2 - (swap ? r.height : r.width) / 2, y: r.y + r.height / 2 - (swap ? r.width : r.height) / 2, width: swap ? r.height : r.width, height: swap ? r.width : r.height }
    : null;
  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: String(aspect), background: ground }}>
      {url && rect ? (
        <img
          src={url}
          alt={`your drawing on ${label}`}
          className="absolute max-w-none"
          style={{
            left: `${(rect.x / rect.canvasWidth) * 100}%`,
            top: `${(rect.y / rect.canvasHeight) * 100}%`,
            width: `${(rect.width / rect.canvasWidth) * 100}%`,
            height: `${(rect.height / rect.canvasHeight) * 100}%`,
            ...(rect.rotationDeg ? { rotate: `${rect.rotationDeg}deg` } : {}),
          }}
        />
      ) : url ? (
        <img src={url} alt={`your drawing on ${label}`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-paper-2 text-xs font-bold text-ink-faint">
          {page ? 'your drawing' : 'pick a drawing to see it here'}
        </div>
      )}
    </div>
  );
}

/** An illustrative month grid (Monday first) — Prodigi prints the real one under the picture. */
function DatePad({ monthIndex }: { monthIndex: number }) {
  const weeks = monthWeeks(CALENDAR_YEAR, monthIndex);
  return (
    <div aria-hidden className="mt-2 border-t-2 border-dashed border-cocoa/15 px-1 pt-2">
      <p className="text-center font-display text-sm font-extrabold lowercase text-cocoa">
        {pageLabel(monthIndex + 1)} <span className="text-ink-faint">{CALENDAR_YEAR}</span>
      </p>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5 text-center text-[10px] leading-4 text-ink-soft">
        {WEEKDAYS.map((d, i) => (
          <span key={`h${i}`} className="font-extrabold text-ink-faint">
            {d}
          </span>
        ))}
        {weeks.flat().map((d, i) => (
          <span key={i} className={i % 7 >= 5 ? 'text-cinnamon' : undefined}>
            {d ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}
