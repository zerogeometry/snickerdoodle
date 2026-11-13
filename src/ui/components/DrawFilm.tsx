'use client';
import {
  IconMaximize,
  IconMinimize,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRefresh,
  IconVolume,
  IconVolumeOff,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { DRAW_VIDEO } from '@/lib/drawApp';
import { cn } from '../cn';
import { Icon } from '../primitives/Icon';

/**
 * The /draw film, in a taped polaroid, with our own controls in the Scrapbook language (founder, 13 Nov 2026:
 * not the browser's grey bar). Nothing loads until a parent presses play (preload="none"), never autoplays,
 * self-hosted. Before it starts: the poster and a big tomato play sticker. Playing: a paper pill along the
 * bottom (play/pause, a honey progress line you can drag, the time, sound, full screen). On a mouse it tucks
 * away while the film plays and comes back when the pointer is over the film; on touch screens and with the
 * keyboard it stays. At the end: "watch again". No timers drive anything: the video's own events do.
 *
 * Without a film (DRAW_VIDEO.src null) it's a placeholder: the poster and "film coming soon", nothing to press.
 */
export function DrawFilm({ className }: { className?: string }) {
  const { src, poster, width, height, title } = DRAW_VIDEO;
  return (
    <div className={cn('mx-auto w-full max-w-[560px]', className)}>
      <div className="polaroid tape rounded-[14px]" style={{ ['--tilt' as string]: '1.2deg', ['--tape' as string]: 'color-mix(in srgb, var(--color-sky) 80%, transparent)' }}>
        {src ? (
          <FilmPlayer src={src} poster={poster} width={width} height={height} title={title} />
        ) : (
          <div className="relative overflow-hidden rounded-[10px] bg-paper" style={{ aspectRatio: `${width} / ${height}` }}>
            <img src={poster} alt="" width={width} height={height} loading="lazy" decoding="async" className="block size-full object-cover opacity-70" />
            <div className="absolute inset-x-0 bottom-[9%] flex flex-col items-center gap-2.5">
              <span aria-hidden className="sticker flex size-16 items-center justify-center rounded-full bg-cta text-cta-text md:size-[72px]">
                <Icon icon={IconPlayerPlayFilled} size={30} className="translate-x-0.5" />
              </span>
              <span className="rounded-pill bg-cocoa px-3 py-1 text-[12px] font-extrabold lowercase text-paper">film coming soon</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** "0:07" */
function clock(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

type Phase = 'ready' | 'playing' | 'paused' | 'ended';

function FilmPlayer({ src, poster, width, height, title }: { src: string; poster: string; width: number; height: number; title: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [now, setNow] = useState(0);
  const [length, setLength] = useState(26); // the film's length until its own metadata arrives
  const [muted, setMuted] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onFull = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, []);

  const play = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.ended) v.currentTime = 0;
    void v.play().catch(() => setPhase('paused'));
  }, []);
  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused || v.ended) play();
    else v.pause();
  }, [play]);

  const toggleMute = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFull = () => {
    const f = frame.current;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!f || !v) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (f.requestFullscreen) void f.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.(); // iPhone: only the video itself can go full screen
  };

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = t;
    setNow(t);
  };

  // the keys people expect from a video: space / k to play or pause, ← → to skip 5s, m for sound, f for full
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return; // the slider has its own
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') {
      if (e.target instanceof HTMLButtonElement) return; // a focused button already presses on space
      e.preventDefault();
      toggle();
    } else if (k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
      seek(Math.min(length, Math.max(0, now + (k === 'arrowleft' ? -5 : 5))));
    } else if (k === 'm') toggleMute();
    else if (k === 'f') toggleFull();
  };

  const started = phase !== 'ready';
  const p = length ? Math.min(1, now / length) : 0;

  return (
    <div
      ref={frame}
      role="group"
      aria-label={title}
      onKeyDown={onKey}
      data-phase={phase}
      className={cn('film relative overflow-hidden rounded-[10px] bg-paper', full && 'film-full')}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <video
        ref={video}
        preload="none"
        playsInline
        poster={poster}
        aria-label={title}
        className="block size-full bg-paper object-contain"
        onClick={started ? toggle : play}
        onPlay={() => setPhase('playing')}
        onPause={() => setPhase((ph) => (ph === 'ended' ? ph : 'paused'))}
        onEnded={() => setPhase('ended')}
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
      >
        <source src={src} type="video/mp4" />
      </video>

      {/* before it starts, and at the end: one big sticker in the middle */}
      {(phase === 'ready' || phase === 'ended') && (
        <button
          type="button"
          onClick={play}
          aria-label={phase === 'ended' ? `watch ${title} again` : `play ${title}`}
          className="group absolute inset-0 flex flex-col items-center justify-center gap-4 bg-cocoa/10"
        >
          <span aria-hidden className="press sticker flex size-[72px] items-center justify-center rounded-full bg-cta text-cta-text group-active:translate-y-1 md:size-20">
            <Icon icon={phase === 'ended' ? IconRefresh : IconPlayerPlayFilled} size={phase === 'ended' ? 32 : 34} stroke={2.5} className={phase === 'ended' ? '' : 'translate-x-0.5'} />
          </span>
          <span aria-hidden className="rounded-pill border-2 border-cocoa bg-paper px-3 py-1 text-[13px] font-extrabold lowercase text-cocoa shadow-[0_2px_0_var(--color-cocoa)]">
            {phase === 'ended' ? 'watch again' : `watch the film · ${clock(length)}`}
          </span>
        </button>
      )}

      {/* playing or paused: the paper pill along the bottom */}
      {(phase === 'playing' || phase === 'paused') && (
        <div className="film-bar absolute inset-x-2 bottom-2 flex items-center gap-1 rounded-pill border-2 border-cocoa bg-paper p-0.5 pr-1 shadow-[0_3px_0_var(--color-cocoa)]">
          <button
            type="button"
            onClick={toggle}
            aria-label={phase === 'playing' ? 'pause' : 'play'}
            className="press flex size-11 shrink-0 items-center justify-center rounded-full bg-cta text-cta-text"
          >
            <Icon icon={phase === 'playing' ? IconPlayerPauseFilled : IconPlayerPlayFilled} size={20} className={phase === 'playing' ? '' : 'translate-x-px'} />
          </button>
          <input
            type="range"
            min={0}
            max={length}
            step={0.1}
            value={now}
            onChange={(e) => seek(Number(e.currentTarget.value))}
            aria-label="where in the film"
            aria-valuetext={`${clock(now)} of ${clock(length)}`}
            className="film-track min-w-0 flex-1"
            style={{ '--p': p } as CSSProperties}
          />
          <span className="film-time shrink-0 text-[13px] font-bold tabular-nums text-ink-soft">
            {clock(now)}
            <span className="film-length"> / {clock(length)}</span>
          </span>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'sound on' : 'sound off'}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-cocoa hover:bg-paper-2"
          >
            <Icon icon={muted ? IconVolumeOff : IconVolume} size={22} />
          </button>
          <button
            type="button"
            onClick={toggleFull}
            aria-label={full ? 'leave full screen' : 'full screen'}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-cocoa hover:bg-paper-2"
          >
            <Icon icon={full ? IconMinimize : IconMaximize} size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
