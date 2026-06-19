CREATE TABLE "page_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"page_url" text NOT NULL,
	"src" text NOT NULL,
	"kind" text NOT NULL,
	"is_https" boolean NOT NULL,
	"bytes" integer,
	"format" text,
	"status_code" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "loading" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "has_srcset" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "has_sizes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "word_count" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "html_bytes" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "html_lang" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "charset" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "has_viewport" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "headings_outline" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "content_simhash" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "title_px" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "desc_px" integer;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "viewport_content" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "hsts" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "csp_present" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "x_content_type_options" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "mobile_usability_issues" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "cert_valid" boolean;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "cert_days_to_expiry" integer;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "anchor_is_bare_image" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "image_alt_missing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "page_resources" ADD CONSTRAINT "page_resources_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_resources_audit_page_idx" ON "page_resources" USING btree ("audit_id","page_url");--> statement-breakpoint
CREATE INDEX "page_resources_audit_kind_idx" ON "page_resources" USING btree ("audit_id","kind");