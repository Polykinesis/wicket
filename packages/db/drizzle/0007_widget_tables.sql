CREATE TABLE "widget_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"owner_name" text,
	"reply_time" text,
	"topics" text[],
	"suggested_questions" text[],
	"brand_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_sites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_key" text NOT NULL,
	"origins" text[] DEFAULT '{}' NOT NULL,
	"turnstile_site_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widget_sites_site_key_unique" UNIQUE("site_key")
);
--> statement-breakpoint
ALTER TABLE "widget_settings" ADD CONSTRAINT "widget_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_sites" ADD CONSTRAINT "widget_sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "widget_sites_tenant_idx" ON "widget_sites" USING btree ("tenant_id");