ALTER TABLE "league_members" DROP CONSTRAINT "league_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "team_name" text;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_members_league_status_idx" ON "league_members" USING btree ("league_id","status");--> statement-breakpoint
ALTER TABLE "league_members" DROP COLUMN "left_at";