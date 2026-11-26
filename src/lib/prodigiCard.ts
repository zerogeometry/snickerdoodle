/**
 * Prodigi charges the card on our Prodigi account the moment an order is sent. When that card is declined (no funds,
 * expired, blocked), Prodigi refuses the order with outcome "PaymentFailed" (seen live 26 Nov 2026: HTTP 500,
 * "Your card has insufficient funds"). Nothing is wrong with the order itself, and every order waits until the card
 * is sorted, so it's told apart from every other refusal (founder, 26 Nov 2026).
 */
export function isCardDeclined(submitError: string | null | undefined): boolean {
  if (!submitError) return false;
  return /outcome=PaymentFailed|"outcome"\s*:\s*"PaymentFailed"|insufficient funds|card (was |has been )?declined|use a different payment method/i.test(submitError);
}

/** How soon to try again after a declined card: often, so an order goes through within minutes of the card being
 * topped up (a declined attempt costs nothing and makes no order), never the hours-long backoff of other faults. */
export const CARD_DECLINED_RETRY_MS = 15 * 60 * 1000;

/** Where the founder sorts the card. */
export const PRODIGI_DASHBOARD = 'https://dashboard.prodigi.com';
