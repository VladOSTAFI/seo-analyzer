CREATE TYPE "public"."audit_status" AS ENUM('created', 'crawling', 'enriching', 'analyzing', 'reporting', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."crawl_source" AS ENUM('sitemap', 'link', 'redirect', 'seed');--> statement-breakpoint
CREATE TYPE "public"."link_type" AS ENUM('internal', 'external');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."status_class" AS ENUM('2xx', '3xx', '4xx', '5xx');--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"start_url" text NOT NULL,
	"status" "audit_status" DEFAULT 'created' NOT NULL,
	"failed_stage" text,
	"report_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
