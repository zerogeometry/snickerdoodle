'use client';

import { IconHeartPlus, IconLock, IconRefresh } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { keepTargetsAction } from '@/app/actions/keep';
import { keepPhotoFile } from '@/lib/keepPhoto';
import { TOO_MANY_COPY } from '@/lib/rateLimitCopy';
import { toast } from '@/lib/store';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import type { VisibilityTier } from '@/domain/types';

/** Up to this many at a time — a big camera-roll pick still goes in, in a couple of goes. */
export const KEEP_AT_ONCE = 20;

const WHO_CAN_SEE: { tier: VisibilityTier; label: string }[] = [
  { tier: 'ONLY_ME', label: 'only me — no one else' },
  { tier: 'HOME', label: 'home — you and the grown-ups at home' },
  { tier: 'FAMILY', label: 'family — home and the family circle' },
  { tier: 'EXTENDED', label: 'extended family — everyone you’ve invited' },
];

type Targets = { state: 'loading' } | { state: 'error' } | { state: 'ready'; children: { id: string; firstName: string }[] };

const field = 'min-h-12 w-full rounded-[14px] border-2 border-cocoa/20 bg-paper px-3 text-[15px] font-bold text-cocoa focus-visible:border-cobalt disabled:opacity-60';
const lab = 'mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint';

/**
 * "keep" (founder, 17 Nov 2026): snap a drawing or pick lots from the photos, and put them straight in the
 * keepsake box — no product needed. One tap opens the phone's OWN picker (camera or library, many at once —
 * the same native picker as every other upload); then one window to choose whose corner they go in and who
 * can see them, BEFORE they're added. Each photo takes the usual road: private bucket, EXIF strip, the safety
 * checks, then kept (src/lib/keepPhoto.ts) — and the server re-decides the corner + who sees it (src/authz).
 *
 * Render-prop: `children(pick, busy)` draws the trigger (the tab bar's "keep", the keepsake page's button).
 */
export function KeepPhotos({ children }: { children: (pick: () => void, busy: boolean) => ReactNode }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[] | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [targets, setTargets] = useState<Targets>({ state: 'loading' });
  const [childId, setChildId] = useState('');
  const [visibility, setVisibility] = useState<VisibilityTier>('FAMILY'); // privacy by default: never wider
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [partial, setPartial] = useState<{ kept: number; of: number; blocked: number } | null>(null);
  const busy = progress !== null;

  // little previews of what they picked (made in the browser, let go when the window closes)
  useEffect(() => {
    if (!files) return;
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const loadTargets = () => {
    setTargets({ state: 'loading' });
    keepTargetsAction()
      .then((r) => {
        if (r.needsAuth) {
          setFiles(null);
          toast('sign in to keep your drawings');
          router.push('/login?next=' + encodeURIComponent('/home'));
          return;
        }
        setTargets(r.ok ? { state: 'ready', children: r.children } : { state: 'error' });
      })
      .catch(() => setTargets({ state: 'error' }));
  };

  const pick = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/') || f.type === '');
    e.target.value = ''; // the same photos can be picked again
    if (all.length === 0) return;
    if (all.length > KEEP_AT_ONCE) toast(`up to ${KEEP_AT_ONCE} at a time — here are the first ${KEEP_AT_ONCE}`);
    setPartial(null);
    setFiles(all.slice(0, KEEP_AT_ONCE));
    loadTargets();
  };

  const close = () => {
    if (busy) return;
    setFiles(null);
    setPartial(null);
  };

  const keepAll = async () => {
    if (!files || busy) return;
    const of = files.length;
    setProgress({ done: 0, of });
    let kept = 0;
    let notFiled = 0;
    let blocked = 0;
    const left: File[] = [];
    for (const f of files) {
      const res = await keepPhotoFile(f, { visibility, childId: childId || null });
      if (res.needsAuth) {
        setProgress(null);
        setFiles(null);
        toast('sign in to keep your drawings');
        router.push('/login?next=' + encodeURIComponent('/home'));
        return;
      }
      if (res.ok) {
        kept++;
        if (childId && res.filed === false) notFiled++;
      } else {
        left.push(f);
        if (res.blocked) blocked++;
        if (res.tooMany) {
          toast(TOO_MANY_COPY);
          left.push(...files.slice(files.indexOf(f) + 1));
          break;
        }
      }
      setProgress({ done: kept + left.length, of });
    }
    setProgress(null);
    if (kept > 0) router.refresh();
    if (left.length === 0) {
      setFiles(null);
      toast(kept === 1 ? 'kept in your keepsake box ♥' : `${kept} kept in your keepsake box ♥`);
      if (notFiled) toast('kept — but we couldn’t file them, so they’re in “not yet filed”');
      return;
    }
    // some didn't go in: say so, and offer the rest again (never a silent drop)
    setPartial({ kept, of, blocked });
    setFiles(left);
  };

  const n = files?.length ?? 0;
  const kids = targets.state === 'ready' ? targets.children : [];

  return (
    <>
      {/* the phone's own picker: camera or photo library, many at once (a computer: its file window) */}
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={onPicked} className="hidden" aria-hidden tabIndex={-1} data-testid="keep-input" />
      {children(pick, busy)}
      <Modal
        open={files !== null}
        onClose={close}
        dismissible={!busy}
        title="add to your keepsake box"
        subtitle={partial ? undefined : n === 1 ? '1 picture' : `${n} pictures`}
        footer={
          <div className="flex flex-col gap-2">
            {progress ? (
              <div aria-live="polite" className="text-center text-xs font-bold text-ink-soft">
                keeping {Math.min(progress.done + 1, progress.of)} of {progress.of}…
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-2" aria-hidden>
                  <div className="h-full rounded-full bg-leaf transition-[width]" style={{ width: `${(progress.done / progress.of) * 100}%` }} />
                </div>
              </div>
            ) : null}
            <Button size="lg" className="w-full" onClick={() => void keepAll()} disabled={busy || n === 0} aria-busy={busy} data-testid="keep-confirm">
              <Icon icon={IconHeartPlus} size={18} />
              {busy ? 'keeping…' : partial ? (n === 1 ? 'try that one again' : `try those ${n} again`) : n === 1 ? 'keep it' : `keep all ${n}`}
            </Button>
          </div>
        }
      >
        {partial ? (
          <div role="alert" className="mb-3 rounded-[14px] border-2 border-berry bg-berry-pale p-3 text-[13px] text-cocoa">
            <b>
              {partial.kept} of {partial.of} kept.
            </b>{' '}
            {partial.blocked ? 'we couldn’t use one or more of these pictures. ' : ''}
            the rest are below — give them another go, or close this and they stay on your phone.
          </div>
        ) : null}

        {/* what they picked, as little taped polaroids */}
        <ul className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2 pt-1" aria-label="the pictures you picked">
          {previews.map((src, i) => (
            <li key={src} className="polaroid w-[76px] flex-none" style={{ ['--tilt' as string]: i % 2 ? '2deg' : '-2deg', padding: '4px 4px 6px' }}>
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-paper-2">
                <img src={src} alt={`picture ${i + 1}`} className="h-full w-full object-cover" />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 grid gap-3.5">
          {targets.state === 'loading' ? (
            <div>
              <span className={lab}>whose corner?</span>
              <div className="h-12 animate-pulse rounded-[14px] bg-paper-2" aria-label="finding your little ones…" role="status" />
            </div>
          ) : targets.state === 'error' ? (
            <div className="flex items-center justify-between gap-2 rounded-[14px] border-2 border-dashed border-cocoa/20 p-2.5 text-xs text-ink-soft">
              <span>couldn’t find your little ones just now — they’ll go in “not yet filed”.</span>
              <button type="button" onClick={loadTargets} className="flex min-h-11 shrink-0 items-center gap-1 px-2 font-bold text-cinnamon">
                <Icon icon={IconRefresh} size={14} /> retry
              </button>
            </div>
          ) : kids.length > 0 ? (
            <label>
              <span className={lab}>whose corner?</span>
              <select value={childId} onChange={(e) => setChildId(e.target.value)} disabled={busy} className={field} data-testid="keep-child">
                <option value="">not yet filed</option>
                {kids.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName}&apos;s corner
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-xs text-ink-soft">
              they’ll go in “not yet filed”.{' '}
              <Link href="/family" className="font-bold text-cinnamon">
                add your little ones
              </Link>{' '}
              to give each their own corner.
            </p>
          )}

          <label>
            <span className={lab}>who can see {n === 1 ? 'it' : 'them'}?</span>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as VisibilityTier)} disabled={busy} className={field} data-testid="keep-visibility">
              {WHO_CAN_SEE.map((o) => (
                <option key={o.tier} value={o.tier}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-soft">
          <Icon icon={IconLock} size={13} className="mt-px shrink-0 text-green-save" />
          <span>
            kept private in your family’s box — change who sees each one any time. by keeping, you confirm it’s your little one’s own
            artwork (our <Link href="/trust/terms" className="font-bold text-cinnamon">terms</Link> &amp;{' '}
            <Link href="/trust/privacy" className="font-bold text-cinnamon">privacy notice</Link>).
          </span>
        </p>
      </Modal>
    </>
  );
}
