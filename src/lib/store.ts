import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ProductKey } from '@/ui/components/ProductArt';
import { DELIVERY_PENCE, formatPence } from '@/pricing';

/**
 * Lightweight client-side stores so the docs/03 flows are walkable end-to-end
 * before the backend lands. In-memory (survives client navigation; resets on a
 * full reload) — clearly a demo, not persistence. Swapped for server data +
 * the central authz module once auth/storage/DB are wired.
 */

export type VisibilityTier = 'ONLY_ME' | 'FAMILY' | 'EXTENDED';

// ── money helpers (re-exported from the server-trusted pricing module) ───────
export { DELIVERY_PENCE };
export const gbp = formatPence;

// ── the uploaded drawing (from Start Creating / camera) ──────────────────────
// `assetId` is set once the upload is ingested server-side (an ephemeral draft).
// Consent is NOT a client flag: the ACT of uploading is the acceptance (lawful basis
// = CONTRACT, Art 6(1)(b)), recorded SERVER-SIDE at ingest (termsAcceptedAt +
// termsVersion). The conspicuous upload-step notice is the transparency. See DECISIONS.md.
// `opaqueBg` = the image has NO transparent pixels (detected client-side after upload) —
// used to nudge "remove background" only when it would actually do something.
// `aspect` = the drawing's width/height (detected client-side after upload) — lets the catalogue
// tiles auto-orient (a wide drawing → a landscape frame/jigsaw thumbnail) BEFORE the shopper opens
// the customize page, mirroring the customize-page auto-orient. Absent until measured.
// `kept` = it's in the family's keepsake box ("+ keepsake" done).
// `scratch` = a blank canvas made for "design from scratch" (no drawing to edit — the Studio hides
// its image tools, and the range shows the design rather than the empty canvas).
export type Upload = { dataUrl: string; name: string; assetId?: string; opaqueBg?: boolean; aspect?: number; cutout?: { url: string; sourceObjectId: string }; scratch?: boolean; kept?: boolean } | null;
export const useUpload = create<{
  upload: Upload;
  setUpload: (u: Upload) => void;
  setAssetId: (id: string) => void;
  setOpaqueBg: (opaque: boolean) => void;
  setAspect: (aspect: number) => void;
  /** The DESIGN products render from (bg-removed / studio-edited); null = the original. */
  setCutout: (c: { url: string; sourceObjectId: string } | null) => void;
  resetUpload: () => void; // "Create Another" — new drawing, keep the basket
}>((set) => ({
  upload: null,
  setUpload: (upload) => set({ upload }),
  setAssetId: (assetId) => set((s) => (s.upload ? { upload: { ...s.upload, assetId } } : {})),
  setOpaqueBg: (opaqueBg) => set((s) => (s.upload ? { upload: { ...s.upload, opaqueBg } } : {})),
  setAspect: (aspect) => set((s) => (s.upload ? { upload: { ...s.upload, aspect } } : {})),
  setCutout: (cutout) => set((s) => (s.upload ? { upload: { ...s.upload, cutout: cutout ?? undefined } } : {})),
  resetUpload: () => set({ upload: null }),
}));

/**
 * The image's width/height (aspect ratio) — for auto-orienting catalogue tiles. Decodes only
 * to read natural dimensions. Resolves undefined on any decode failure (tiles fall back to the
 * product default orientation — never a wrong guess).
 */
export function detectAspect(dataUrl: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : undefined);
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

/**
 * Does the image contain any transparency? Downsampled alpha scan (≤128px) so it's
 * effectively free. Non-PNG formats can't carry alpha → opaque without decoding.
 * Resolves true/false; on any decode failure resolves false (no nudge — never nag wrongly).
 */
export function detectOpaqueBg(dataUrl: string, name: string): Promise<boolean> {
  if (!/\.png$/i.test(name) && !dataUrl.startsWith('data:image/png')) return Promise.resolve(true);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 128 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(false);
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        for (let i = 3; i < data.length; i += 4) if (data[i]! < 250) return resolve(false); // transparency found
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

// The ingest server action has a 20MB body cap (next.config). A modern phone photo or
// an AI-generated render can exceed it → a 413 that leaves the upload with no assetId,
// so every mockup silently falls back to the placeholder. Normalise BEFORE ingest:
// cap the longest edge (still ample for print — the DPI gate + tiered upscale cover the
// largest products), and re-encode heavy OPAQUE images as JPEG (a 20MB photo-PNG becomes
// ~1MB); transparency stays PNG so cut-outs and the bg-remove flow are untouched.
const MAX_UPLOAD_EDGE = 4500; // px — 15in at 300dpi; the biggest frame upscales gracefully
const REENCODE_BYTES = 8_000_000; // re-encode anything heavier than this

/** Best-effort client-side normalise. On any failure returns the input unchanged —
 * a normalise problem must never block an upload. */
export function normalizeUpload(dataUrl: string, name: string): Promise<{ dataUrl: string; name: string }> {
  const approxBytes = dataUrl.length * 0.75; // base64 → bytes
  const looksPng = /\.png$/i.test(name) || dataUrl.startsWith('data:image/png');
  return new Promise((resolve) => {
    const done = (d: string, n: string) => resolve({ dataUrl: d, name: n });
    const img = new Image();
    img.onerror = () => done(dataUrl, name);
    img.onload = () => {
      try {
        const longest = Math.max(img.width, img.height);
        if (longest <= MAX_UPLOAD_EDGE && approxBytes <= REENCODE_BYTES) return done(dataUrl, name); // small original — leave it
        const scale = Math.min(1, MAX_UPLOAD_EDGE / longest);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(dataUrl, name);
        ctx.drawImage(img, 0, 0, w, h);
        // Detect transparency on a small scan (only PNGs can carry it).
        let alpha = false;
        if (looksPng) {
          const s = Math.min(1, 220 / Math.max(w, h));
          const sw = Math.max(1, Math.round(w * s));
          const sh = Math.max(1, Math.round(h * s));
          const tmp = document.createElement('canvas');
          tmp.width = sw;
          tmp.height = sh;
          const tctx = tmp.getContext('2d');
          if (tctx) {
            tctx.drawImage(img, 0, 0, sw, sh);
            const { data } = tctx.getImageData(0, 0, sw, sh);
            for (let i = 3; i < data.length; i += 4)
              if (data[i]! < 250) {
                alpha = true;
                break;
              }
          }
        }
        const base = name.replace(/\.[^.]+$/, '') || 'drawing';
        if (alpha) done(canvas.toDataURL('image/png'), `${base}.png`);
        else done(canvas.toDataURL('image/jpeg', 0.92), `${base}.jpg`);
      } catch {
        done(dataUrl, name);
      }
    };
    img.src = dataUrl;
  });
}

// ── basket ───────────────────────────────────────────────────────────────────
export type PlacementTransform = { scale: number; offsetX: number; offsetY: number; rotationDeg: number };
/** The greetings-card INSIDE message (optional — present only when the shopper chose "add a
 * message"). Four fields → the card's four inside text quads: `greeting`/`message`/`signature` on
 * the right page, `note` (a big centred line) on the left. One `font` (a card-fonts token) + one
 * `fontScale` (a size multiplier, ~0.85–1.3) for all four. Every field is abuse-screened
 * server-side before it can print. */
export type CardMessage = { greeting: string; message: string; signature: string; note: string; font: string; fontScale?: number };
export type BasketItem = {
  id: string;
  name: string;
  product: ProductKey;
  pricePence: number;
  qty: number;
  sub?: string; // the size/colour line shown under the name
  /** The chosen variant. `sku` is the SERVER PRICING KEY — when set the server
   * prices this exact variant; otherwise it falls back to the product's default. */
  variantId?: string;
  sku?: string;
  /** Set for a personalised line placed in the studio: the keepsake + its placement
   * (+ an optional bg-removed cutout to render from). The server re-clamps + freezes
   * this at order time. */
  artwork?: { assetId: string; transform: PlacementTransform; sourceObjectId?: string };
  /** CUSHION back side (double-sided-capable squares only): 'white' = plain white back =
   * SINGLE-sided (the default); 'both' = the same image on both sides; a colour token from
   * CUSHION_BACK_COLOURS = image front + that plain back. Both non-white choices select the
   * DUAL variant (a different SKU + price). Absent / heart+round = single-sided. Display, the
   * variant resolver, AND the DUAL fulfilment renderer all read this. */
  back?: string;
  /** GREETINGS-CARD inside message (card only) — absent = blank inside (write it by hand). */
  message?: CardMessage;
  /** GREETINGS-CARD outside image span (card only): 'front' = the drawing on the front panel only
   * (default); 'full' = it spans the whole outside across the fold. */
  cardImageSpan?: 'full' | 'front';
};
type BasketState = {
  items: BasketItem[];
  add: (item: Omit<BasketItem, 'qty'>) => void;
  setQty: (id: string, qty: number) => void;
  /** Edit a line in place (the basket-item → Customize → "update basket" round-trip).
   * Keeps the line's position + quantity. If the edit changed the variant its natural
   * line id changes too (`newId`); re-key it, and if another line already holds that id
   * (same product+variant) fold the two together so we never get duplicate variant lines. */
  update: (id: string, patch: Partial<Omit<BasketItem, 'id' | 'qty'>>, newId?: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  seed: (items: Omit<BasketItem, 'qty'>[]) => void;
};
export const useBasket = create<BasketState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const existing = s.items.find((x) => x.id === item.id);
          if (existing) return { items: s.items.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x)) };
          return { items: [...s.items, { ...item, qty: 1 }] };
        }),
      setQty: (id, qty) =>
        set((s) => ({
          items: qty <= 0 ? s.items.filter((x) => x.id !== id) : s.items.map((x) => (x.id === id ? { ...x, qty } : x)),
        })),
      update: (id, patch, newId) =>
        set((s) => {
          const cur = s.items.find((x) => x.id === id);
          if (!cur) return {};
          const targetId = newId ?? id;
          // Variant changed AND a line for that variant already exists → merge the two
          // (sum quantities), dropping the edited line so there's one line per variant.
          if (targetId !== id && s.items.some((x) => x.id === targetId)) {
            return {
              items: s.items
                .filter((x) => x.id !== id)
                .map((x) => (x.id === targetId ? { ...x, ...patch, id: targetId, qty: x.qty + cur.qty } : x)),
            };
          }
          // Otherwise patch in place (re-keying to targetId if the variant changed) —
          // position + quantity preserved.
          return { items: s.items.map((x) => (x.id === id ? { ...x, ...patch, id: targetId } : x)) };
        }),
      remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
      clear: () => set({ items: [] }),
      seed: (items) => set({ items: items.map((i) => ({ ...i, qty: 1 })) }),
    }),
    // Survive a reload — incl. the full reload the magic-link login triggers — so
    // the basket isn't emptied mid-flow. Per-tab (sessionStorage); only the items.
    { name: 'sd_basket', storage: createJSONStorage(() => sessionStorage), partialize: (s) => ({ items: s.items }) },
  ),
);
export const basketCount = (items: BasketItem[]) => items.reduce((n, i) => n + i.qty, 0);
export const basketSubtotal = (items: BasketItem[]) => items.reduce((n, i) => n + i.pricePence * i.qty, 0);

// ── studio placements (Save & Return carries a placement back to Customize) ──
// Keyed by `${assetId}-${productKey}`.
export const usePlacements = create<{
  placements: Record<string, PlacementTransform>;
  setPlacement: (key: string, tf: PlacementTransform) => void;
}>((set) => ({
  placements: {},
  setPlacement: (key, tf) => set((s) => ({ placements: { ...s.placements, [key]: tf } })),
}));

// ── customize selection (size / colour / orientation), keyed by productKey ──
// Persists the shopper's chosen variant across the Customize ↔ editor round-trip
// (so pressing "edit placement" then "save & return" no longer resets it to the
// default), and lets the editor's orientation toggle write back so Customize
// reflects it on return. In-memory: a demo selection, not durable state.
export type Selection = { size?: string; colour?: string; orientation?: string; back?: string; message?: CardMessage; cardImageSpan?: 'full' | 'front' };
export const useSelection = create<{
  selections: Record<string, Selection>;
  setSelection: (productKey: string, patch: Selection) => void;
}>((set) => ({
  selections: {},
  setSelection: (productKey, patch) =>
    set((s) => ({ selections: { ...s.selections, [productKey]: { ...s.selections[productKey], ...patch } } })),
}));

// ── kept creations (the Keepsake Home) ───────────────────────────────────────
export type Kept = {
  id: string;
  name: string;
  image?: string;
  product?: ProductKey;
  meta?: string;
  visibility: VisibilityTier;
};
export const useKept = create<{ items: Kept[]; add: (k: Kept) => void; setVisibility: (id: string, v: VisibilityTier) => void }>(
  (set) => ({
    items: [],
    add: (k) => set((s) => ({ items: [k, ...s.items] })),
    setVisibility: (id, v) => set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, visibility: v } : x)) })),
  }),
);

// ── orders (placed at the demo checkout confirmation) ────────────────────────
export type Order = { id: string; ref: string; items: BasketItem[]; totalPence: number };
export const useOrders = create<{ orders: Order[]; add: (o: Order) => void }>((set) => ({
  orders: [],
  add: (o) => set((s) => ({ orders: [o, ...s.orders] })),
}));

// The child a creation is "for" — captured in "Who's this for?", carried across
// the magic-link round-trip via sessionStorage so checkout / share can show + use
// it. Child FIRST NAME ONLY (never a surname) per the children's-data rules.
export const SUBJECT_KEY = 'sd_subject';

// ── family members (added via the Add-family-member modal) ───────────────────
export type Member = { id: string; initial: string; name: string; sub?: string; color: string; textColor?: string };
export const useFamily = create<{ members: Member[]; add: (m: Member) => void }>((set) => ({
  members: [],
  add: (m) => set((s) => ({ members: [...s.members, m] })),
}));

// ── toasts ───────────────────────────────────────────────────────────────────
let toastId = 0;
export type Toast = { id: number; message: string };
export const useToasts = create<{ toasts: Toast[]; push: (message: string) => void; dismiss: (id: number) => void }>(
  (set) => ({
    toasts: [],
    push: (message) => {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts, { id, message }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  }),
);
export const toast = (message: string) => useToasts.getState().push(message);
