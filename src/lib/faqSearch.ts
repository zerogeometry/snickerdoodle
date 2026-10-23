import { FAQ, plainAnswer, type FaqItem } from './faq';

/**
 * Searching the FAQ (founder, 23 Oct: "a search bar above the FAQ questions"). Small and forgiving:
 * words, not exact phrases; the question counts more than the answer; everyday words map onto ours
 * ("refund" finds returns, "postage" finds delivery). Client-safe, no index to build.
 */
export interface FaqHit {
  item: FaqItem;
  section: string;
  score: number;
}

const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'can', 'i', 'my', 'me', 'do', 'does', 'you', 'your', 'to', 'of', 'on', 'in', 'it', 'for', 'and', 'or', 'how', 'what', 'with', 'be', 'we', 'our', 'if', 'at', 'will', 'from', 'this', 'that', 'there', 'get', 'have', 'has', 'about', 'snickerdoodle']);

/** Everyday words → the words our answers use. */
const SYNONYMS: Record<string, string[]> = {
  refund: ['return', 'returns', 'faulty'],
  refunds: ['return', 'returns', 'faulty'],
  money: ['return', 'price', 'cost'],
  broken: ['faulty', 'damaged'],
  damaged: ['faulty', 'damaged'],
  wrong: ['faulty', 'change'],
  postage: ['delivery'],
  shipping: ['delivery'],
  ship: ['delivery', 'deliver'],
  post: ['delivery'],
  arrive: ['delivery', 'tracked'],
  track: ['tracked', 'delivery'],
  tracking: ['tracked', 'delivery'],
  late: ['delivery', 'tracked'],
  cancel: ['change', 'cancel'],
  cancelled: ['change', 'cancel'],
  amend: ['change'],
  edit: ['change', 'studio'],
  price: ['cost', 'prices', 'from'],
  prices: ['cost', 'from'],
  cost: ['cost', 'from', 'free'],
  cheap: ['cost', 'free'],
  free: ['free'],
  phone: ['phone', 'case'],
  iphone: ['phone', 'case'],
  samsung: ['phone', 'case'],
  grandma: ['grandparents', 'family'],
  grandad: ['grandparents', 'family'],
  grandparent: ['grandparents'],
  nan: ['grandparents'],
  wishlist: ['gift', 'list'],
  safe: ['private', 'safety'],
  secure: ['private', 'secure'],
  delete: ['delete', 'deleted'],
  remove: ['remove', 'delete'],
  photo: ['photo', 'drawing'],
  picture: ['drawing', 'photo'],
  artwork: ['drawing'],
  quality: ['sharp', 'print'],
  blurry: ['sharp', 'soft'],
  background: ['background', 'paper', 'colour'],
  color: ['colour'],
  colors: ['colour'],
  contact: ['contact', 'help'],
  email: ['contact', 'email'],
  overseas: ['outside', 'abroad'],
  international: ['outside', 'abroad'],
  ai: ['ai', 'train'],
};

export const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9£]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w));

/** A forgiving match: the same word, or one a little longer/shorter (plurals, -ing). */
const matches = (needle: string, hay: Set<string>): boolean => {
  if (hay.has(needle)) return true;
  if (needle.length < 4) return false;
  for (const h of hay) if (h.startsWith(needle) || (h.length >= 4 && needle.startsWith(h))) return true;
  return false;
};

export function searchFaq(query: string, limit = 6): FaqHit[] {
  const q = words(query);
  if (!q.length) return [];
  const hits: FaqHit[] = [];
  for (const s of FAQ) {
    for (const item of s.items) {
      const inQ = new Set(words(item.q));
      const inA = new Set(words(plainAnswer(item.a)));
      let score = 0;
      for (const w of q) {
        const alts = [w, ...(SYNONYMS[w] ?? [])];
        if (alts.some((a) => matches(a, inQ))) score += 3;
        else if (alts.some((a) => matches(a, inA))) score += 1;
      }
      if (score > 0) hits.push({ item, section: s.title, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
