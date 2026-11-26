-- Admin "try again" on a stuck order fills in print-lab settings the order was saved without (founder, 26 Nov 2026),
-- recorded as this audit event. Additive only: the value is only ADDED here, never used in this transaction.
ALTER TYPE "public"."audit_event" ADD VALUE 'ADMIN_ORDER_RETRIED';