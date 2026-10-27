/**
 * Prodigi Print API v4 client — the POD provider adapter (D4).
 *
 * SCOPE & SAFETY: this module exposes METADATA-ONLY calls (product details, used by
 * the catalogue sync). It NEVER sends a child's image. The live hand-off of a child's
 * artwork to a POD (order submission, Phase 3) must pass the single chokepoint
 * `assertPodEgressAllowed` in src/fulfillment/gate.ts — a server-side, asset-aware
 * predicate that stays closed until LG3 + LG6 are green. Do not add an order-submission
 * call here that bypasses that gate.
 *
 * Residency: the sandbox/live API is Prodigi's (api.prodigi.com). Only SKUs and,
 * later, order metadata flow here — never an image until the gate opens.
 */
import 'server-only';

const DEFAULT_BASE = 'https://api.sandbox.prodigi.com/v4.0';

export interface ProdigiProductDimensions {
  width: number;
  height: number;
  units: string;
}

export interface ProdigiVariant {
  /** A concrete attribute combination, e.g. { size: 'a3', color: 'black' }. */
  attributes: Record<string, string>;
  /** ISO country codes this variant ships to. */
  shipsTo?: string[];
  /** Each print area's file size in px, e.g. { default: { horizontalResolution: 2008, verticalResolution: 1725 } }. */
  printAreaSizes?: Record<string, { horizontalResolution: number; verticalResolution: number }>;
}

export interface ProdigiProduct {
  sku: string;
  description: string;
  productDimensions?: ProdigiProductDimensions;
  /** Each axis → its allowed values, e.g. { size: ['a3','a4'], color: ['black', …] }. */
  attributes: Record<string, string[]>;
  /** Print areas the product exposes, e.g. { front: { required: true }, back: {…} }. */
  printAreas: Record<string, { required?: boolean }>;
  variants: ProdigiVariant[];
}

interface ProductResponse {
  outcome: string;
  product?: ProdigiProduct;
}

export class ProdigiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ProdigiError';
  }
}

/** True when a Prodigi API key is configured. Like Stripe, the rest of the app
 * degrades gracefully (catalogue sync is a no-op) when it isn't. */
export function isProdigiConfigured(): boolean {
  return Boolean(process.env.PRODIGI_API_KEY);
}

function config(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.PRODIGI_API_KEY;
  if (!apiKey) throw new ProdigiError('PRODIGI_API_KEY is not set', 0);
  const baseUrl = (process.env.PRODIGI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

/** Does the configured transport point at Prodigi's SANDBOX host? Key-independent, so
 * the gate/submitter can check config consistency without needing an API key. */
export function isSandboxHost(): boolean {
  const baseUrl = (process.env.PRODIGI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  try {
    return new URL(baseUrl).hostname === 'api.sandbox.prodigi.com';
  } catch {
    return false; // unparseable base URL — treat as NOT sandbox (the conservative answer)
  }
}

/** Shared HTTP helper — also used by the ORDER transport in ./orders.ts, whose only
 * caller is the gated fulfilment submitter (src/fulfillment/submit.ts). */
export async function request<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T | null }> {
  const { apiKey, baseUrl } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body: body as T | null };
}

/**
 * Fetch a Prodigi product's details. Returns `null` on 404 so the catalogue sync
 * can FLAG a missing/renamed SKU rather than throw. Throws {@link ProdigiError} on
 * any other non-2xx. Metadata only — no image, no personal data.
 */
export async function getProduct(sku: string): Promise<ProdigiProduct | null> {
  const { status, body } = await request<ProductResponse>(`/products/${encodeURIComponent(sku)}`);
  if (status === 404) return null;
  if (status < 200 || status >= 300) {
    throw new ProdigiError(`Prodigi getProduct(${sku}) failed with HTTP ${status}`, status);
  }
  return body?.product ?? null;
}

/** The injectable client surface the sync depends on (so tests can mock it). */
export interface ProdigiClient {
  getProduct(sku: string): Promise<ProdigiProduct | null>;
}

export const prodigiClient: ProdigiClient = { getProduct };

// The live child-image hand-off is gated by assertPodEgressAllowed in
// src/fulfillment/gate.ts (a server-side, asset-aware predicate). It is intentionally
// NOT here: this client is metadata-only, and the gate must sit beside the order/render
// path where the asset is in hand — not on the API client.
