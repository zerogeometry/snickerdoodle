/**
 * Customer service (founder, 23 Oct): answers first, then a person. The help page searches the FAQ;
 * if that doesn't do it, the shopper picks a topic — which shows the likeliest answers once more —
 * and then sends a message. Order questions come through here too (with the order reference), and
 * we do what we can. Client-safe: the help page, the form and the server all read this.
 */

/** Everyday contact (and the data-protection address). */
export const HELLO_EMAIL = 'hello@snickerdoodle.co.uk';
/** Customer service — where help-form messages are delivered. */
export const SUPPORT_EMAIL = 'support@snickerdoodle.co.uk';

export interface SupportTopic {
  id: string;
  label: string;
  /** A line under the topic, saying what it covers. */
  hint: string;
  /** Ask for the order reference (shown on "your orders" and in the order email). */
  order?: boolean;
  /** FAQ answers to try first (ids in src/lib/faq.ts). */
  suggest: string[];
}

export const SUPPORT_TOPICS: SupportTopic[] = [
  { id: 'order-where', label: 'Where’s my order?', hint: 'tracking and delivery', order: true, suggest: ['delivery-cost', 'where-made'] },
  { id: 'order-change', label: 'Change or cancel an order', hint: 'a different size, colour or address', order: true, suggest: ['change-order'] },
  { id: 'order-problem', label: 'Something’s not right with my order', hint: 'damaged, faulty or not what you expected', order: true, suggest: ['returns'] },
  { id: 'making', label: 'Help making something', hint: 'uploading, the studio, print quality', suggest: ['best-photo', 'print-quality', 'remove-background'] },
  { id: 'gifts', label: 'Gifts and family', hint: 'gift links, gift lists, inviting family', suggest: ['grandparents-buy', 'gift-link-private', 'invite-family'] },
  { id: 'account', label: 'My account or signing in', hint: 'sign-in links, your account', suggest: ['need-an-account', 'delete-download'] },
  { id: 'privacy', label: 'My data and privacy', hint: 'what we keep, deleting things', suggest: ['how-long-kept', 'delete-download', 'is-it-private'] },
  { id: 'other', label: 'Something else', hint: 'ideas, questions, a hello', suggest: [] },
];

export const supportTopic = (id: unknown): SupportTopic | undefined => SUPPORT_TOPICS.find((t) => t.id === id);

/** An order reference as people type it → our form (upper case, no spaces), or null. */
export function cleanOrderRef(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9-]{4,32}$/.test(v) ? v : null;
}
