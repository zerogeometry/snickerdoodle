import { IconSearch } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';

/**
 * "reading your image" (founder, 26 Oct): the moment between choosing a photo and its stored (table-
 * trimmed) drawing appearing — or an edit's new picture loading. A blank taped polaroid with a crayon
 * scan line sweeping down it and a magnifier bobbing beside it. CSS only (transform/opacity — see
 * `.reading-*` in globals.css); under prefers-reduced-motion it simply sits still.
 */
export function ReadingImageLoader() {
  return (
    <div role="status" className="relative mx-auto w-[14rem] max-w-full md:w-[16rem]">
      <div className="polaroid tape loader-bob relative" style={{ ['--tilt' as string]: '-1.5deg' }}>
        <div className="relative aspect-[4/5] overflow-hidden bg-paper-2">
          <span aria-hidden className="reading-scan absolute inset-x-3 top-0 h-1.5 rounded-full bg-honey" />
          <span aria-hidden className="absolute inset-x-6 top-[30%] h-1 rounded-full bg-line/70" />
          <span aria-hidden className="absolute inset-x-10 top-[45%] h-1 rounded-full bg-line/70" />
          <span aria-hidden className="absolute inset-x-8 top-[60%] h-1 rounded-full bg-line/70" />
        </div>
        <span aria-hidden className="reading-glass absolute -bottom-3 -right-4 flex size-11 items-center justify-center rounded-full bg-sky text-cocoa shadow-[0_3px_0_rgb(43_33_24/0.2)]">
          <Icon icon={IconSearch} size={22} />
        </span>
      </div>
      <p className="mt-6 text-center font-display text-lg text-cocoa">reading your image</p>
    </div>
  );
}
