/**
 * PRODIGI'S SOCK TEMPLATES (the ankle- and tube-sock template packs; .prodigi-assets/templates): each is
 * "both sides of ONE sock — the design will be the same for the pair". The print file's LEFT half is one
 * side of the sock, its RIGHT half the other side — the mirror image (the ankle sock's heel is on the
 * left in the left half, on the right in the right half; the file's middle line is the front of the sock,
 * its two outer edges meet at the back). A sock's outline in the LEFT half, traced off the template on
 * 16 Nov 2026, as the DESIGN canvas stands (the tube sock upright, cuff at the top — it is
 * turned for Prodigi only when the file is made): rows top to bottom, each [left, right] as fractions of
 * the half's width (null = no sock in that row). The right half's outline is its mirror.
 *
 * Used to lay each side onto its sock in the photo (seedMockups sideQuad), so a preview shows exactly the
 * part of the file that prints on the side you see. Below: the tube sock's outline.
 */
export interface SockSide {
  /** the half of the print file one side fills, in mm (the design canvas, upright) */
  halfMm: { w: number; h: number };
  spans: ReadonlyArray<readonly [number, number] | null>;
}

// prettier-ignore
const TUBE: SockSide['spans'] = [
  null, null, null, null, null, null, null, null,
  [0.326, 0.884], [0.325, 0.885], [0.323, 0.886], [0.321, 0.888], [0.320, 0.889], [0.317, 0.890], [0.315, 0.893], [0.312, 0.895],
  [0.309, 0.898], [0.306, 0.900], [0.302, 0.903], [0.298, 0.908], [0.292, 0.913], [0.291, 0.914], [0.291, 0.914], [0.291, 0.914],
  [0.291, 0.914], [0.291, 0.914], [0.291, 0.913], [0.291, 0.913], [0.291, 0.914], [0.291, 0.913], [0.291, 0.913], [0.290, 0.913],
  [0.290, 0.913], [0.290, 0.912], [0.290, 0.912], [0.290, 0.912], [0.290, 0.912], [0.290, 0.912], [0.290, 0.912], [0.290, 0.912],
  [0.290, 0.912], [0.290, 0.912], [0.290, 0.912], [0.290, 0.912], [0.289, 0.912], [0.289, 0.912], [0.289, 0.911], [0.289, 0.911],
  [0.289, 0.911], [0.289, 0.911], [0.289, 0.911], [0.289, 0.911], [0.289, 0.911], [0.289, 0.911], [0.289, 0.911], [0.289, 0.911],
  [0.289, 0.911], [0.288, 0.911], [0.288, 0.911], [0.288, 0.910], [0.288, 0.910], [0.287, 0.910], [0.288, 0.910], [0.288, 0.910],
  [0.287, 0.910], [0.287, 0.910], [0.287, 0.910], [0.287, 0.910], [0.287, 0.910], [0.287, 0.910], [0.287, 0.910], [0.287, 0.910],
  [0.287, 0.909], [0.287, 0.909], [0.286, 0.909], [0.287, 0.909], [0.287, 0.909], [0.286, 0.909], [0.286, 0.909], [0.286, 0.909],
  [0.286, 0.909], [0.286, 0.909], [0.286, 0.909], [0.286, 0.909], [0.286, 0.909], [0.286, 0.908], [0.286, 0.908], [0.285, 0.908],
  [0.286, 0.908], [0.286, 0.908], [0.285, 0.908], [0.285, 0.907], [0.285, 0.907], [0.285, 0.908], [0.285, 0.907], [0.285, 0.907],
  [0.285, 0.907], [0.285, 0.907], [0.285, 0.907], [0.285, 0.907], [0.284, 0.907], [0.285, 0.907], [0.285, 0.907], [0.284, 0.907],
  [0.284, 0.906], [0.284, 0.906], [0.284, 0.907], [0.284, 0.906], [0.284, 0.906], [0.283, 0.906], [0.283, 0.906], [0.283, 0.906],
  [0.283, 0.906], [0.283, 0.906], [0.283, 0.906], [0.283, 0.906], [0.283, 0.906], [0.283, 0.905], [0.283, 0.905], [0.283, 0.906],
  [0.283, 0.905], [0.283, 0.905], [0.282, 0.905], [0.282, 0.905], [0.282, 0.905], [0.282, 0.905], [0.282, 0.905], [0.282, 0.905],
  [0.282, 0.905], [0.282, 0.905], [0.282, 0.904], [0.282, 0.904], [0.282, 0.905], [0.282, 0.904], [0.282, 0.904], [0.281, 0.904],
  [0.281, 0.904], [0.281, 0.903], [0.282, 0.903], [0.284, 0.900], [0.288, 0.896], [0.293, 0.889], [0.301, 0.880], [0.310, 0.870],
  [0.321, 0.858], [0.334, 0.843], [0.351, 0.826], [0.370, 0.805], [0.393, 0.779], [0.423, 0.747], [0.463, 0.706], [0.533, 0.632],
  null, null, null, null, null, null, null, null,
];

/** tube: 30 × 52 cm upright (prodigi-socks-tube.png). (The ankle set is built on its template outright —
 * compose-founder-layers composeFromTemplate — so it needs no tracing here.) */
export const SOCK_SIDES = {
  tube: { halfMm: { w: 150, h: 520 }, spans: TUBE },
} as const satisfies Record<string, SockSide>;
