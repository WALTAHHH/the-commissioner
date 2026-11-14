-- ESPN integration cookies for private leagues (t_5f562064).
--
-- espn_s2 and swid are stored as plain text for now; TODO: encrypt at rest
-- in production. These columns are nullable (populated only for private leagues).
--

ALTER TABLE "integration_connections" ADD COLUMN "espn_s2" text;
--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "swid" text;
--> statement-breakpoint