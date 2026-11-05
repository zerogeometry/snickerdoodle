/** Where an order's composed MULTI PHOTO FRAME file lives while Prodigi fetches it (private bucket,
 * behind a short provider link; composed at submit — src/server/print/frameGrid.ts). It holds every
 * square's drawing at once, so it is order-scoped and short-lived: deleted when the order ships or is
 * cancelled, when the submit attempt that made it fails, and on account closure. Its own tiny module
 * so account closure can find the file without loading the renderer. */
export function frameGridKey(orderId: string, orderItemId: string): string {
  return `orders/${orderId}/frame-${orderItemId}.png`;
}
