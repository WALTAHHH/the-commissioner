CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"threshold" text NOT NULL,
	"custom_threshold" integer,
	"voting_window_hours" integer DEFAULT 72 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closes_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"text" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"cast_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"poll_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"outcome" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"raised_by" uuid NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_member_id_league_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_league_members_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "polls_league_id_idx" ON "polls" USING btree ("league_id");
--> statement-breakpoint
CREATE INDEX "polls_created_by_idx" ON "polls" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX "polls_status_idx" ON "polls" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "poll_options_poll_id_idx" ON "poll_options" USING btree ("poll_id");
--> statement-breakpoint
CREATE INDEX "poll_options_display_order_idx" ON "poll_options" USING btree ("display_order");
--> statement-breakpoint
CREATE UNIQUE INDEX "poll_votes_poll_member_idx" ON "poll_votes" USING btree ("poll_id","member_id");
--> statement-breakpoint
CREATE INDEX "poll_votes_option_id_idx" ON "poll_votes" USING btree ("option_id");
--> statement-breakpoint
CREATE INDEX "decisions_league_id_idx" ON "decisions" USING btree ("league_id");
--> statement-breakpoint
CREATE INDEX "decisions_poll_id_idx" ON "decisions" USING btree ("poll_id");
--> statement-breakpoint
CREATE INDEX "disputes_league_id_idx" ON "disputes" USING btree ("league_id");
--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");