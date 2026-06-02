CREATE TABLE "hreflang_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"page_url" text NOT NULL,
	"lang" text NOT NULL,
	"href" text NOT NULL,
	"is_reciprocal" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"page_url" text NOT NULL,
	"src" text NOT NULL,
	"alt" text,
	"title" text,
	"status_code" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"status_code" integer,
	"status_class" "status_class",
	"redirect_chain" jsonb DEFAULT '[]'::jsonb,
	"content_type" text,
	"response_time_ms" integer,
	"content_length_bytes" integer,
	"depth" integer DEFAULT 0 NOT NULL,
	"crawl_source" "crawl_source" DEFAULT 'link' NOT NULL,
	"title" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_description" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"h1" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"h2" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"canonical_url" text,
	"is_self_canonical" boolean,
	"meta_robots" text,
	"x_robots_tag" text,
	"blocked_by_robots_txt" boolean DEFAULT false,
	"rel_next" text,
	"rel_prev" text,
	"content_hash" text,
	"inlink_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"href" text NOT NULL,
	"anchor_text" text,
	"type" "link_type" NOT NULL,
	"rel" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_status_code" integer,
	"is_redirect" boolean,
	"is_broken" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hreflang_entries" ADD CONSTRAINT "hreflang_entries_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hreflang_audit_page_idx" ON "hreflang_entries" USING btree ("audit_id","page_url");--> statement-breakpoint
CREATE INDEX "images_audit_page_idx" ON "images" USING btree ("audit_id","page_url");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_audit_url_idx" ON "pages" USING btree ("audit_id","url");--> statement-breakpoint
CREATE INDEX "pages_audit_status_idx" ON "pages" USING btree ("audit_id","status_class");--> statement-breakpoint
CREATE INDEX "pages_audit_hash_idx" ON "pages" USING btree ("audit_id","content_hash");--> statement-breakpoint
CREATE INDEX "pages_audit_canonical_idx" ON "pages" USING btree ("audit_id","canonical_url");--> statement-breakpoint
CREATE INDEX "links_audit_href_idx" ON "links" USING btree ("audit_id","href");--> statement-breakpoint
CREATE INDEX "links_audit_source_idx" ON "links" USING btree ("audit_id","source_url");--> statement-breakpoint
CREATE INDEX "links_audit_flags_idx" ON "links" USING btree ("audit_id","is_broken","is_redirect");