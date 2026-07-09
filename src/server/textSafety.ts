/**
 * Minimal text safety for user-supplied strings tied to children. A child is named
 * by FIRST NAME ONLY (never a surname) and screened for obvious abuse before it is
 * stored or shown anywhere — the children's-data + content-safety rules in
 * CLAUDE.md. This is a deliberately small, deterministic server gate (not the image
 * moderation pipeline); it is the load-bearing screen for the name fields and is
 * reusable for member names / gift messages.
 */
import { normalizeCardFont, type CardFontToken } from '@/lib/card-fonts';

// Unambiguous profanity / slurs that must never appear in a child's name field.
// Kept short + strong and matched as a substring of a single name token, which
// avoids the Scunthorpe problem on legitimate names.
const ABUSE = [
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'dick', 'piss',
  'nigger', 'faggot', 'whore', 'slut', 'rape', 'wank', 'twat',
];

/** True if the text contains obvious abusive language. */
export function containsAbusiveText(raw: string): boolean {
  const s = raw.toLowerCase();
  return ABUSE.some((w) => s.includes(w));
}

export type NameScreen =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'surname' | 'invalid' | 'length' | 'abuse' };

// ── Greetings-card inside message ────────────────────────────────────────────
/** A screened, print-ready card message (trimmed, capped, font coerced to a known token). */
export type ScreenedCardMessage = { greeting: string; message: string; signature: string; note: string; font: CardFontToken; fontScale: number };
export type CardMessageScreen =
  | { ok: true; value: ScreenedCardMessage | null } // null = blank inside (nothing to print)
  | { ok: false; field: 'greeting' | 'message' | 'signature' | 'note' }; // abusive language in that field

const CARD_FIELD_MAX = { greeting: 80, message: 600, signature: 80, note: 200 } as const;
const CARD_FONT_SCALE = { min: 0.7, max: 1.4, default: 1 } as const;

/**
 * Screen the card's INSIDE message before it can print. Trims + length-caps the four free-text
 * fields, coerces the font to a known {@link normalizeCardFont} token, clamps the size multiplier,
 * and REJECTS if any field contains abusive language (the same deterministic screen as the name
 * fields — the text goes on a child's keepsake, and to a printer). All-empty ⇒ ok with null (a
 * blank inside, to write by hand). Reused by order placement AND the print renderer so they agree.
 */
export function screenCardMessage(
  raw: { greeting?: string; message?: string; signature?: string; note?: string; font?: string; fontScale?: unknown } | null | undefined,
): CardMessageScreen {
  if (!raw) return { ok: true, value: null };
  const greeting = (raw.greeting ?? '').trim().slice(0, CARD_FIELD_MAX.greeting);
  const message = (raw.message ?? '').trim().slice(0, CARD_FIELD_MAX.message);
  const signature = (raw.signature ?? '').trim().slice(0, CARD_FIELD_MAX.signature);
  const note = (raw.note ?? '').trim().slice(0, CARD_FIELD_MAX.note);
  if (!greeting && !message && !signature && !note) return { ok: true, value: null };
  if (containsAbusiveText(greeting)) return { ok: false, field: 'greeting' };
  if (containsAbusiveText(message)) return { ok: false, field: 'message' };
  if (containsAbusiveText(signature)) return { ok: false, field: 'signature' };
  if (containsAbusiveText(note)) return { ok: false, field: 'note' };
  const n = typeof raw.fontScale === 'number' && Number.isFinite(raw.fontScale) ? raw.fontScale : CARD_FONT_SCALE.default;
  const fontScale = Math.min(CARD_FONT_SCALE.max, Math.max(CARD_FONT_SCALE.min, n));
  return { ok: true, value: { greeting, message, signature, note, font: normalizeCardFont(raw.font), fontScale } };
}

// A single first-name token: letters/marks (any script), apostrophe, hyphen.
const NAME_TOKEN = /^[\p{L}\p{M}'’-]+$/u;
const MAX_FIRST_NAME = 24;

/**
 * Screen a child's FIRST NAME. Empty → ok with null (no subject). Otherwise it must
 * be a single token (any whitespace ⇒ a surname ⇒ rejected), within length, made of
 * name-like characters only, and free of abusive language. Returns the trimmed name.
 */
export function screenChildFirstName(raw: string | null | undefined): NameScreen {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_FIRST_NAME) return { ok: false, reason: 'length' };
  if (/\s/.test(trimmed)) return { ok: false, reason: 'surname' };
  if (!NAME_TOKEN.test(trimmed)) return { ok: false, reason: 'invalid' };
  if (containsAbusiveText(trimmed)) return { ok: false, reason: 'abuse' };
  return { ok: true, value: trimmed };
}
