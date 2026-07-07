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
export type Upload = { dataUrl: string; name: string; assetId?: string; opaqueBg?: boolean; cutout?: { url: string; sourceObjectId: string } } | null;
export const useUpload = create<{
  upload: Upload;
  setUpload: (u: Upload) => void;
  setAssetId: (id: string) => void;
  setOpaqueBg: (opaque: boolean) => void;
  setCutout: (c: { url: string; sourceObjectId: string }) => void;
  resetUpload: () => void; // "Create Another" — new drawing, keep the basket
}>((set) => ({
  upload: null,
  setUpload: (upload) => set({ upload }),
  setAssetId: (assetId) => set((s) => (s.upload ? { upload: { ...s.upload, assetId } } : {})),
  setOpaqueBg: (opaqueBg) => set((s) => (s.upload ? { upload: { ...s.upload, opaqueBg } } : {})),
  setCutout: (cutout) => set((s) => (s.upload ? { upload: { ...s.upload, cutout } } : {})),
  resetUpload: () => set({ upload: null }),
}));

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
};
type BasketState = {
  items: BasketItem[];
  add: (item: Omit<BasketItem, 'qty'>) => void;
  setQty: (id: string, qty: number) => void;
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
export type Selection = { size?: string; colour?: string; orientation?: string };
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
