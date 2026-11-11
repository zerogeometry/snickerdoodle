-- The name the parent gives someone in the invite sheet, so it becomes their account name when they
-- join (unless they've already chosen their own). IF NOT EXISTS: safe to re-run, and numbered 0056
-- so it sits after the sharing-rules migration (0055) whichever branch lands first.
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "invitee_name" text;
