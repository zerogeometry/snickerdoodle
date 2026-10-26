// The Christmas sticker family — authored here as clean vectors, written out as one SVG per sticker
// (src/ui/studio/stickers/christmas/<id>.svg), the typed art module the Studio and the print
// renderer both draw from (src/lib/stickers/christmas-art.ts), and a contact sheet for review
// (mockups/christmas/stickers-contact-sheet.png).
//
//   node scripts/stickers/christmas.mjs            → SVGs + art module + contact sheet
//
// One family, shared rules: chubby, head ≈ half the height, dot eyes with a tiny highlight, berry
// cheeks, small smiles, ONE brand-coloured accessory each; a chunky cocoa ink line; brand tokens only.
// No white die-cut border or shadow (founder, 26 Oct): they sit straight on the canvas.
// A touch of wonk: every sticker sits a few degrees off true.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ── brand tokens (globals.css) + two browns derived inside the family ──
const C = {
  tomato: '#c8402a', cinnamon: '#a8331f', honey: '#f6c445', band: '#fbe9b7', leaf: '#7fa65e', save: '#3f6e29',
  sky: '#8fb5d6', cobalt: '#2f5da8', berry: '#e8786e', paper: '#fffbf2', oat: '#f8f5e9', ink: '#2b2118',
  ginger: '#d78a36', // 40% cinnamon · 60% honey
  deer: '#9c5327', // 50% cinnamon · 25% cocoa · 25% honey
  skin: '#fbe7cc', // honey-band · berry-pale, half and half
};
const INK = 5; // the ink line, on the 200 box (≈2.5–3% of a sticker)
const CUT = 26; // die-cut border stroke: 13 beyond the silhouette (≈6.5%)

const ink = (w = INK) => `stroke="${C.ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const eyes = (cx, cy, dx, r = 5.2) =>
  [-1, 1].map((s) => `<circle cx="${cx + s * dx}" cy="${cy}" r="${r}" fill="${C.ink}"/><circle cx="${cx + s * dx - r * 0.32}" cy="${cy - r * 0.38}" r="${r * 0.36}" fill="#ffffff"/>`).join('');
const cheeks = (cx, cy, dx, rx = 7.5, ry = 4.6) => [-1, 1].map((s) => `<ellipse cx="${cx + s * dx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.berry}" opacity="0.6"/>`).join('');
const smile = (cx, cy, w = 12, colour = C.ink) => `<path d="M${cx - w / 2} ${cy} Q${cx} ${cy + w * 0.55} ${cx + w / 2} ${cy}" fill="none" stroke="${colour}" stroke-width="3.4" stroke-linecap="round"/>`;
const face = (cx, cy, { dx = 13, r = 5.2, cheekY = 11, cheekDx = 21, smileY = 12, smileW = 12 } = {}) => eyes(cx, cy, dx, r) + cheeks(cx, cy + cheekY, cheekDx) + smile(cx, cy + smileY, smileW);
/** Stripes clipped to a shape: the holly-tape scarf (tomato · paper) or leaf · paper. */
const stripes = (id, clip, a, b, { angle = -40, w = 9 } = {}) =>
  `<clipPath id="${id}">${clip}</clipPath><g clip-path="url(#${id})"><rect x="0" y="0" width="200" height="200" fill="${b}"/>` +
  `<g transform="rotate(${angle} 100 100)">${Array.from({ length: 24 }, (_, i) => `<rect x="${-100 + i * w * 2}" y="-100" width="${w}" height="400" fill="${a}"/>`).join('')}</g></g>`;

/**
 * A sticker: the art, straight on the canvas (no die-cut border, no shadow — founder, 26 Oct). `sil` is the outer silhouette as
 * plain shapes (they inherit the border's fill and stroke). Ids are prefixed, so many can share a page.
 */
function sticker(id, { sil, art, wonk = 0 }) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">` +
    `<defs><g id="${id}-sil">${sil}</g></defs>` +
    `<g transform="rotate(${wonk} 100 100)">` +
    // founder (26 Oct): NO white die-cut outline and no drop shadow — the art goes straight on the canvas
    // (the silhouette stays defined: it's still the sticker's hit/selection shape)
    art +
    `</g></svg>`
  );
}

const S = {};

// ── snowman: two snowballs, a holly-tape scarf ──
{
  const head = `<circle cx="100" cy="66" r="34"/>`, body = `<ellipse cx="100" cy="136" rx="47" ry="42"/>`;
  const scarf = 'M64 96 Q100 110 136 96 L138 108 Q100 124 62 108 Z';
  const tail = 'M114 110 L134 106 L138 146 Q130 150 122 146 Z';
  S.snowman = sticker('snowman', {
    wonk: -3,
    sil: head + body,
    art:
      `<ellipse cx="100" cy="136" rx="47" ry="42" fill="${C.paper}" ${ink()}/>` +
      `<circle cx="100" cy="66" r="34" fill="${C.paper}" ${ink()}/>` +
      `<circle cx="100" cy="132" r="4.5" fill="${C.ink}"/><circle cx="100" cy="152" r="4.5" fill="${C.ink}"/>` +
      face(100, 60, { dx: 12, smileY: 22 }) +
      `<path d="M99 70 L123 75 Q125 77 122 78 L99 78 Z" fill="${C.honey}" ${ink(3.4)}/>` +
      stripes('snowman-scarf', `<path d="${scarf}"/><path d="${tail}"/>`, C.tomato, C.paper, { angle: -50, w: 7 }) +
      `<path d="${scarf}" fill="none" ${ink(4)}/><path d="${tail}" fill="none" ${ink(4)}/>`,
  });
}

// ── santa: big beard, red hat, a honey buckle ──
{
  const hat = 'M58 56 Q60 18 98 16 Q132 14 150 40 Q156 50 152 62 Z';
  const beard = 'M58 76 Q54 112 74 128 Q86 142 100 140 Q114 142 126 128 Q146 112 142 76 Q130 96 100 98 Q70 96 58 76 Z';
  const body = `<path d="M54 178 Q50 126 100 120 Q150 126 146 178 Z"/>`;
  S.santa = sticker('santa', {
    wonk: 2.5,
    sil: body + `<circle cx="100" cy="80" r="40"/><path d="${hat}"/><circle cx="156" cy="62" r="12"/><path d="${beard}"/>`,
    art:
      `<path d="M54 178 Q50 126 100 120 Q150 126 146 178 Z" fill="${C.tomato}" ${ink()}/>` +
      `<rect x="56" y="150" width="88" height="13" fill="${C.ink}"/><rect x="88" y="146" width="24" height="21" rx="4" fill="${C.honey}" ${ink(3.4)}/>` +
            `<circle cx="100" cy="80" r="40" fill="${C.skin}" ${ink()}/>` +
      `<path d="${beard}" fill="${C.paper}" ${ink()}/>` +
      `<path d="M78 98 Q88 90 100 96 Q112 90 122 98 Q112 106 100 101 Q88 106 78 98 Z" fill="${C.paper}" ${ink(3.4)}/>` +
      `<path d="${hat}" fill="${C.tomato}" ${ink()}/>` +
      `<rect x="54" y="50" width="94" height="18" rx="9" fill="${C.paper}" ${ink()}/>` +
      `<circle cx="156" cy="62" r="12" fill="${C.paper}" ${ink()}/>` +
      eyes(100, 80, 14) + cheeks(100, 89, 24, 7, 4.2) + `<circle cx="100" cy="90" r="6" fill="${C.berry}" ${ink(3)}/>`,
  });
}

// ── mrs claus: snowy bun, gold specs, a holly hair-clip ──
{
  const body = `<path d="M50 180 Q54 122 100 116 Q146 122 150 180 Z"/>`;
  S.mrsClaus = sticker('mrsClaus', {
    wonk: -2,
    sil: body + `<circle cx="100" cy="80" r="40"/><circle cx="100" cy="36" r="18"/><ellipse cx="128" cy="34" rx="16" ry="10"/>`,
    art:
      `<path d="M50 180 Q54 122 100 116 Q146 122 150 180 Z" fill="${C.tomato}" ${ink()}/>` +
      `<path d="M74 122 Q100 140 126 122 Q114 116 100 116 Q86 116 74 122 Z" fill="${C.paper}" ${ink(4)}/>` +
      `<circle cx="100" cy="146" r="4" fill="${C.paper}" ${ink(2.5)}/><circle cx="100" cy="162" r="4" fill="${C.paper}" ${ink(2.5)}/>` +
      `<circle cx="100" cy="36" r="18" fill="${C.paper}" ${ink()}/>` +
      `<circle cx="100" cy="80" r="40" fill="${C.skin}" ${ink()}/>` +
      `<path d="M61 76 Q62 42 100 40 Q138 42 139 76 Q128 60 112 58 Q104 66 100 58 Q96 66 88 58 Q72 60 61 76 Z" fill="${C.paper}" ${ink(4.5)}/>` +
      eyes(100, 84, 15, 4.6) +
      [-1, 1].map((s) => `<circle cx="${100 + s * 15}" cy="84" r="10" fill="none" stroke="${C.honey}" stroke-width="3.4"/>`).join('') +
      `<path d="M95 84 H105" stroke="${C.honey}" stroke-width="3"/>` +
      cheeks(100, 97, 25, 7, 4.2) + smile(100, 102, 12) +
      // the holly hair-clip
      `<path d="M114 34 Q122 20 138 26 Q132 30 136 36 Q124 42 114 34 Z" fill="${C.leaf}" ${ink(3.4)}/>` +
      `<path d="M140 40 Q134 26 120 30 Q126 34 122 40 Q132 48 140 40 Z" fill="${C.save}" ${ink(3.4)}/>` +
      `<circle cx="124" cy="36" r="5.5" fill="${C.tomato}" ${ink(3)}/><circle cx="132" cy="40" r="4.5" fill="${C.tomato}" ${ink(3)}/>`,
  });
}

// ── reindeer: honey antlers, a red nose, a leaf-stripe scarf ──
{
  const antlerL = 'M78 60 L66 22 M70 36 L52 30 M67 26 L74 12';
  const antlerR = 'M122 60 L134 22 M130 36 L148 30 M133 26 L126 12';
  const body = `<ellipse cx="100" cy="158" rx="36" ry="24"/>`;
  const scarf = 'M68 122 Q100 136 132 122 L132 134 Q100 148 68 134 Z';
  S.reindeer = sticker('reindeer', {
    wonk: 3,
    sil: body + `<ellipse cx="100" cy="92" rx="42" ry="38"/><ellipse cx="54" cy="72" rx="16" ry="9" transform="rotate(-24 54 72)"/><ellipse cx="146" cy="72" rx="16" ry="9" transform="rotate(24 146 72)"/>` +
      `<path d="${antlerL} ${antlerR}" fill="none" stroke-width="${CUT + 16}"/>`,
    art:
      `<path d="${antlerL} ${antlerR}" fill="none" stroke="${C.ink}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${antlerL} ${antlerR}" fill="none" stroke="${C.band}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<ellipse cx="100" cy="158" rx="36" ry="24" fill="${C.deer}" ${ink()}/>` +
      `<ellipse cx="86" cy="178" rx="9" ry="5" fill="${C.ink}"/><ellipse cx="114" cy="178" rx="9" ry="5" fill="${C.ink}"/>` +
      `<ellipse cx="54" cy="72" rx="16" ry="9" transform="rotate(-24 54 72)" fill="${C.deer}" ${ink()}/>` +
      `<ellipse cx="146" cy="72" rx="16" ry="9" transform="rotate(24 146 72)" fill="${C.deer}" ${ink()}/>` +
      `<ellipse cx="100" cy="92" rx="42" ry="38" fill="${C.deer}" ${ink()}/>` +
      `<ellipse cx="100" cy="110" rx="25" ry="17" fill="${C.band}" ${ink(4)}/>` +
      eyes(100, 84, 15) + cheeks(100, 98, 28, 7, 4.2) +
      `<circle cx="100" cy="103" r="9" fill="${C.tomato}" ${ink(3.6)}/><circle cx="97" cy="100" r="2.6" fill="#ffffff" opacity="0.9"/>` +
      smile(100, 115, 10) +
      stripes('reindeer-scarf', `<path d="${scarf}"/>`, C.leaf, C.paper, { angle: -50, w: 7 }) + `<path d="${scarf}" fill="none" ${ink(4)}/>`,
  });
}

// ── penguin: cobalt, a bobble hat in holly-tape stripes ──
{
  const hat = 'M62 64 Q64 30 100 28 Q136 30 138 64 Z';
  S.penguin = sticker('penguin', {
    wonk: -3.5,
    sil: `<ellipse cx="100" cy="114" rx="50" ry="62"/><ellipse cx="54" cy="128" rx="11" ry="26" transform="rotate(18 54 128)"/><ellipse cx="146" cy="128" rx="11" ry="26" transform="rotate(-18 146 128)"/>` +
      `<ellipse cx="82" cy="176" rx="14" ry="7"/><ellipse cx="118" cy="176" rx="14" ry="7"/><path d="${hat}"/><circle cx="100" cy="24" r="12"/>`,
    art:
      `<ellipse cx="82" cy="176" rx="14" ry="7" fill="${C.honey}" ${ink(4)}/><ellipse cx="118" cy="176" rx="14" ry="7" fill="${C.honey}" ${ink(4)}/>` +
      `<ellipse cx="54" cy="128" rx="11" ry="26" transform="rotate(18 54 128)" fill="${C.cobalt}" ${ink()}/>` +
      `<ellipse cx="146" cy="128" rx="11" ry="26" transform="rotate(-18 146 128)" fill="${C.cobalt}" ${ink()}/>` +
      `<ellipse cx="100" cy="114" rx="50" ry="62" fill="${C.cobalt}" ${ink()}/>` +
      `<path d="M66 92 Q66 66 88 70 Q100 76 112 70 Q134 66 134 92 Q134 118 100 120 Q66 118 66 92 Z" fill="${C.paper}" ${ink(4)}/>` +
      `<ellipse cx="100" cy="146" rx="30" ry="26" fill="${C.paper}" ${ink(4)}/>` +
      eyes(100, 90, 14) + cheeks(100, 101, 23, 7, 4.2) +
      `<path d="M92 100 L108 100 L100 111 Z" fill="${C.honey}" ${ink(3.4)}/>` +
      stripes('penguin-hat', `<path d="${hat}"/>`, C.tomato, C.paper, { angle: 0, w: 8 }) +
      `<path d="${hat}" fill="none" ${ink()}/>` +
      `<rect x="58" y="58" width="84" height="14" rx="7" fill="${C.tomato}" ${ink(4.5)}/>` +
      `<circle cx="100" cy="24" r="12" fill="${C.paper}" ${ink()}/>`,
  });
}

// ── gingerbread man: icing squiggles, a tomato bow tie ──
{
  const man = 'M84 94.2 A36 36 0 1 1 116 94.2 L120 104 L156 104 Q172 104 172 119 Q172 134 156 134 L128 134 L130 150 L140 170 Q144 182 131 183 Q122 184 117 176 L100 154 L83 176 Q78 184 69 183 Q56 182 60 170 L70 150 L72 134 L44 134 Q28 134 28 119 Q28 104 44 104 L80 104 Z';
  const icing = (pts) => `<path d="${pts}" fill="none" stroke="${C.paper}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  S.gingerbread = sticker('gingerbread', {
    wonk: 4,
    sil: `<path d="${man}"/>`,
    art:
      `<path d="${man}" fill="${C.ginger}" ${ink()}/>` +
      icing('M46 109 q-5 3.5 0 7 q5 3.5 0 7 q-5 3.5 0 7') + icing('M154 109 q5 3.5 0 7 q-5 3.5 0 7 q5 3.5 0 7') +
      icing('M62 168 q3.5 -5 7 0 q3.5 5 7 0') + icing('M124 168 q3.5 5 7 0 q3.5 -5 7 0') +
      face(100, 58, { dx: 13, smileY: 14, smileW: 14 }) +
      `<circle cx="100" cy="126" r="5" fill="${C.leaf}" ${ink(3)}/><circle cx="100" cy="142" r="5" fill="${C.cobalt}" ${ink(3)}/>` +
      `<path d="M100 106 L84 98 L84 116 Z M100 106 L116 98 L116 116 Z" fill="${C.tomato}" ${ink(3.6)}/><circle cx="100" cy="106" r="5" fill="${C.tomato}" ${ink(3.4)}/>`,
  });
}

// ── star: a chunky smiling star in a bobble hat ──
{
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? 40 : 80;
    pts.push([100 + r * Math.cos(a), 108 + r * Math.sin(a)]);
  }
  // rounded points: a quadratic through each tip, from a little way along each edge
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  let d = '';
  pts.forEach((p, i) => {
    const prev = pts[(i + 9) % 10], next = pts[(i + 1) % 10];
    const a = lerp(p, prev, i % 2 ? 0.12 : 0.2), b = lerp(p, next, i % 2 ? 0.12 : 0.2);
    d += `${i ? 'L' : 'M'}${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)} `;
  });
  d += 'Z';
  const hat = 'M78 46 Q80 20 102 18 Q122 20 124 44 Z';
  S.star = sticker('star', {
    wonk: -5,
    sil: `<path d="${d}"/><path d="${hat}"/><circle cx="104" cy="14" r="9"/>`,
    art:
      `<path d="${d}" fill="${C.honey}" ${ink()}/>` +
      face(100, 110, { dx: 14, smileY: 13, smileW: 14 }) +
      stripes('star-hat', `<path d="${hat}"/>`, C.leaf, C.paper, { angle: 0, w: 6 }) +
      `<path d="${hat}" fill="none" ${ink(4.5)}/><rect x="74" y="40" width="54" height="11" rx="5.5" fill="${C.leaf}" ${ink(4)}/>` +
      `<circle cx="104" cy="14" r="9" fill="${C.paper}" ${ink(4.5)}/>`,
  });
}

// ── holly: two spiky leaves, three berries (the middle one smiles) ──
{
  const leaf = (flip) => {
    const m = (x) => (flip ? 200 - x : x);
    return `M${m(96)} 108 Q${m(88)} 96 ${m(78)} 100 Q${m(74)} 84 ${m(60)} 90 Q${m(56)} 72 ${m(42)} 80 Q${m(36)} 64 ${m(22)} 72 Q${m(18)} 92 ${m(30)} 98 Q${m(22)} 110 ${m(36)} 116 Q${m(32)} 130 ${m(48)} 130 Q${m(50)} 144 ${m(64)} 138 Q${m(72)} 148 ${m(80)} 136 Q${m(92)} 132 ${m(96)} 108 Z`;
  };
  const vein = (flip) => {
    const m = (x) => (flip ? 200 - x : x);
    return `M${m(92)} 112 Q${m(60)} 106 ${m(30)} 84`;
  };
  S.holly = sticker('holly', {
    wonk: 2,
    sil: `<path d="${leaf(false)}"/><path d="${leaf(true)}"/><circle cx="100" cy="102" r="22"/><circle cx="76" cy="76" r="15"/><circle cx="124" cy="76" r="15"/>`,
    art:
      `<path d="${leaf(false)}" fill="${C.leaf}" ${ink()}/><path d="${vein(false)}" fill="none" stroke="${C.save}" stroke-width="3.4" stroke-linecap="round"/>` +
      `<path d="${leaf(true)}" fill="${C.save}" ${ink()}/><path d="${vein(true)}" fill="none" stroke="${C.leaf}" stroke-width="3.4" stroke-linecap="round"/>` +
      `<circle cx="76" cy="76" r="15" fill="${C.tomato}" ${ink()}/><circle cx="71" cy="71" r="3.5" fill="#ffffff" opacity="0.85"/>` +
      `<circle cx="124" cy="76" r="15" fill="${C.tomato}" ${ink()}/><circle cx="119" cy="71" r="3.5" fill="#ffffff" opacity="0.85"/>` +
      `<circle cx="100" cy="102" r="22" fill="${C.tomato}" ${ink()}/>` +
      eyes(100, 100, 8, 3.8) + cheeks(100, 107, 13, 4.5, 2.8) + smile(100, 108, 7, C.ink),
  });
}

// ── candy cane: tomato stripes and a little leaf bow ──
{
  const cane = 'M133 160 L133 72 A45 45 0 0 0 43 72 L43 90 A15 15 0 0 0 73 90 L73 72 A15 15 0 0 1 103 72 L103 160 A15 15 0 0 0 133 160 Z';
  S.candyCane = sticker('candyCane', {
    wonk: 6,
    sil: `<path d="${cane}"/><path d="M118 92 L96 80 L96 104 Z M118 92 L140 80 L140 104 Z"/>`,
    art:
      stripes('candyCane-s', `<path d="${cane}"/>`, C.tomato, C.paper, { angle: 35, w: 10 }) +
      `<path d="${cane}" fill="none" ${ink()}/>` +
      `<path d="M118 92 L98 82 L98 104 Z M118 92 L138 82 L138 104 Z" fill="${C.leaf}" ${ink(3.6)}/><circle cx="118" cy="92" r="5" fill="${C.leaf}" ${ink(3.4)}/>`,
  });
}

// ── tinsel: a fluffy honey garland swag, tomato bows at the ends, three baubles (the middle one smiles) ──
{
  const P0 = [30, 50], P1 = [100, 128], P2 = [170, 50];
  const at = (t) => [0, 1].map((k) => (1 - t) * (1 - t) * P0[k] + 2 * (1 - t) * t * P1[k] + t * t * P2[k]);
  const rope = `M${P0[0]} ${P0[1]} Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`;
  // tinsel: little strands fanning out all along the rope, honey and pale gold
  const strands = [[], []];
  for (let i = 0; i <= 28; i++) {
    const [x, y] = at(i / 28);
    for (let j = 0; j < 3; j++) {
      const ang = ((i * 7 + j * 120) % 360) * (Math.PI / 180), len = 9 + ((i + j) % 3) * 2;
      strands[(i + j) % 2].push(`M${x.toFixed(1)} ${y.toFixed(1)} l${(Math.cos(ang) * len).toFixed(1)} ${(Math.sin(ang) * len).toFixed(1)}`);
    }
  }
  const bow = (x, y) => `<path d="M${x} ${y} L${x - 17} ${y - 12} L${x - 17} ${y + 12} Z M${x} ${y} L${x + 17} ${y - 12} L${x + 17} ${y + 12} Z" fill="${C.tomato}" ${ink(3.4)}/><circle cx="${x}" cy="${y}" r="5.5" fill="${C.tomato}" ${ink(3)}/>`;
  const bauble = (t, drop, r, fill, withFace) => {
    const [x, y0] = at(t), y = y0 + drop;
    return (
      `<path d="M${x.toFixed(1)} ${y0.toFixed(1)} V${(y - r - 3).toFixed(1)}" stroke="${C.ink}" stroke-width="3"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" ${ink(4.5)}/><rect x="${(x - 6).toFixed(1)}" y="${(y - r - 6).toFixed(1)}" width="12" height="8" rx="2" fill="${C.honey}" ${ink(3)}/>` +
      (withFace ? eyes(x, y - 1, 6.5, 3.6) + cheeks(x, y + 5, 11, 4, 2.6) + smile(x, y + 6, 7) : `<circle cx="${(x - r * 0.4).toFixed(1)}" cy="${(y - r * 0.4).toFixed(1)}" r="${(r * 0.22).toFixed(1)}" fill="#ffffff" opacity="0.8"/>`)
    );
  };
  const [lx, ly] = at(0.24), [rx, ry] = at(0.76), [mx, my] = at(0.5);
  S.tinsel = sticker('tinsel', {
    wonk: -2,
    sil: `<path d="${rope}" fill="none" stroke-width="${CUT + 34}"/><circle cx="30" cy="50" r="15"/><circle cx="170" cy="50" r="15"/>` +
      `<circle cx="${lx}" cy="${ly + 34}" r="16"/><circle cx="${rx}" cy="${ry + 34}" r="16"/><circle cx="${mx}" cy="${my + 40}" r="21"/>`,
    art:
      bauble(0.24, 34, 15, C.tomato, false) + bauble(0.76, 34, 15, C.leaf, false) + bauble(0.5, 40, 20, C.cobalt, true) +
      `<path d="${rope}" fill="none" stroke="${C.ink}" stroke-width="30" stroke-linecap="round"/>` +
      `<path d="${rope}" fill="none" stroke="${C.honey}" stroke-width="21" stroke-linecap="round"/>` +
      `<path d="${strands[0].join(" ")}" fill="none" stroke="${C.band}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<path d="${strands[1].join(" ")}" fill="none" stroke="${C.ginger}" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>` +
      bow(30, 50) + bow(170, 50),
  });
}

// ── sack: a plump Christmas sack, tied with a tomato bow, presents peeping out ──
{
  const sack = 'M80 70 Q40 96 40 140 Q40 180 100 180 Q160 180 160 140 Q160 96 120 70 Z';
  const ruffle = 'M74 70 Q66 52 72 38 Q80 46 88 36 Q96 46 104 34 Q112 46 120 36 Q128 46 132 40 Q136 54 126 70 Z';
  S.sack = sticker('sack', {
    wonk: -4,
    sil: `<path d="${sack}"/><path d="${ruffle}"/><rect x="78" y="16" width="54" height="34" rx="6"/><path d="M60 72 L52 84 L74 80 Z M140 72 L148 84 L126 80 Z"/>`,
    art:
      `<rect x="80" y="20" width="30" height="26" rx="4" transform="rotate(-10 95 33)" fill="${C.cobalt}" ${ink(4.5)}/><path d="M95 19 V47" transform="rotate(-10 95 33)" stroke="${C.honey}" stroke-width="6"/>` +
      `<rect x="104" y="24" width="24" height="22" rx="4" transform="rotate(12 116 35)" fill="${C.leaf}" ${ink(4.5)}/><path d="M104 35 H128" transform="rotate(12 116 35)" stroke="${C.paper}" stroke-width="5"/>` +
      `<path d="${ruffle}" fill="${C.band}" ${ink()}/>` +
      `<path d="${sack}" fill="${C.band}" ${ink()}/>` +
      `<path d="M128 100 l3.6 7.4 8.1 1.2 -5.9 5.7 1.4 8.1 -7.2 -3.8 -7.2 3.8 1.4 -8.1 -5.9 -5.7 8.1 -1.2 Z" fill="${C.honey}" ${ink(3)}/>` +
      `<path d="M76 72 Q100 80 124 72" fill="none" stroke="${C.tomato}" stroke-width="9" stroke-linecap="round"/>` +
      `<path d="M100 76 L76 66 L72 86 Z M100 76 L124 66 L128 86 Z" fill="${C.tomato}" ${ink(3.6)}/><circle cx="100" cy="76" r="6" fill="${C.tomato}" ${ink(3.4)}/>` +
      face(100, 128, { dx: 15, smileY: 13, smileW: 14, cheekDx: 26 }),
  });
}

// ── present: tomato box, honey bow, a happy face ──
{
  S.present = sticker('present', {
    wonk: 3,
    sil: `<rect x="40" y="82" width="120" height="96" rx="10"/><rect x="32" y="66" width="136" height="30" rx="8"/><path d="M100 66 Q72 22 60 42 Q52 60 100 66 Z M100 66 Q128 22 140 42 Q148 60 100 66 Z"/>`,
    art:
      `<rect x="40" y="82" width="120" height="96" rx="10" fill="${C.tomato}" ${ink()}/>` +
      `<rect x="32" y="66" width="136" height="30" rx="8" fill="${C.tomato}" ${ink()}/>` +
      `<rect x="90" y="66" width="20" height="30" fill="${C.honey}" ${ink(3.6)}/>` +
      `<path d="M100 66 Q72 22 60 42 Q52 60 100 66 Z" fill="${C.honey}" ${ink(4.5)}/><path d="M100 66 Q128 22 140 42 Q148 60 100 66 Z" fill="${C.honey}" ${ink(4.5)}/>` +
      `<circle cx="100" cy="64" r="7" fill="${C.honey}" ${ink(4)}/>` +
      `<circle cx="58" cy="164" r="4" fill="${C.paper}" opacity="0.7"/><circle cx="146" cy="104" r="3.5" fill="${C.paper}" opacity="0.7"/><circle cx="142" cy="160" r="4.5" fill="${C.paper}" opacity="0.7"/><circle cx="58" cy="106" r="3" fill="${C.paper}" opacity="0.7"/>` +
      face(100, 128, { dx: 16, smileY: 14, smileW: 16, cheekDx: 28 }),
  });
}

// ── write out ──
export const ORDER = ['gingerbread', 'reindeer', 'snowman', 'santa', 'mrsClaus', 'penguin', 'star', 'holly', 'candyCane', 'tinsel', 'sack', 'present'];
const dir = path.join(root, 'src/ui/studio/stickers/christmas');
mkdirSync(dir, { recursive: true });
for (const id of ORDER) writeFileSync(path.join(dir, `${id}.svg`), S[id] + '\n');

const mod =
  `// GENERATED by scripts/stickers/christmas.mjs with the matching src/ui/studio/stickers/christmas/*.svg — do not edit by hand.\n` +
  `// The Studio preview and the print renderer both draw these exact strings (preview == print).\n\n` +
  `export const CHRISTMAS_STICKER_SVG = {\n${ORDER.map((id) => `  ${id}:\n    ${JSON.stringify(S[id]).replace(/'/g, "\\'").replace(/^"|"$/g, "'").replace(/\\"/g, '"')},`).join('\n')}\n} as const;\n`;
mkdirSync(path.join(root, 'src/lib/stickers'), { recursive: true });
writeFileSync(path.join(root, 'src/lib/stickers/christmas-art.ts'), mod);

// ── contact sheet: kraft, white and a dark tee ──
const require = createRequire(path.join(root, 'package.json'));
const { Resvg } = require('@resvg/resvg-js');
const cell = 220, cols = 4, rows = 3, band = cell * cols;
const grounds = [
  ['kraft', '#d9b98c'],
  ['white', '#ffffff'],
  ['dark tee', '#2b2118'],
];
let body = '';
grounds.forEach(([name, bg], g) => {
  const ox = g * (band + 20);
  body += `<rect x="${ox}" y="0" width="${band}" height="${cell * rows + 40}" fill="${bg}"/>`;
  body += `<text x="${ox + 16}" y="28" font-family="sans-serif" font-size="18" font-weight="700" fill="${g === 2 ? '#fffbf2' : '#2b2118'}">${name}</text>`;
  ORDER.forEach((id, i) => {
    const x = ox + (i % cols) * cell + 10, y = 40 + Math.floor(i / cols) * cell;
    const inner = S[id].replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/id="([a-zA-Z]+)-/g, `id="g${g}-$1-`).replace(/#([a-zA-Z]+)-(sil|scarf|hat|s)\b/g, `#g${g}-$1-$2`).replace(/url\(#([a-zA-Z]+)-/g, `url(#g${g}-$1-`);
    body += `<svg x="${x}" y="${y}" width="200" height="200" viewBox="0 0 200 200">${inner}</svg>`;
  });
});
const W = grounds.length * (band + 20) - 20, H = cell * rows + 40;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`;
mkdirSync(path.join(root, 'mockups/christmas'), { recursive: true });
writeFileSync(path.join(root, 'mockups/christmas/stickers-contact-sheet.png'), new Resvg(sheet, { font: { loadSystemFonts: true } }).render().asPng());
console.log('wrote', ORDER.length, 'stickers');
