import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MultiBuyNudgeLine, nudgeText } from '@/ui/components/MultiBuy';

// The checkout's "add one more and save" line (founder, 29 Oct): small, warm, never pushy — and a real,
// labelled, keyboard-operable button with a 44px tap target. Its figures come from the server quote.
describe('MultiBuyNudgeLine', () => {
  it('reads plainly: "both" for two, "all N" beyond', () => {
    expect(nudgeText(2, 1500)).toBe('add 1 more — both 15% off');
    expect(nudgeText(3, 1000)).toBe('add 1 more — all 3 10% off');
  });

  it('is ONE native button (keyboard-operable), labelled with the product, ≥ 44px tall, no pressure', () => {
    const html = renderToStaticMarkup(createElement(MultiBuyNudgeLine, { nextQty: 2, bps: 1500, productLabel: 'mug', onAdd: vi.fn() }));
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="add one more mug — both 15% off"');
    expect(html).toContain('min-h-11'); // 44px
    expect(html).toContain('add 1 more — both 15% off');
    // nothing pushy: no countdown, no "hurry", no pre-ticked box
    expect(html).not.toMatch(/hurry|only \d+ left|ends in|checkbox|checked/i);
  });

  it('adds exactly one more when pressed', () => {
    const onAdd = vi.fn();
    const el = MultiBuyNudgeLine({ nextQty: 3, bps: 1500, productLabel: 'framed print', onAdd }) as { props: { onClick: () => void } };
    el.props.onClick();
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
