/**
 * The customize page's one-tap print-quality fix ("make it 8×10″ — prints beautifully", "crisp right
 * up close at …"): the LARGEST size that passes `ok` — but only one that really gives the drawing MORE
 * detail than the current size. A big frame is judged at a lower gate dpi, so it can "pass" while
 * printing softer (02-B8): it is never offered as the crisper choice, and never as an upsell.
 * Products whose "size" is a phone MODEL never get a size offered at all (02-B2). Client-safe.
 */
export interface SizeQuality {
  effectiveDpi: number;
  decision: 'OK' | 'UPSCALE' | 'BLOCK';
  softUpClose: boolean;
}

export function betterSize(
  sizes: readonly string[],
  assessAt: (size: string) => SizeQuality | null,
  current: SizeQuality | null,
  ok: (a: SizeQuality) => boolean,
  opts: { sizeIsModel?: boolean } = {},
): string | null {
  if (opts.sizeIsModel || !current) return null;
  return (
    [...sizes].reverse().find((sz) => {
      const a = assessAt(sz);
      return a !== null && a.effectiveDpi > current.effectiveDpi && ok(a);
    }) ?? null
  );
}
