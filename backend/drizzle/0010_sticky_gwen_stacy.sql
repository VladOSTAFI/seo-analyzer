CREATE TABLE "structured_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"page_url" text NOT NULL,
	"type" text,
	"valid" boolean NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sitemap_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"loc" text NOT NULL,
	"source_sitemap" text,
	"lastmod" text,
	"changefreq" text,
	"priority" text,
	"in_crawl" boolean DEFAULT false NOT NULL,
	"status_code" integer,
	"is_self_canonical" boolean,
	"is_noindex" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "robots_audit" jsonb;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "sitemap_audit" jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "og_data" jsonb;--> statement-breakpoint
ALTER TABLE "structured_data" ADD CONSTRAINT "structured_data_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sitemap_entries" ADD CONSTRAINT "sitemap_entries_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "structured_data_audit_page_idx" ON "structured_data" USING btree ("audit_id","page_url");--> statement-breakpoint
CREATE INDEX "structured_data_audit_type_idx" ON "structured_data" USING btree ("audit_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "sitemap_entries_audit_loc_idx" ON "sitemap_entries" USING btree ("audit_id","loc");--> statement-breakpoint
CREATE INDEX "sitemap_entries_audit_incrawl_idx" ON "sitemap_entries" USING btree ("audit_id","in_crawl");