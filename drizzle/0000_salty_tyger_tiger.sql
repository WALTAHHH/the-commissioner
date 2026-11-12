CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"raw_app_meta_data" text,
	"raw_user_meta_data" text,
	"is_super_admin" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"sport" text DEFAULT 'football' NOT NULL,
	"format" text DEFAULT 'redraft' NOT NULL,
	"commissioner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "member_permission_overrides" (
	"member_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted" boolean NOT NULL,
	CONSTRAINT "member_permission_overrides_member_id_permission_id_pk" PRIMARY KEY("member_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "member_roles" (
	"member_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "member_roles_member_id_role_id_pk" PRIMARY KEY("member_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted" boolean DEFAULT true,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season_year" integer NOT NULL,
	"is_current" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_commissioner_id_users_id_fk" FOREIGN KEY ("commissioner_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_permission_overrides" ADD CONSTRAINT "member_permission_overrides_member_id_league_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_permission_overrides" ADD CONSTRAINT "member_permission_overrides_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_member_id_league_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."league_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_seasons" ADD CONSTRAINT "league_seasons_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_members_league_user_idx" ON "league_members" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE INDEX "league_members_user_idx" ON "league_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_slug_idx" ON "leagues" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_domain_resource_action_idx" ON "permissions" USING btree ("domain","resource","action");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_league_name_idx" ON "roles" USING btree ("league_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "league_seasons_league_year_idx" ON "league_seasons" USING btree ("league_id","season_year");