import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { assessResolution, clampTransform } from '@/server/print/geometry';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import { isPatternProduct } from '@/lib/patterns';
import { patternLayout, PATTERN_GAP_MM, PATTERN_MOTIF_MM, renderRepeatPattern, scalePatternLayout } from '@/server/print/pattern';
import { patternMotifCentres } from '@/server/print/pattern-geometry';

const T = clampTransform({ scale: 0 });

// A small "drawing": a red blob on transparent, deliberately NOT symmetric (a notch) so a wrong
// rotation or a mirrored seam would show.
async function drawing(w = 120, h = 160): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${w / 2.4}" fill="#c8402a"/><rect x="0" y="0" width="${w / 4}" height="${h / 4}" fill="#2f5da8"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
async function raw(png: Buffer) {
  return sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

describe('patternLayout — the flat sheets and the sock default (founder, 23 Oct)', () => {
  const src = { width: 1600, height: 1200 };
  // (the socks line their drawings up along the sock on Prodigi's template — sockTemplate.test.ts)
  it('the flat sheets (tea towel, wrapping paper): a half-drop repeat CENTRED on the sheet — a whole drawing dead in the middle', () => {
    for (const [w, h, dpi] of [[8208, 5492, 300], [4133, 11811, 150]] as const) {
      const L = patternLayout({ width: w, height: h }, dpi, src, T);
      expect(L.cols).toBeGreaterThan(2);
      const centres = patternMotifCentres(L, { width: w, height: h });
      expect(centres.some((c) => Math.abs(c.x - w / 2) <= 1 && Math.abs(c.y - h / 2) <= 1), `${w}×${h}`).toBe(true);
      // and the two sides match: every copy has its mirror twin across the middle line
      for (const c of centres) expect(centres.some((d) => Math.abs(d.x - (w - c.x)) <= 1.5 && Math.abs(d.y - c.y) <= 1.5), `${w}×${h} @${c.x},${c.y}`).toBe(true);
    }
  });
  it('the default IS 1.0×: touching the zoom or the shift never jumps the pattern; zooming works from there', () => {
    const def = patternLayout({ width: 3543, height: 3543 }, 300, src, T);
    const one = patternLayout({ width: 3543, height: 3543 }, 300, src, clampTransform({ scale: 1 }));
    expect(one).toEqual(def); // the editor's "1.0×" is exactly the default
    const nudged = patternLayout({ width: 3543, height: 3543 }, 300, src, clampTransform({ scale: 1, offsetX: 0.02 }));
    expect(Math.abs(nudged.phaseX - def.phaseX)).toBeLessThan(def.cellW * 0.02); // a nudge moves a nudge
    const small = patternLayout({ width: 3543, height: 3543 }, 300, src, clampTransform({ scale: 0.5 }));
    expect(small.cols * small.rows).toBeGreaterThan(def.cols * def.rows); // zoomed out: more drawings
    expect(small.motifW).toBeLessThan(def.motifW);
  });
});

describe('patternLayout — the seam + scale maths', () => {
  it('every zoom out shrinks the drawing AND adds copies — on every repeat product (founder: socks only shrank)', () => {
    // the real print canvases: ankle + tube socks (300 dpi), tea towel (300 dpi), a 2 m wrap roll (150 dpi)
    const canvases = [
      { w: 3543, h: 3543, dpi: 300 },
      { w: 3543, h: 6141, dpi: 300 },
      { w: 8208, h: 5492, dpi: 300 },
      { w: 4133, h: 11811, dpi: 150 },
    ];
    for (const c of canvases) {
      for (const src of [{ width: 1000, height: 1000 }, { width: 1200, height: 1600 }, { width: 1600, height: 1000 }]) {
        let prev: { count: number; motif: number } | null = null;
        for (let pct = 100; pct >= 34; pct -= 2) {
          const l = patternLayout({ width: c.w, height: c.h }, c.dpi, src, clampTransform({ scale: pct / 100 }));
          const now = { count: l.cols * l.rows, motif: l.motifW };
          if (prev) {
            expect(now.count, `${c.w}×${c.h} @${pct}%`).toBeGreaterThanOrEqual(prev.count); // never fewer
            expect(now.motif, `${c.w}×${c.h} @${pct}%`).toBeLessThanOrEqual(prev.motif); // never bigger
          }
          prev = now;
        }
        // and it really changes: every 30% of zoom out adds copies (the old layout printed the same
        // file from 80% to 50% on an ankle sock). A sock starts at the biggest that fits two along it,
        // so there it takes 40% to make room for a third.
        const step = c.w === 3543 ? 40 : 30;
        for (let pct = 100; pct - step >= 34; pct -= 10) {
          const at = (p: number) => {
            const l = patternLayout({ width: c.w, height: c.h }, c.dpi, src, clampTransform({ scale: p / 100 }));
            return l.cols * l.rows;
          };
          expect(at(pct - step), `${c.w}×${c.h} ${src.width}×${src.height}: ${pct}% → ${pct - step}%`).toBeGreaterThan(at(pct));
        }
      }
    }
  });

  it('THE GAP STAYS PUT (founder, 19 Nov 2026): zooming changes each drawing, never the space between them', () => {
    // the tea towel (300 dpi) and the wrapping rolls (150 dpi); a square, a tall and a wide drawing
    // (not the socks: they have their own fixed gap — sockTemplate.test.ts)
    for (const [w, h, dpi] of [[8208, 5492, 300], [4133, 11811, 150], [4133, 29527, 150]] as const)
      for (const src of [{ width: 1000, height: 1000 }, { width: 1200, height: 1600 }, { width: 1600, height: 1000 }]) {
        const mm = (px: number) => (px / dpi) * 25.4;
        let prevW = 0;
        for (const scale of [0.34, 0.5, 0.75, 1, 1.25, 1.6, 2, 2.6, 3.3]) {
          const l = patternLayout({ width: w, height: h }, dpi, src, clampTransform({ scale }));
          const at = `${w}×${h} ${src.width}×${src.height} @${scale}`;
          // across: the next column's drawing starts one gap after this one ends; down: the same
          expect(mm(l.cellW - l.motifW), at).toBeCloseTo(PATTERN_GAP_MM, 0);
          expect(mm(l.stripH - l.motifH), at).toBeCloseTo(PATTERN_GAP_MM, 0);
          // …while the drawing itself grows with the zoom
          expect(l.motifW, at).toBeGreaterThan(prevW);
          prevW = l.motifW;
        }
      }
  });

  it('measured on the print file itself: the white space between neighbours is the same at 1× and 2×', async () => {
    // a solid red square fills its whole motif box, so the white run between two drawings IS the spacing
    const red = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#d62728' } }).png().toBuffer();
    const canvas = { width: 1800, height: 1800 }; // ~305 mm square at 150 dpi
    // down the middle column: from the centre drawing's bottom edge to the top of the next one below it
    const whiteBelowCentre = async (scale: number) => {
      const { png, layout } = await renderRepeatPattern(red, canvas, 150, clampTransform({ scale }));
      const { data, info } = await raw(png);
      const x = Math.round(canvas.width / 2);
      const isRed = (y: number) => data[(y * info.width + x) * 3]! > 150 && data[(y * info.width + x) * 3 + 1]! < 90;
      let y = Math.round(canvas.height / 2);
      expect(isRed(y)).toBe(true); // a drawing dead in the middle
      while (isRed(y)) y++;
      const start = y;
      while (y < canvas.height && !isRed(y)) y++;
      expect(y, 'the next drawing is on the sheet').toBeLessThan(canvas.height);
      return { mm: ((y - start) / 150) * 25.4, motif: layout.motifW };
    };
    const one = await whiteBelowCentre(1), two = await whiteBelowCentre(2);
    expect(two.motif).toBeGreaterThan(one.motif * 1.9); // the drawing doubled…
    expect(one.mm).toBeCloseTo(PATTERN_GAP_MM, 0); // …the gap didn't
    expect(two.mm).toBeCloseTo(PATTERN_GAP_MM, 0);
  });

  it('the default motif prints at about PATTERN_MOTIF_MM, and zoom changes it', () => {
    const dpi = 300;
    const motifMm = (scale: number) => {
      // a flat sheet (tea-towel width) — narrower prints (socks) have their own default, tested above
      const l = patternLayout({ width: 8208, height: 6000 }, dpi, { width: 1000, height: 1000 }, clampTransform({ scale }));
      return (l.motifW / dpi) * 25.4;
    };
    expect(motifMm(0)).toBeGreaterThan(PATTERN_MOTIF_MM * 0.8);
    expect(motifMm(0)).toBeLessThan(PATTERN_MOTIF_MM * 1.25);
    expect(motifMm(2)).toBeGreaterThan(motifMm(0) * 1.6);
    expect(motifMm(0.5)).toBeLessThan(motifMm(0) * 0.7);
  });

  it('keeps the drawing’s shape (no stretching) and turns it with the rotation', () => {
    const l = patternLayout({ width: 3000, height: 3000 }, 300, { width: 1000, height: 2000 }, T);
    expect(l.motifH / l.motifW).toBeCloseTo(2, 1);
    const r = patternLayout({ width: 3000, height: 3000 }, 300, { width: 1000, height: 2000 }, clampTransform({ scale: 0, rotationDeg: 90 }));
    expect(r.motifW / r.motifH).toBeCloseTo(2, 1);
  });
});

describe('renderRepeatPattern — the print file', () => {
  it('is exactly the canvas size, opaque, at the product dpi', async () => {
    const { png } = await renderRepeatPattern(await drawing(), { width: 708, height: 590 }, 300, T);
    const m = await sharp(png).metadata();
    expect([m.width, m.height, m.hasAlpha, m.density]).toEqual([708, 590, false, 300]);
  });

  it('a shift moves the WHOLE pattern: offset 1 = every drawing half a cell over, pixel for pixel', async () => {
    const canvas = { width: 1600, height: 800 };
    const src = await drawing();
    const a = await renderRepeatPattern(src, canvas, 150, clampTransform({ scale: 0 }));
    const b = await renderRepeatPattern(src, canvas, 150, clampTransform({ scale: 0, offsetX: 1 }));
    const d = (((b.layout.phaseX - a.layout.phaseX) % (2 * a.layout.cellW)) + 2 * a.layout.cellW) % (2 * a.layout.cellW);
    expect(Math.abs(d - a.layout.cellW / 2)).toBeLessThanOrEqual(1);
    const [A, B] = [await raw(a.png), await raw(b.png)];
    let diff = 0;
    for (let y = 0; y < canvas.height; y++)
      for (let x = d; x < canvas.width; x++)
        for (let c = 0; c < 3; c++) diff += Math.abs(B.data[(y * canvas.width + x) * 3 + c]! - A.data[(y * canvas.width + x - d) * 3 + c]!);
    expect(diff).toBe(0);
  });

  it('repeats down the canvas: each strip is the same as the one above it', async () => {
    const { png, layout } = await renderRepeatPattern(await drawing(), { width: 400, height: 2400 }, 150, T);
    expect(layout.stripH * 2).toBeLessThan(2400); // room for the check below
    const { data, info } = await raw(png);
    const row = (y: number) => data.subarray(y * info.width * 3, (y + 1) * info.width * 3);
    for (const y of [3, layout.stripH - 1, Math.floor(layout.stripH / 2)]) {
      expect(Buffer.compare(row(y), row(y + layout.stripH))).toBe(0);
    }
  });

  it('actually shows the drawing many times — ink spread over the whole sheet, not one copy', async () => {
    // a sheet about the size of an ankle sock's print (≈ 40 cm square at 150 dpi)
    const { png, layout } = await renderRepeatPattern(await drawing(), { width: 2400, height: 2400 }, 150, T);
    expect(layout.cols * layout.rows).toBeGreaterThanOrEqual(4);
    const { data, info } = await raw(png);
    // red ink present in every quadrant
    for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      let red = 0;
      for (let y = qy * 1200; y < qy * 1200 + 1200; y++) for (let x = qx * 1200; x < qx * 1200 + 1200; x++) {
        const i = (y * info.width + x) * 3;
        if (data[i]! > 150 && data[i + 1]! < 120) red++;
      }
      expect(red, `quadrant ${qx},${qy}`).toBeGreaterThan(1000);
    }
  });

  it('is deterministic, and never touches the original', async () => {
    const src = await drawing();
    const before = createHash('sha256').update(src).digest('hex');
    const a = await renderRepeatPattern(src, { width: 500, height: 500 }, 150, T);
    const b = await renderRepeatPattern(src, { width: 500, height: 500 }, 150, T);
    expect(a.png.equals(b.png)).toBe(true);
    expect(createHash('sha256').update(src).digest('hex')).toBe(before);
  });
});

describe('the print-quality gate for a repeat — judged on ONE motif, not the whole sheet', () => {
  const roll5m = { printWidthPx: 4133, printHeightPx: 29527, bleedMm: 0, requiredDpi: 150 };
  const phonePhoto = { width: 3000, height: 4000 };

  it('a phone photo of a drawing is fine for a 5 m wrapping roll as a pattern (it would BLOCK as one picture)', () => {
    const filled = clampTransform({ scale: 1 }); // one picture covering the whole 5 m roll
    expect(assessResolution(roll5m, phonePhoto, filled).decision).toBe('BLOCK');
    expect(assessPrintResolution(roll5m, phonePhoto, filled, 'wrappingPaper-5mroll').decision).toBe('OK');
  });

  it('a genuinely tiny source still blocks — never fakes print quality', () => {
    expect(assessPrintResolution(roll5m, { width: 40, height: 50 }, T, 'wrappingPaper').decision).toBe('BLOCK');
  });

  it('every other product keeps the ordinary whole-canvas gate', () => {
    const frame = { printWidthPx: 3307, printHeightPx: 4192, bleedMm: 3, requiredDpi: 300 };
    const small = { width: 600, height: 800 };
    expect(assessPrintResolution(frame, small, T, 'framedPrint')).toEqual(assessResolution(frame, small, T));
  });

  it('pattern products are recognised by product key AND variant sku — and nothing else', () => {
    for (const k of ['socks', 'socks-tube', 'wrappingPaper', 'wrappingPaper-5mroll', 'teaTowel']) expect(isPatternProduct(k), k).toBe(true);
    for (const k of ['sock', 'framedPrint', 'kidsTee', 'teaTowels', '', null, undefined]) expect(isPatternProduct(k), String(k)).toBe(false);
  });
});

describe('the preview repeat == the print repeat (B2)', () => {
  it('scaling keeps the columns, rows, spacing and centring — the same repeat, smaller', () => {
    const canvas = { width: 4133, height: 29527 };
    const l = patternLayout(canvas, 150, { width: 1200, height: 1600 }, T);
    for (const s of [0.5, 0.25, 0.1, 0.037]) {
      const p = scalePatternLayout(l, canvas, s);
      const k = p.canvas.width / canvas.width;
      expect([p.layout.cols, p.layout.rows]).toEqual([l.cols, l.rows]);
      expect(p.layout.cellW).toBeCloseTo(l.cellW * k, 6);
      expect(p.layout.motifW / p.layout.motifH).toBeCloseTo(l.motifW / l.motifH, 1);
      // the middle drawing is still in the middle of the smaller sheet
      expect(patternMotifCentres(p.layout, p.canvas).some((c) => Math.abs(c.x - p.canvas.width / 2) <= 1)).toBe(true);
    }
  });

  it('the browser editor and the server preview build the SAME layout as the print file, scaled', async () => {
    // the editor (PatternRepeat): patternLayout at print size → scalePatternLayout. The mockup preview and
    // the print file (renderRepeatPattern): the same two calls, at their own scale. One answer, three uses.
    // Canvases: the tea towel, and both socks at a low dpi (still their templates' size in mm).
    const src = await drawing();
    for (const [canvas, dpi] of [[{ width: 8208, height: 5492 }, 300], [{ width: 1181, height: 1181 }, 100], [{ width: 1181, height: 2047 }, 100]] as const)
      for (const tf of [T, clampTransform({ scale: 0.6 }), clampTransform({ scale: 1.8, offsetX: 0.4 })]) {
        const editor = scalePatternLayout(patternLayout(canvas, dpi, { width: 120, height: 160 }, tf), canvas, 0.25);
        const server = await renderRepeatPattern(src, canvas, dpi, tf, '#ffffff', { scale: 0.25 });
        expect(server.layout, `${canvas.width}×${canvas.height} @${tf.scale}`).toEqual(editor.layout);
      }
  });

  it('a sock: the print file has the drawing exactly where the editor draws it', async () => {
    const src = await drawing();
    const canvas = { width: 1181, height: 1181 }; // the ankle sock's 300 × 300 mm, at 100 dpi
    for (const tf of [T, clampTransform({ scale: 0.6 }), clampTransform({ scale: 1.3 })]) {
      const { png, layout } = await renderRepeatPattern(src, canvas, 100, tf);
      expect(layout.centres?.length).toBeGreaterThanOrEqual(2);
      const { data, info } = await raw(png);
      for (const c of patternMotifCentres(layout, canvas)) {
        const i = (Math.round(c.y) * info.width + Math.round(c.x)) * info.channels;
        expect(data[i]!, `${c.x},${c.y} @${tf.scale}`).toBeGreaterThan(150); // the drawing's red circle
        expect(data[i + 2]!, `${c.x},${c.y} @${tf.scale}`).toBeLessThan(100);
      }
    }
  });

  it('patternMotifCentres lands on the motifs the print file actually draws', async () => {
    const canvas = { width: 1416, height: 1180 };
    for (const tf of [T, clampTransform({ scale: 0, offsetX: 0.6, offsetY: -0.4 }), clampTransform({ scale: 1.4, rotationDeg: 90 })]) {
      const src = await drawing();
      const { png, layout } = await renderRepeatPattern(src, canvas, 50, tf); // 720×600 mm → many motifs
      const { data, info } = await raw(png);
      const centres = patternMotifCentres(layout, canvas).filter((c) => c.x >= 2 && c.y >= 2 && c.x < canvas.width - 2 && c.y < canvas.height - 2);
      expect(centres.length).toBeGreaterThan(4);
      for (const c of centres) {
        const i = (Math.round(c.y) * info.width + Math.round(c.x)) * info.channels;
        // the drawing's red circle sits at the motif's centre
        expect(data[i]!, `${c.x},${c.y}`).toBeGreaterThan(150);
        expect(data[i + 2]!, `${c.x},${c.y}`).toBeLessThan(100);
      }
    }
  });

  it('a scaled render is the print file, smaller (same picture, not a re-layout)', async () => {
    const canvas = { width: 1416, height: 1180 };
    const src = await drawing();
    const full = await renderRepeatPattern(src, canvas, 300, T);
    const small = await renderRepeatPattern(src, canvas, 300, T, '#ffffff', { scale: 0.25 });
    expect([small.width, small.height]).toEqual([354, 295]);
    expect(small.layout.cols).toBe(full.layout.cols);
    const a = await sharp(full.png).resize(354, 295, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const b = await sharp(small.png).removeAlpha().raw().toBuffer();
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!);
    expect(diff / a.length).toBeLessThan(12); // mean per-channel difference: edge resampling only
  });
});
