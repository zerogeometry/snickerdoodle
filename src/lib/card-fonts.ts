/**
 * The greetings-card message fonts — a casual, friendly set offered in the card's "add a message"
 * picker. All self-hosted via @fontsource (imported in app/layout.tsx; NO CDN / no runtime fetch to
 * Google — GDPR-clean). The `css` family drives the live preview; the print renderer maps the same
 * token to the same font file, so the picker, the on-screen preview and the printed card can never
 * disagree. ONE source of truth.
 */
export type CardFontToken = 'caveat' | 'patrick' | 'gochi' | 'shadows' | 'baloo';

export interface CardFont {
  token: CardFontToken;
  label: string;
  /** CSS font stack for the live preview (families as @fontsource names them). */
  css: string;
}

export const CARD_FONTS: CardFont[] = [
  { token: 'caveat', label: 'Caveat', css: "'Caveat Variable', cursive" }, // bouncy handwriting (brand)
  { token: 'patrick', label: 'Patrick Hand', css: "'Patrick Hand', cursive" }, // neat, friendly hand
  { token: 'gochi', label: 'Gochi Hand', css: "'Gochi Hand', cursive" }, // chunky playful marker
  { token: 'shadows', label: 'Shadows Into Light', css: "'Shadows Into Light', cursive" }, // delicate script
  { token: 'baloo', label: 'Baloo 2', css: "'Baloo 2 Variable', system-ui, sans-serif" }, // rounded, legible for paragraphs
];

export const CARD_FONT_DEFAULT: CardFontToken = 'caveat';

/** Coerce an untrusted value to a KNOWN font token (or the default) — guards what the picker
 * writes, what we persist, and what the print renderer will act on. */
export const normalizeCardFont = (token: string | null | undefined): CardFontToken =>
  CARD_FONTS.find((f) => f.token === token)?.token ?? CARD_FONT_DEFAULT;

/** The CSS font stack for a token (the live preview), always resolving to a known font. */
export const cardFontCss = (token: string | null | undefined): string =>
  CARD_FONTS.find((f) => f.token === normalizeCardFont(token))!.css;
