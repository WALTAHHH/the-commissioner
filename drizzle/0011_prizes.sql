-- Prize definition system (t_ec17d39c).
--
-- prize_structure previously held only season-end payout places (one row per
-- (league, season, place), amount NOT NULL). Commissioners now define any
-- prize: payouts OR recognition awards, at season end OR in a given week,
-- each optionally awarded to a member after the fact.
--
--   type          — 'payout' | 'recognition' (app-layer constants, like the
--                   other enum-ish text columns in this schema)
--   scope         — 'season' | 'weekly'
--   week_number   — set for weekly prizes, NULL for season prizes
--   winner_member_id — league_members.id of the member who won it, set when
--                   the commissioner awards the prize (recorded after the
--                   fact; NULL until then)
--   awarded_at    — when the prize was awarded (NULL = TBD)
--
-- `place` and `amount` become nullable: a weekly "High score" award has no
-- finishing place, and a recognition award (e.g. "Golden Toilet") has no
-- money. Both are still enforced in app code: payouts require amount > 0,
-- season payouts require a place.
--
-- The existing UNIQUE (league_id, season_year, place) index is KEPT as-is.
-- Postgres treats NULLs as distinct inside a unique index, so rows without a
-- place (weekly prizes, season recognitions) can coexist freely while season
-- payouts keep the one-row-per-place-per-season invariant.
--
-- Defaults make every pre-existing row a season payout exactly as it behaved
-- before this change.

ALTER TABLE "prize_structure" ALTER COLUMN "place" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prize_structure" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prize_structure" ADD COLUMN "type" text DEFAULT 'payout' NOT NULL;--> statement-breakpoint
ALTER TABLE "prize_structure" ADD COLUMN "scope" text DEFAULT 'season' NOT NULL;--> statement-breakpoint
ALTER TABLE "prize_structure" ADD COLUMN "week_number" integer;--> statement-breakpoint
ALTER TABLE "prize_structure" ADD COLUMN "winner_member_id" uuid;--> statement-breakpoint
ALTER TABLE "prize_structure" ADD COLUMN "awarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prize_structure" ADD CONSTRAINT "prize_structure_winner_member_id_league_members_id_fk" FOREIGN KEY ("winner_member_id") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prize_structure_league_season_scope_idx" ON "prize_structure" USING btree ("league_id","season_year","scope");
