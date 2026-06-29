-- Collapse any pre-existing duplicate keys (e.g. mockup derivatives written twice by a
-- check-then-insert race before this constraint existed). Duplicates share the same key
-- AND the same bytes (same deterministic key → same object), so keeping one is lossless.
DELETE FROM "storage_objects" a USING "storage_objects" b WHERE a."key" = b."key" AND a.ctid < b.ctid;
--> statement-breakpoint
CREATE UNIQUE INDEX "storage_object_key_unique" ON "storage_objects" USING btree ("key");