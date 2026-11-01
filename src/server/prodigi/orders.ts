/**
 * Prodigi Print API v4 — ORDER transport (create + status). Shapes verified against
 * the official reference (prodigi.com/print-api/docs/reference, 2026-07-04).
 *
 * SAFETY: this is a dumb transport. Its ONLY caller is the gated fulfilment
 * submitter (src/fulfillment/submit.ts), which asserts `assertPodEgressAllowed`
 * per asset BEFORE any print-file URL is placed in a payload here. Do not call
 * this module from anywhere else — the gate is the law (CLAUDE.md NN1/NN4).
 */
import 'server-only';
import { ProdigiError, request } from './client';

export interface ProdigiRecipient {
  name: string;
  email?: string;
  address: {
    line1: string;
    line2?: string | null;
    townOrCity: string;
    stateOrCounty?: string | null;
    postalOrZipCode: string;
    countryCode: string;
  };
}

export interface ProdigiOrderItemInput {
  merchantReference?: string;
  sku: string;
  copies: number;
  /** 'fillPrintArea' | 'fitPrintArea' | 'stretchToPrintArea' */
  sizing: string;
  attributes?: Record<string, string>;
  assets: { printArea: string; url: string; md5Hash?: string }[];
}

export interface CreateOrderRequest {
  merchantReference?: string;
  /** 'Budget' | 'Standard' | 'StandardPlus' | 'Express' | 'Overnight' */
  shippingMethod: string;
  /** Duplicate detection — Prodigi remembers keys indefinitely; a duplicate returns
   * outcome `alreadyExists` with the EXISTING order (our exactly-once anchor). */
  idempotencyKey?: string;
  recipient: ProdigiRecipient;
  items: ProdigiOrderItemInput[];
  metadata?: Record<string, unknown>;
  /** Per-order printed INSERTS (Prodigi "branding"): each slot is a print-ready file URL. We use ONE
   * slot, for the gift note (src/fulfillment/giftNoteInsert.ts). A lab that can't make a slot just
   * leaves it out of that shipment — no error, no charge (API reference, "Branding"). */
  branding?: Partial<Record<ProdigiInsertSlot, { url: string }>>;
}

/** The insert slots Prodigi's `branding` takes (the four sticker slots are never used here). */
export type ProdigiInsertSlot = 'postcard' | 'flyer' | 'packing_slip_bw' | 'packing_slip_color';

/** A quote asking which shipments would carry the named inserts. Names only — no artwork, no URLs. */
export interface InsertQuoteRequest {
  shippingMethod: string;
  destinationCountryCode: string;
  items: { sku: string; copies: number; attributes?: Record<string, string>; printAreas: string[] }[];
  inserts: ProdigiInsertSlot[];
}

/** One shipment of that quote: the lab that makes it and the inserts it would carry. */
export interface InsertQuoteShipment {
  lab: string;
  brandingItems: string[];
}

export interface ProdigiOrderStatus {
  /** 'InProgress' | 'Complete' | 'Cancelled' */
  stage: string;
  issues?: { objectId?: string; errorCode?: string; description?: string }[];
  details?: Record<string, string>;
}

export interface ProdigiShipment {
  id: string;
  carrier?: { name?: string; service?: string } | string | null;
  dispatchDate?: string | null;
  items?: unknown[];
  tracking?: { number?: string | null; url?: string | null } | null;
}

export interface ProdigiOrder {
  id: string;
  merchantReference?: string | null;
  status: ProdigiOrderStatus;
  shipments?: ProdigiShipment[];
}

interface OrderResponse {
  outcome?: string;
  order?: ProdigiOrder;
}

export interface CreateOrderResult {
  /** Lower-cased outcome: 'created' | 'onhold' | 'createdwithissues' | 'alreadyexists'. */
  outcome: string;
  order: ProdigiOrder;
}

/** The injectable transport surface — the submitter depends on THIS, so tests use a fake. */
export interface ProdigiOrderTransport {
  createOrder(req: CreateOrderRequest): Promise<CreateOrderResult>;
  getOrder(prodigiOrderId: string): Promise<ProdigiOrder>;
  /** Which shipments would carry these inserts (read-only POST /quotes). Optional: a transport
   * without it just means "couldn't check" — Prodigi still skips an insert a lab can't make. */
  quoteInserts?(req: InsertQuoteRequest): Promise<InsertQuoteShipment[]>;
}

/** Outcomes the docs list for a successful create (HTTP 200). Compared lower-cased —
 * the reference self-contradicts on casing ('Created' vs 'created'). */
const CREATE_OK = new Set(['created', 'onhold', 'createdwithissues', 'alreadyexists']);

async function createOrder(reqBody: CreateOrderRequest): Promise<CreateOrderResult> {
  const { status, body } = await request<OrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify(reqBody),
  });
  const outcome = (body?.outcome ?? '').toLowerCase();
  if (status < 200 || status >= 300 || !CREATE_OK.has(outcome) || !body?.order?.id) {
    const detail = typeof body === 'object' ? JSON.stringify(body).slice(0, 500) : String(body);
    throw new ProdigiError(`Prodigi createOrder failed: HTTP ${status} outcome=${body?.outcome ?? '?'} ${detail}`, status);
  }
  return { outcome, order: body.order };
}

async function getOrder(prodigiOrderId: string): Promise<ProdigiOrder> {
  const { status, body } = await request<OrderResponse>(`/orders/${encodeURIComponent(prodigiOrderId)}`);
  if (status < 200 || status >= 300 || !body?.order) {
    throw new ProdigiError(`Prodigi getOrder(${prodigiOrderId}) failed with HTTP ${status}`, status);
  }
  return body.order;
}

interface QuoteResponse {
  outcome?: string;
  quotes?: { shipments?: { fulfillmentLocation?: { labCode?: string }; brandingItems?: string[] | null }[] }[];
}

async function quoteInserts(req: InsertQuoteRequest): Promise<InsertQuoteShipment[]> {
  const { status, body } = await request<QuoteResponse>('/quotes', {
    method: 'POST',
    body: JSON.stringify({
      shippingMethod: req.shippingMethod,
      destinationCountryCode: req.destinationCountryCode,
      currencyCode: 'GBP',
      items: req.items.map((i) => ({ sku: i.sku, copies: i.copies, ...(i.attributes ? { attributes: i.attributes } : {}), assets: i.printAreas.map((printArea) => ({ printArea })) })),
      branding: { inserts: req.inserts },
    }),
  });
  const quote = body?.quotes?.[0];
  if (status < 200 || status >= 300 || !quote) {
    throw new ProdigiError(`Prodigi quote failed: HTTP ${status} outcome=${body?.outcome ?? '?'}`, status);
  }
  return (quote.shipments ?? []).map((s) => ({ lab: s.fulfillmentLocation?.labCode ?? 'unknown', brandingItems: s.brandingItems ?? [] }));
}

export const prodigiOrderTransport: ProdigiOrderTransport = { createOrder, getOrder, quoteInserts };
