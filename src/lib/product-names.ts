/**
 * What ONE item is called once it's chosen, in a basket, ordered or shared (founder, 6 Nov): the
 * catalogue names are plural where there's a choice to make ("doodle cushions", "kids doodle tees"),
 * but a single item reads singular — "doodle cushion · heart" in the basket, on the receipt and on a
 * gift link. Products whose catalogue name already reads as one item (or as one set — placemats,
 * coasters, socks) aren't listed. Client-safe.
 */
export const ITEM_NAME: Readonly<Record<string, string>> = {
  framedPrint: 'framed doodle',
  cushion: 'doodle cushion',
  kidsTee: 'kids doodle tee',
  adultTee: 'adults doodle tee',
  jigsaw: 'doodle jigsaw',
  card: 'greetings card',
  cardPack: 'doodle card pack',
  christmasBundle: 'christmas family bundle',
  phoneCase: 'doodle phone case',
  watchStrap: 'apple watch strap',
};

/** One item's name: the singular above, else the catalogue name. Takes a product key or a variant sku. */
export const itemName = (keyOrSku: string, catalogueName: string): string => ITEM_NAME[keyOrSku.split('-')[0]!] ?? catalogueName;
