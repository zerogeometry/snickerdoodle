-- A phone case whose Standard post isn't tracked goes to Prodigi as its own Express order, so the rest of the basket
-- isn't sent Express (founder, 26 Nov 2026): that second Prodigi order's id. Additive only.
ALTER TABLE "orders" ADD COLUMN "prodigi_split_order_id" text;