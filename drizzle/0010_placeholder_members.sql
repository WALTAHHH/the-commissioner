-- Placeholder members (t_9006ef8d).
--
-- league_members gains four columns so a commissioner can reserve a roster
-- slot for a person who has not signed up yet:
--   is_placeholder   — true while the slot has no auth account
--   placeholder_name — display name shown until the slot is claimed
--   placeholder_email— when set, gates the auto-claim on invite redeem
--   placeholder_notes— freeform note for the commissioner
--   claimed_at       — when a real user took over the row
--
-- user_id becomes nullable: placeholder rows have no account. The existing
-- UNIQUE(league_id, user_id) index keeps working because Postgres treats
-- NULLs as distinct, so a league may hold any number of unclaimed slots while
-- still forbidding two membership rows for the same account.
--
-- The CHECK encodes the invariant the app relies on: a row is either a real
-- membership (is_placeholder = false, user_id may or may not be set — see
-- claim, which flips both in one statement) or a slot (is_placeholder = true
-- and user_id IS NULL). claimPlaceholder UPDATEs is_placeholder and user_id
-- together, so it always satisfies the constraint.
--
-- invitations.placeholder_member_id links an invite link to one specific slot
-- so redeeming it can claim/merge the slot's recordkeeping for that person.
-- ON DELETE NO ACTION: mergePlaceholder NULLs the links before deleting the
-- placeholder row, so a dangling FK can never block the merge.
ALTER TABLE "league_members" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "is_placeholder" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "placeholder_name" text;
--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "placeholder_email" text;
--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "placeholder_notes" text;
--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_placeholder_user_id_check" CHECK ("is_placeholder" = false OR "user_id" IS NULL);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "placeholder_member_id" uuid;
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_placeholder_member_id_league_members_id_fk" FOREIGN KEY ("placeholder_member_id") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;
