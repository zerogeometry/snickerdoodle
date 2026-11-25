-- A signed-in shopper's basket remembered on their account (founder, 25 Nov 2026), and when its one reminder
-- email went (src/server/savedBasket.ts). Additive only: a new table, gone with the account.
CREATE TABLE "saved_baskets" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "saved_baskets" ADD CONSTRAINT "saved_baskets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_basket_due_idx" ON "saved_baskets" USING btree ("reminded_at","updated_at");