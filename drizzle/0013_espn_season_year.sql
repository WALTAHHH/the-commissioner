-- ESPN-2 (t_1e9423de): the ESPN connect UI collects a season year, and every
-- ESPN FFL API call is keyed by season
-- (/seasons/{year}/segments/0/leagues/{id}), so the connection row must carry
-- it. ESPN-1b added the cookie columns but not the season, leaving nowhere to
-- persist the form field.
--
-- Nullable: Sleeper connections never set it, and any ESPN row written before
-- this migration falls back to the season ESPN reports on the next sync
-- (see syncESPNLeague -> league.seasonYear backfill).

ALTER TABLE "integration_connections" ADD COLUMN "season_year" integer;
--> statement-breakpoint
-- Bound the column to plausible fantasy seasons without blocking historical
-- rows; prevents a typo'd "20260" from being stored and 404ing forever.
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_season_year_check"
  CHECK ("season_year" IS NULL OR ("season_year" BETWEEN 1999 AND 2100));
