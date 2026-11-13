CREATE TABLE "financial_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"category_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"description" text NOT NULL,
	"due_date" date,
	"payment_instructions" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "financial_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obligation_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prize_structure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season_year" integer NOT NULL,
	"place" integer NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_obligations" ADD CONSTRAINT "financial_obligations_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_obligations" ADD CONSTRAINT "financial_obligations_member_id_league_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_obligations" ADD CONSTRAINT "financial_obligations_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_obligations" ADD CONSTRAINT "financial_obligations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_payments" ADD CONSTRAINT "financial_payments_obligation_id_financial_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."financial_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_payments" ADD CONSTRAINT "financial_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_structure" ADD CONSTRAINT "prize_structure_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_structure" ADD CONSTRAINT "prize_structure_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_categories_league_id_idx" ON "financial_categories" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_categories_league_name_idx" ON "financial_categories" USING btree ("league_id","name");--> statement-breakpoint
CREATE INDEX "financial_obligations_league_id_idx" ON "financial_obligations" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "financial_obligations_member_id_idx" ON "financial_obligations" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "financial_obligations_category_id_idx" ON "financial_obligations" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "financial_payments_obligation_id_idx" ON "financial_payments" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "prize_structure_league_id_idx" ON "prize_structure" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prize_structure_league_season_place_idx" ON "prize_structure" USING btree ("league_id","season_year","place");