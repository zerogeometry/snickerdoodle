// A MEASURING GRID the size of a print file: coloured bands 2 mm each in from every edge (red, orange,
// yellow, green, blue), a 1 cm grid with cm labels from the top-left, "TOP" and "LEFT/RIGHT" marks and a
// centre cross. Laid on a product preview it shows exactly which millimetres of the file the picture
// shows. Synthetic — no child's image. Used by scripts/print-audit/render.ts.
import sharp from 'sharp';

export const BANDS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5'] as const; // 0–2, 2–4, 4–6, 6–8, 8–10 mm

/** The grid for a file of wMm × hMm, rendered at most `maxEdge` px on its long side (only the shape matters). */
export async function measuringGrid(wMm: number, hMm: number, maxEdge = 2400): Promise<Buffer> {
  const k = maxEdge / Math.max(wMm, hMm); // px per mm
  const W = Math.round(wMm * k), H = Math.round(hMm * k);
  const s: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${wMm} ${hMm}">`, `<rect width="${wMm}" height="${hMm}" fill="#ffffff"/>`];
  BANDS.forEach((c, i) => {
    const d = i * 2;
    s.push(`<rect x="${d}" y="${d}" width="${wMm - 2 * d}" height="${hMm - 2 * d}" fill="${c}"/>`);
  });
  s.push(`<rect x="10" y="10" width="${wMm - 20}" height="${hMm - 20}" fill="#ffffff"/>`);
  const thin = Math.max(0.15, 0.6 / k), thick = Math.max(0.4, 1.6 / k);
  for (let x = 10; x < wMm - 10; x += 10) s.push(`<line x1="${x}" y1="10" x2="${x}" y2="${hMm - 10}" stroke="${x % 50 === 0 ? '#555' : '#bbb'}" stroke-width="${x % 50 === 0 ? thick : thin}"/>`);
  for (let y = 10; y < hMm - 10; y += 10) s.push(`<line x1="10" y1="${y}" x2="${wMm - 10}" y2="${y}" stroke="${y % 50 === 0 ? '#555' : '#bbb'}" stroke-width="${y % 50 === 0 ? thick : thin}"/>`);
  // inset rings at 20 / 30 mm (purple dashed) — the common safe areas
  for (const d of [20, 30]) if (wMm > 2 * d + 10 && hMm > 2 * d + 10) s.push(`<rect x="${d}" y="${d}" width="${wMm - 2 * d}" height="${hMm - 2 * d}" fill="none" stroke="#8e24aa" stroke-width="${thick}" stroke-dasharray="${3} ${2}"/>`);
  const fs = Math.max(4, Math.min(wMm, hMm) / 12);
  const lab = Math.max(2.4, Math.min(5, Math.min(wMm, hMm) / 30));
  for (let x = 50; x < wMm - 10; x += 50) s.push(`<text x="${x + 0.8}" y="${10 + lab * 1.1}" font-family="Arial" font-size="${lab}" fill="#333">${x / 10}</text>`);
  for (let y = 50; y < hMm - 10; y += 50) s.push(`<text x="11" y="${y - 0.8}" font-family="Arial" font-size="${lab}" fill="#333">${y / 10}</text>`);
  s.push(`<text x="${wMm / 2}" y="${10 + fs * 1.2}" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="${fs}" fill="#c62828">▲ TOP</text>`);
  s.push(`<text x="${10 + fs * 0.3}" y="${hMm / 2}" font-family="Arial Black,Arial" font-weight="900" font-size="${fs * 0.8}" fill="#1565c0">L</text>`);
  s.push(`<text x="${wMm - 10 - fs * 0.3}" y="${hMm / 2}" text-anchor="end" font-family="Arial Black,Arial" font-weight="900" font-size="${fs * 0.8}" fill="#2e7d32">R</text>`);
  s.push(`<text x="${wMm / 2}" y="${hMm - 10 - fs * 0.4}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="${fs * 0.6}" fill="#6a1b9a">bottom</text>`);
  const c = Math.min(wMm, hMm) / 10;
  s.push(`<line x1="${wMm / 2 - c}" y1="${hMm / 2}" x2="${wMm / 2 + c}" y2="${hMm / 2}" stroke="#000" stroke-width="${thick}"/><line x1="${wMm / 2}" y1="${hMm / 2 - c}" x2="${wMm / 2}" y2="${hMm / 2 + c}" stroke="#000" stroke-width="${thick}"/>`);
  s.push('</svg>');
  return sharp(Buffer.from(s.join(''))).png().toBuffer();
}
