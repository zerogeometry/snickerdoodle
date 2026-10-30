import { beforeEach, describe, expect, it } from 'vitest';
import { selectionForLine } from '@/lib/basket-line';
import { useSelection } from '@/lib/store';

// sweep 02-B3: reopening a card from the basket (`/customize/card?edit=<id>`) showed whatever card was
// customised last in the tab — its message and span weren't seeded — so "update basket" printed the
// "for Gran" card blank and front-only (and folded it into the other card's line).
const forGran = { greeting: 'for Gran', message: 'happy christmas', signature: 'love sam', note: '', font: 'caveat', fontScale: 1 };

beforeEach(() => useSelection.setState({ selections: {} }));

describe('selectionForLine — reopening a basket line', () => {
  it('a card brings back ITS inside message and outside span', () => {
    // the tab last customised a blank, front-only card…
    useSelection.getState().setSelection('card', { message: undefined, cardImageSpan: 'front' });
    // …then the "for Gran" full-width card is reopened from the basket
    useSelection.getState().setSelection('card', selectionForLine({ message: forGran, cardImageSpan: 'full' }, { size: 'A6' }));
    expect(useSelection.getState().selections.card).toMatchObject({ message: forGran, cardImageSpan: 'full', size: 'A6' });
  });

  it('a blank card reopened after a message card is blank and front-only again (nothing stale kept)', () => {
    useSelection.getState().setSelection('card', { message: forGran, cardImageSpan: 'full' });
    useSelection.getState().setSelection('card', selectionForLine({}, {}));
    const sel = useSelection.getState().selections.card!;
    expect(sel.message).toBeUndefined();
    expect(sel.cardImageSpan).toBe('front');
  });

  it('still seeds the variant options, the cushion back and the base colour', () => {
    expect(selectionForLine({ back: 'navy', ground: '#c8402a' }, { size: '18in', colour: 'white', grade: 'g', finish: 'f' })).toEqual({
      size: '18in', colour: 'white', orientation: 'portrait', grade: 'g', finish: 'f', back: 'navy', ground: '#c8402a', message: undefined, cardImageSpan: 'front',
    });
  });
});
