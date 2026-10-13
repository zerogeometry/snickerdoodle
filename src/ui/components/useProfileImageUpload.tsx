'use client';

import { useRef, useState, type ReactNode } from 'react';
import { normalizeUpload, toast } from '@/lib/store';
import { uploadProfileImageAction } from '@/app/actions/profile';
import type { ProfileImageKind } from '@/server/profile';

/**
 * Pick → shrink (big phone photos are scaled down in the browser first) → upload one profile
 * image. Returns the hidden <input> to render, a `pick()` to open it, and `busy`.
 */
export function useProfileImageUpload(kind: ProfileImageKind, onDone?: () => void): { input: ReactNode; pick: () => void; busy: boolean } {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { dataUrl, name } = await normalizeUpload(String(reader.result), file.name);
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const fd = new FormData();
        fd.append('kind', kind);
        fd.append('image', blob, name);
        const res = await uploadProfileImageAction(fd);
        if (!res.ok) {
          toast(res.reason === 'too-big' ? 'that one’s a bit big — try a smaller photo' : res.reason === 'not-an-image' ? 'that doesn’t look like a photo we can use' : 'that didn’t upload — try again');
          return;
        }
        toast(res.pending ? 'saved — your family will see it once our safety check is done' : 'looking good ✓');
        onDone?.();
      } catch {
        toast('that didn’t upload — try again');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return {
    input: <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onChange} aria-hidden tabIndex={-1} />,
    pick: () => ref.current?.click(),
    busy,
  };
}
