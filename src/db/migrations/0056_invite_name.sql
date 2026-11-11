-- The name the parent gives someone in the invite sheet, so it becomes their account name when they
-- join (unless they have already chosen their own). IF NOT EXISTS: safe where it was applied before the merge.
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "invitee_name" text;
