CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"severity" "severity" NOT NULL,
	"url" text,
	"detail" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_audit_rule_idx" ON "findings" USING btree ("audit_id","rule_id");--> statement-breakpoint
CREATE INDEX "findings_audit_severity_idx" ON "findings" USING btree ("audit_id","severity");