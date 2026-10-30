/** Where an order's printed gift-note file lives (private bucket; plan C9, ./giftNoteInsert.ts). Its
 * own tiny module so account closure can find the file without loading the renderer. */
export function giftNoteInsertKey(orderId: string): string {
  return `orders/${orderId}/gift-note-insert.png`;
}
