/**
 * Minimal text safety for user-supplied strings tied to children. A child is named
 * by FIRST NAME ONLY (never a surname) and screened for obvious abuse before it is
 * stored or shown anywhere — the children's-data + content-safety rules in
 * CLAUDE.md. This is a deliberately small, deterministic server gate (not the image
 * moderation pipeline); it is the load-bearing screen for the name fields and is
 * reusable for member names / gift messages.
 */
import { normalizeCardFont, type CardFontToken } from '@/lib/card-fonts';
import { GIFT_NOTE_MAX } from '@/lib/gift-note';

// The swear words and slurs we screen for (founder, 11 Nov 2026, D28). They count ONLY as a whole word
// standing on its own — never as letters inside a longer word ("swanky", "Scunthorpe", "grapes",
// "class", "Dickens" all pass) — and only spelt out, never pieced together from look-alike letters.
// Words that are also names or everyday words are left OFF on purpose, so they're never stopped:
// dick (a name — Dick Whittington, Grandad Dick), pussy (a cat), fanny (a name), cock (a rooster),
// fag (a cigarette), knob (a door knob), willy, prick, tit (a bird), bum, arse.
// Kept although they have a rare innocent sense — on a child's keepsake the rude one is the likely
// one (child safety first; founder can drop any): bitch, bastard, faggot, nonce, rape.
const SWEAR_WORDS: ReadonlySet<string> = new Set([
  'fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'fuckin', 'fuckoff', 'fuckwit', 'fuckwits', 'fuckface',
  'motherfucker', 'motherfuckers', 'motherfucking',
  'shit', 'shits', 'shite', 'shitty', 'shitting', 'shithead', 'shitheads', 'bullshit', 'dipshit',
  'cunt', 'cunts',
  'wank', 'wanks', 'wanked', 'wanker', 'wankers', 'wanking',
  'twat', 'twats',
  'dickhead', 'dickheads',
  'bitch', 'bitches', 'bitchy',
  'bastard', 'bastards',
  'slut', 'sluts', 'slutty',
  'whore', 'whores',
  'piss', 'pissed', 'pisses', 'pissing',
  'bollocks', 'bollock',
  'arsehole', 'arseholes', 'asshole', 'assholes',
  'nigger', 'niggers', 'nigga', 'niggas',
  'faggot', 'faggots',
  'paedo', 'paedos', 'pedo', 'pedos', 'paedophile', 'paedophiles', 'pedophile', 'pedophiles',
  'nonce', 'nonces',
  'rape', 'raped', 'rapes', 'raping', 'rapist', 'rapists',
]);

/** The words in a piece of text: runs of letters (any alphabet), lower-cased. Anything else separates. */
const wordsOf = (raw: string): string[] => raw.toLowerCase().split(/[^\p{L}\p{M}]+/u).filter(Boolean);

/** True if the text contains a swear word or slur from the list, as a whole word of its own. */
export function containsAbusiveText(raw: string): boolean {
  return wordsOf(String(raw)).some((w) => SWEAR_WORDS.has(w));
}

// ── Words READ from a picture (printed text: Rekognition DetectText) ─────────
/**
 * True if any line of words read from a picture contains a swear word — the SAME whole-word check as
 * typed text (D28): no squashing gaps, no look-alike letters. Lines are checked one by one, never glued
 * together. (The looser matching of 9–10 Nov turned ordinary writing into swear words — "wish it" →
 * "wishit", "hot water" → "hotvater" — and held clean pictures.)
 */
export function containsAbusiveDrawnText(lines: readonly string[]): boolean {
  return lines.some((line) => containsAbusiveText(String(line)));
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

// ── Gift note (checkout) ─────────────────────────────────────────────────────
/** Screen a gift order's little note: trimmed + capped; empty ⇒ ok with null; abusive ⇒ refused. */
export function screenGiftNote(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const note = (typeof raw === 'string' ? raw : '').trim().slice(0, GIFT_NOTE_MAX);
  if (!note) return { ok: true, value: null };
  return containsAbusiveText(note) ? { ok: false } : { ok: true, value: note };
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
