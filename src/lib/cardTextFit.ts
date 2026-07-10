/**
 * Deterministic shrink-to-fit for the greetings-card inside text — the SINGLE source of truth
 * shared by the browser preview (CardInsidePreview) and the print renderer (cardText.ts), so the
 * two can never disagree about how big the text ends up.
 *
 * The card's four inside fields all start at ONE base size (so the S/M/L control is consistent
 * across every panel — no field is arbitrarily bigger than another). A field, or a group of
 * fields sharing a panel, then shrinks BELOW that base only when it would otherwise overflow its
 * panel — so a long verse fits instead of clipping, while short text stays at the consistent base.
 *
 * Unit-agnostic: pass the box + base size in the SAME unit (px for print, cqw for the preview) and
 * the fitted size comes back in that unit. Because the width dimension is expressed as the same
 * fraction of the panel in both systems, preview and print compute the same fitted ratio (any
 * residual difference is the ~2% panel-aspect approximation between the preview spread and the
 * print artboard — imperceptible, and the clip backstops on both sides catch the remainder).
 *
 * Line counting uses a real GREEDY word-wrap (words never split; a word longer than a line breaks
 * across ⌈len/cpl⌉ lines, matching the preview's `break-words` and satori). That makes the estimate
 * an OVER-count of the true line count (line-ends waste a little space), so it errs toward shrinking
 * a touch more than strictly needed — never toward letting text overflow.
 */

/** Greedy word-wrap line count for one field's text at a given chars-per-line budget. */
export function wrapLineCount(text: string, charsPerLine: number): number {
  const cpl = Math.max(1, Math.floor(charsPerLine));
  let lines = 0;
  for (const para of (text ?? '').split(/\r?\n/)) {
    const words = para.trim().length ? para.trim().split(/\s+/) : [];
    if (words.length === 0) {
      lines += 1; // a blank line still occupies a row
      continue;
    }
    let col = 0; // chars used on the current line
    for (const w of words) {
      const wl = w.length;
      if (wl > cpl) {
        // a single word longer than a line breaks across several lines (CSS break-word / satori)
        if (col > 0) lines += 1; // close the current line first
        lines += Math.ceil(wl / cpl);
        col = 0; // conservatively start the next word on a fresh line
      } else if (col === 0) {
        col = wl;
      } else if (col + 1 + wl <= cpl) {
        col += 1 + wl; // a space + the word still fit
      } else {
        lines += 1; // wrap to a new line
        col = wl;
      }
    }
    if (col > 0) lines += 1; // the paragraph's final line
  }
  return Math.max(1, lines);
}

export function fitCardFontSize(
  segments: readonly string[],
  boxW: number,
  boxH: number,
  baseSize: number,
  opts?: { lineHeight?: number; avgCharWidthEm?: number; gapLines?: number },
): number {
  const lineHeight = opts?.lineHeight ?? 1.3;
  const avg = opts?.avgCharWidthEm ?? 0.5; // conservative average glyph advance, as a fraction of em
  const gapLines = opts?.gapLines ?? 0; // blank-line-equivalents of spacing BETWEEN adjacent fields
  const segs = segments.map((s) => (s ?? '').trim()).filter(Boolean);
  if (segs.length === 0 || boxW <= 0 || boxH <= 0 || baseSize <= 0) return baseSize;

  const totalLinesAt = (fs: number): number => {
    // chars that fit on one line at this size (× 0.94 for a little font-width safety margin)
    const cpl = (boxW / (avg * fs)) * 0.94;
    let lines = 0;
    segs.forEach((seg, i) => {
      lines += wrapLineCount(seg, cpl);
      if (i < segs.length - 1) lines += gapLines;
    });
    return lines;
  };
  const fitsAt = (fs: number): boolean => totalLinesAt(fs) * lineHeight * fs <= boxH;

  if (fitsAt(baseSize)) return baseSize; // short text: stays at the consistent base
  // binary-search the largest size in (baseSize·0.05, baseSize] that fits
  let lo = baseSize * 0.05;
  let hi = baseSize;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (fitsAt(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
