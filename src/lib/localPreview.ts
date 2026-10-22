'use client';

import { useEffect, useState } from 'react';

/**
 * A SMALL local copy of the drawing for the instant previews (an upload can be a 4500px data
 * URL — repeating that string in twenty tiles would cost the phone hundreds of MB). Made once per
 * drawing, in the browser, as an object URL; nothing leaves the device.
 */
const EDGE = 1000;
const cache = new Map<string, Promise<string>>();

export function localPreviewUrl(dataUrl: string): Promise<string> {
  let p = cache.get(dataUrl);
  if (!p) {
    p = new Promise<string>((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const s = Math.min(1, EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : dataUrl), 'image/png');
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
    // keep only the latest drawing's copy
    for (const [k, old] of cache) {
      if (k === dataUrl) continue;
      cache.delete(k);
      void old.then((u) => u.startsWith('blob:') && URL.revokeObjectURL(u));
    }
    cache.set(dataUrl, p);
  }
  return p;
}

/** The small local copy of this drawing, once made (null meanwhile). */
export function useLocalPreview(dataUrl: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (dataUrl) void localPreviewUrl(dataUrl).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [dataUrl]);
  return url;
}
