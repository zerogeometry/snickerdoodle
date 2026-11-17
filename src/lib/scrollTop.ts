/** Jump to the very top of the page at once (never a smooth glide — a new page should simply start there). */
export function scrollToTopNow(): void {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}
