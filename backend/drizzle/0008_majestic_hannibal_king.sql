CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."page_kind" AS ENUM('html', 'sitemap', 'feed', 'other');--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "progress" jsonb;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "coverage" jsonb;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "confidence" "confidence" DEFAULT 'high' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "page_kind" "page_kind" DEFAULT 'html' NOT NULL;--> statement-breakpoint
ALTER TABLE "performance" ADD COLUMN "is_origin_fallback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "performance" ADD COLUMN "cwv_source" text;