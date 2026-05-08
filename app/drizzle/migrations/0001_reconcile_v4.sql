-- Reconcile pre-V4 schema with the V4 schema actually defined in src/lib/db/schema.ts.
-- The init migration's CREATE TABLE for ingest_runs was skipped because a legacy V2
-- table of the same name already existed (with column `source_id` instead of `source`).
-- This migration drops the V2-era tables/columns the V4 app does not use, then
-- recreates ingest_runs in its V4 shape.
--
-- Safe because:
-- * V2 `items` was the old "AI news aggregator" feed and is not read by V4 code.
-- * V4 papers/user_saves/read_status are empty.
-- * V4 ingest_runs has at most one stale row from the failed manual trigger.

DROP TABLE IF EXISTS "feedback" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "filter_presets" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "item_sources" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "items" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "llm_usage" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sources" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "ingest_runs" CASCADE;--> statement-breakpoint

CREATE TABLE "ingest_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "paper_source" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"papers_fetched" integer DEFAULT 0 NOT NULL,
	"papers_inserted" integer DEFAULT 0 NOT NULL,
	"papers_updated" integer DEFAULT 0 NOT NULL,
	"status" "ingest_status" DEFAULT 'running' NOT NULL,
	"error_message" text
);--> statement-breakpoint

CREATE INDEX "ingest_runs_source_time_idx" ON "ingest_runs" USING btree ("source","started_at");--> statement-breakpoint

-- Drop V2-only enums no longer referenced.
DROP TYPE IF EXISTS "public"."feedback_signal" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."item_bucket" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."content_type" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."ingestion_type" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."source_status" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."rating_tier" CASCADE;
