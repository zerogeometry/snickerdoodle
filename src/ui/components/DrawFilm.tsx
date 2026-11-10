import { IconPlayerPlayFilled } from '@tabler/icons-react';
import { DRAW_VIDEO } from '@/lib/drawApp';
import { cn } from '../cn';
import { Icon } from '../primitives/Icon';

/**
 * The /draw film, in a taped polaroid. Until the film exists (DRAW_VIDEO.src is null) it is a placeholder:
 * the poster with a play sticker and "film coming soon", nothing to press. Once `src` is set it becomes a
 * native player: nothing loads until a parent presses play (preload="none"), never autoplays, self-hosted.
 */
export function DrawFilm({ className }: { className?: string }) {
  const { src, poster, width, height, title } = DRAW_VIDEO;
  return (
    <figure className={cn('mx-auto w-full max-w-[560px]', className)}>
      <div className="polaroid tape rounded-[14px]" style={{ ['--tilt' as string]: '1.2deg', ['--tape' as string]: 'color-mix(in srgb, var(--color-sky) 80%, transparent)' }}>
        <div className="relative overflow-hidden rounded-[10px] bg-paper" style={{ aspectRatio: `${width} / ${height}` }}>
          {src ? (
            <video controls preload="none" playsInline poster={poster} aria-label={title} className="block size-full bg-paper object-cover">
              <source src={src} type="video/mp4" />
            </video>
          ) : (
            <>
              <img src={poster} alt="" width={width} height={height} loading="lazy" decoding="async" className="block size-full object-cover opacity-70" />
              <div className="absolute inset-x-0 bottom-[9%] flex flex-col items-center gap-2.5">
                <span aria-hidden className="sticker flex size-16 items-center justify-center rounded-full bg-cta text-cta-text md:size-[72px]">
                  <Icon icon={IconPlayerPlayFilled} size={30} className="translate-x-0.5" />
                </span>
                <span className="rounded-pill bg-cocoa px-3 py-1 text-[12px] font-extrabold lowercase text-paper">film coming soon</span>
              </div>
            </>
          )}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[13px] text-ink-soft">
        {title}
        {src ? '' : ' (coming soon)'}
      </figcaption>
    </figure>
  );
}
