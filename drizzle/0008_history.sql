CREATE TABLE "season_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season_year" integer NOT NULL,
	"champion_member_id" uuid,
	"champion_team_name" text,
	"runner_up_member_id" uuid,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season_year" integer NOT NULL,
	"member_id" uuid,
	"award_name" text NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_recaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season_year" integer NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_records" ADD CONSTRAINT "season_records_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "season_records" ADD CONSTRAINT "season_records_champion_member_id_league_members_id_fk" FOREIGN KEY ("champion_member_id") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "season_records" ADD CONSTRAINT "season_records_runner_up_member_id_league_members_id_fk" FOREIGN KEY ("runner_up_member_id") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "season_records" ADD CONSTRAINT "season_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "league_awards" ADD CONSTRAINT "league_awards_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "league_awards" ADD CONSTRAINT "league_awards_member_id_league_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "league_awards" ADD CONSTRAINT "league_awards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "season_recaps" ADD CONSTRAINT "season_recaps_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "season_recaps" ADD CONSTRAINT "season_recaps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "season_records_league_year_idx" ON "season_records" USING btree ("league_id","season_year");
--> statement-breakpoint
CREATE UNIQUE INDEX "league_awards_league_year_name_idx" ON "league_awards" USING btree ("league_id","season_year","award_name");
--> statement-breakpoint
CREATE UNIQUE INDEX "season_recaps_league_year_idx" ON "season_recaps" USING btree ("league_id","season_year");