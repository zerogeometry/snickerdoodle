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

export const prodigiOrderTransport: ProdigiOrderTransport = { createOrder, getOrder };
