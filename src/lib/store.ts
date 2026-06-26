import { create } from 'zustand';
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
export type Upload = { dataUrl: string; name: string } | null;
export const useUpload = create<{ upload: Upload; setUpload: (u: Upload) => void }>((set) => ({
  upload: null,
  setUpload: (upload) => set({ upload }),
}));

// ── basket ───────────────────────────────────────────────────────────────────
export type PlacementTransform = { scale: number; offsetX: number; offsetY: number; rotationDeg: number };
export type BasketItem = {
  id: string;
  name: string;
  product: ProductKey;
  pricePence: number;
  qty: number;
  sub?: string;
  /** Set for a personalised line placed in the studio: the chosen variant + the
   * keepsake + its placement. The server re-clamps + freezes this at order time. */
  variantId?: string;
  artwork?: { assetId: string; transform: PlacementTransform };
};
type BasketState = {
  items: BasketItem[];
  add: (item: Omit<BasketItem, 'qty'>) => void;
  remove: (id: string) => void;
  clear: () => void;
  seed: (items: Omit<BasketItem, 'qty'>[]) => void;
};
export const useBasket = create<BasketState>((set) => ({
  items: [],
  add: (item) =>
    set((s) => {
      const existing = s.items.find((x) => x.id === item.id);
      if (existing) return { items: s.items.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x)) };
      return { items: [...s.items, { ...item, qty: 1 }] };
    }),
  remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
  clear: () => set({ items: [] }),
  seed: (items) => set({ items: items.map((i) => ({ ...i, qty: 1 })) }),
}));
export const basketCount = (items: BasketItem[]) => items.reduce((n, i) => n + i.qty, 0);
export const basketSubtotal = (items: BasketItem[]) => items.reduce((n, i) => n + i.pricePence * i.qty, 0);

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
