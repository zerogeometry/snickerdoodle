import type { CSSProperties } from 'react';
import { makeFlakes } from '@/lib/snow';
import { cn } from '../cn';

/**
 * Christmas snow (founder, 13 Nov 2026): the founder's crayon snowflake in white, with a very faint shadow so
 * it shows on the oat page (public/textures/snowflake.webp + snow-dot.webp, scripts/textures/build-snow.mjs).
 * Decorative only: aria-hidden, pointer-events none, behind the content.
 *
 * CSS only, transform only (globals.css "Christmas snow"): each flake falls at a steady speed with the breeze
 * carrying it sideways (the outer span), while it sways, turns and tumbles (the inner span, on the separate
 * translate / rotate / scale properties so the three never fight). Distances are in container units, so the
 * same flakes fill the viewport (scope "page") or one section (scope "section"). Reduced motion: the snow
 * stays put, scattered where it lies.
 */
const FLAKES = makeFlakes();

export function SnowLayer({ scope, className }: { scope: 'page' | 'section'; className?: string }) {
  return (
    <div aria-hidden className={cn('snowfall', scope === 'page' ? 'snowfall-page' : 'snowfall-section', className)}>
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="snow-fall"
          data-lite={f.lite || undefined}
          style={
            {
              left: `${f.x}%`,
              '--size': `${f.size}px`,
              '--fall': `${f.fall}s`,
              '--at': `${-f.at}s`,
              '--drift': `${f.drift}px`,
              '--rest': `${f.rest}cqh`,
              opacity: f.opacity,
            } as CSSProperties
          }
        >
          <span
            className={f.kind === 'flake' ? 'snow-flake' : 'snow-dot'}
            style={
              {
                '--sway': `${f.sway}px`,
                '--sway-dur': `${f.swayDur}s`,
                '--spin': `${Math.abs(f.spin)}s`,
                '--spin-dir': f.spin < 0 ? 'reverse' : 'normal',
                '--tumble': `${f.tumble}s`,
                '--turn': `${(i * 47) % 360}deg`,
              } as CSSProperties
            }
          />
        </span>
      ))}
    </div>
  );
}
