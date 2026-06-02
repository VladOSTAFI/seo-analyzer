CREATE TABLE "performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"page_url" text NOT NULL,
	"strategy" text NOT NULL,
	"lcp_ms" integer,
	"cls" real,
	"inp_ms" integer,
	"performance_score" real,
	"fcp_ms" integer,
	"tbt_ms" integer,
	"speed_index_ms" integer,
	"usability_flags" jsonb DEFAULT '[]'::jsonb,
	"psi_raw" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance" ADD CONSTRAINT "performance_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "perf_audit_page_strategy_idx" ON "performance" USING btree ("audit_id","page_url","strategy");