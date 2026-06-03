ALTER TABLE "audits" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audits_owner_idx" ON "audits" USING btree ("owner_id");