import { createElement as el } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { loadCardFontWoff } from '@/server/print/cardFonts';
import { fitCardFontSize } from '@/lib/cardTextFit';
import { screenChildFirstName, screenGiftNote } from '@/server/textSafety';
import { giftNoteInsertKey } from './giftNoteInsertKey';
import type { InsertQuoteRequest, InsertQuoteShipment, ProdigiInsertSlot } from '@/server/prodigi/orders';

/**
 * PLAN C9: THE PRINTED GIFT-NOTE INSERT. A gift order's little note (typed at checkout, kept on the
 * order) printed and tucked into the parcel by Prodigi, as a per-order "branding" insert.
 *
 * OFF BY DEFAULT. `GIFT_NOTE_INSERT` (env / SSM) picks the slot: `postcard` (A6 card, £2 a parcel on
 * a free Prodigi account, 50p on Pro) or `packing_slip_bw` (A4 sheet, free — and the only insert
 * mugs, cushions and aprons take). Anything else, or unset, is OFF: nothing renders, nothing is sent.
 * Prices don't change either way (the founder's call). Findings + costs: the C9 hand-over note.
 *
 * The laws:
 *  1. NEVER FAILS AN ORDER. A note that fails the screen, a render or upload that breaks, a lab that
 *     can't make the insert, Prodigi refusing it: the order goes without the insert and the reason
 *     is recorded on `orders.gift_note_insert`.
 *  2. RE-SCREENED AT PRINT TIME (abuse, ≤200 characters) with today's screen, not trusted from checkout.
 *     The sign-off is a FIRST NAME only (the first word of who it's from, screened like a child's
 *     name). If it fails, the line is left off and the note still prints.
 *  3. ONLY THE NOTE. The file holds the note, the first name and our small sign-off. It never holds
 *     a picture, an address or a price.
 */

export type GiftNoteInsertSlot = Extract<ProdigiInsertSlot, 'postcard' | 'packing_slip_bw'>;

/** The switch. Unset / "off" / anything unrecognised → null (OFF). Deny by default. */
export function giftNoteInsertSlot(env: Record<string, string | undefined> = process.env): GiftNoteInsertSlot | null {
  const v = (env.GIFT_NOTE_INSERT ?? '').trim().toLowerCase();
  return v === 'postcard' || v === 'packing_slip_bw' ? v : null;
}

/** Plain words for the record (shown to the founder, never the shopper). */
const SLOT_WORDS: Record<GiftNoteInsertSlot, string> = { postcard: 'postcard', packing_slip_bw: 'black & white note sheet' };

/** What happened to an order's insert — stored on `orders.gift_note_insert`. No note text in here. */
export interface GiftNoteInsertRecord {
  slot: GiftNoteInsertSlot;
  /** sent = every shipment carries it · partly = some labs can't · skipped = none goes in the parcel */
  status: 'sent' | 'partly' | 'skipped';
  /** Why it was skipped / only partly sent / couldn't be checked. */
  why?: string;
  /** Per shipment, from the quote: does that lab print it? Absent when the quote couldn't be made. */
  labs?: { lab: string; prints: boolean }[];
  at: string;
}

export type PrintableGiftNote = { ok: true; note: string; from: string | null } | { ok: false; why: string };

/**
 * The note as it may print, or why not. Re-screens the note (the checkout screen, re-run now) and
 * cuts who it's from down to a screened FIRST NAME, or drops it.
 */
export function printableGiftNote(o: { isGift: boolean; giftNote: string | null; giftFromName: string | null }): PrintableGiftNote | null {
  if (!o.isGift || !o.giftNote?.trim()) return null; // nothing to print — not a skip, just no note
  const screened = screenGiftNote(o.giftNote);
  if (!screened.ok) return { ok: false, why: 'the note didn’t pass the abuse screen' };
  if (!screened.value) return null;
  const first = (o.giftFromName ?? '').trim().split(/\s+/)[0] ?? '';
  const name = screenChildFirstName(first);
  return { ok: true, note: screened.value, from: name.ok ? name.value : null };
}

/** Print size at 300dpi: postcard = A6 (105×148 mm incl. Prodigi's 4 mm border), slip = A4. */
export const GIFT_NOTE_ARTBOARD: Record<GiftNoteInsertSlot, { widthPx: number; heightPx: number }> = {
  postcard: { widthPx: 1240, heightPx: 1748 },
  packing_slip_bw: { widthPx: 2480, heightPx: 3508 },
};

const COCOA = '#2E2723'; // brand ink (as the greetings-card inside)
const PAPER = '#FFFBF2';
const LINE = 1.3;

/**
 * Render the insert: the note, centred, in the greetings-card handwriting (Caveat), "— Name" under
 * it, and a small sign-off at the foot. Postcard on paper cream; the B&W sheet in greyscale, the
 * note in its top third (it's an A4 sheet folded into the parcel).
 */
export async function renderGiftNoteInsert(slot: GiftNoteInsertSlot, text: { note: string; from: string | null }): Promise<Buffer> {
  const { widthPx: w, heightPx: h } = GIFT_NOTE_ARTBOARD[slot];
  const pad = Math.round(w * 0.12); // well inside the 4 mm (≈47 px) border
  const boxH = slot === 'postcard' ? h - 2 * pad : Math.round(h / 3);
  const innerW = w - 2 * pad;
  const noteBox = Math.round(boxH * 0.72); // room left for the name + sign-off
  const size = Math.round(fitCardFontSize([text.note], innerW, noteBox, w * 0.085, { lineHeight: LINE }));
  const woff = loadCardFontWoff('caveat');
  const svg = await satori(
    el(
      'div',
      { style: { display: 'flex', width: w, height: h, padding: pad, backgroundColor: slot === 'postcard' ? PAPER : '#ffffff', color: COCOA, fontFamily: 'caveat' } },
      el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', width: innerW, height: boxH, alignItems: 'center', justifyContent: 'space-between' } },
        el(
          'div',
          { style: { display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'center', justifyContent: 'center' } },
          el('div', { style: { display: 'flex', maxWidth: innerW, textAlign: 'center', lineHeight: LINE, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: size } }, text.note),
          text.from ? el('div', { style: { display: 'flex', marginTop: size * 0.5, fontSize: Math.round(size * 0.85) } }, `— ${text.from}`) : null,
        ),
        el('div', { style: { display: 'flex', fontSize: Math.round(w * 0.04), opacity: 0.75 } }, 'made with love at snickerdoodle.co.uk'),
      ),
    ),
    { width: w, height: h, fonts: [{ name: 'caveat', data: woff, weight: 400, style: 'normal' }] },
  );
  const png = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: w }, background: 'white' }).render().asPng());
  // 300 dpi stamped in, so the lab reads it at the intended size; the slip goes out greyscale.
  const img = sharp(png).flatten({ background: '#ffffff' }).withDensity(300);
  return (slot === 'packing_slip_bw' ? img.toColourspace('b-w') : img).png().toBuffer();
}

// Where an order's insert file lives (private bucket; deleted once the order ships or is cancelled).
export { giftNoteInsertKey };

export interface GiftNoteInsertPlan {
  /** The `branding` to send, or undefined (switch off, no note, or skipped). */
  branding?: Partial<Record<ProdigiInsertSlot, { url: string }>>;
  /** What to record on the order — null when there's nothing to say (switch off, or no note). */
  record: GiftNoteInsertRecord | null;
}

/**
 * Decide the order's insert. Checks per shipment (a quote) which labs print the slot. If none does,
 * nothing is made. Otherwise the file is rendered, stored and linked. Every failure ends in a
 * recorded skip, never a throw.
 */
export async function planGiftNoteInsert(args: {
  slot: GiftNoteInsertSlot | null;
  order: { id: string; isGift: boolean; giftNote: string | null; giftFromName: string | null };
  quote: Omit<InsertQuoteRequest, 'inserts'>;
  quoteInserts?: (req: InsertQuoteRequest) => Promise<InsertQuoteShipment[]>;
  /** Store the PNG; returns a provider-ingestion URL. */
  store: (key: string, png: Buffer) => Promise<string>;
  render?: typeof renderGiftNoteInsert;
  now?: Date;
}): Promise<GiftNoteInsertPlan> {
  const { slot } = args;
  if (!slot) return { record: null }; // OFF — the default
  const text = printableGiftNote(args.order);
  if (!text) return { record: null };
  const at = (args.now ?? new Date()).toISOString();
  const skipped = (why: string, labs?: GiftNoteInsertRecord['labs']): GiftNoteInsertPlan => ({ record: { slot, status: 'skipped', why, ...(labs ? { labs } : {}), at } });
  if (!text.ok) return skipped(text.why);

  let labs: GiftNoteInsertRecord['labs'];
  let why: string | undefined;
  if (args.quoteInserts) {
    try {
      const shipments = await args.quoteInserts({ ...args.quote, inserts: [slot] });
      labs = shipments.map((s) => ({ lab: s.lab, prints: s.brandingItems.includes(slot) }));
    } catch (e) {
      why = `couldn’t check which labs print it (${(e as Error).message.slice(0, 120)}) — sent anyway; a lab that can’t just leaves it out`;
    }
  } else {
    why = 'couldn’t check which labs print it — sent anyway; a lab that can’t just leaves it out';
  }
  if (labs && !labs.some((l) => l.prints)) {
    return skipped(`no lab on this order prints a ${SLOT_WORDS[slot]} (${labs.map((l) => l.lab).join(', ') || 'no shipments'})`, labs);
  }

  let url: string;
  try {
    const png = await (args.render ?? renderGiftNoteInsert)(slot, { note: text.note, from: text.from });
    url = await args.store(giftNoteInsertKey(args.order.id), png);
  } catch (e) {
    return skipped(`couldn’t make the insert (${(e as Error).message.slice(0, 120)})`, labs);
  }

  const missing = labs?.filter((l) => !l.prints).map((l) => l.lab) ?? [];
  const partly = missing.length > 0;
  return {
    branding: { [slot]: { url } },
    record: {
      slot,
      status: partly ? 'partly' : 'sent',
      ...(partly ? { why: `${missing.join(', ')} can’t print a ${SLOT_WORDS[slot]} — that parcel goes without it` } : why ? { why } : {}),
      ...(labs ? { labs } : {}),
      at,
    },
  };
}
