CREATE TYPE "public"."ingest_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."paper_source" AS ENUM('arxiv', 'paperswithcode', 'semantic_scholar', 'cvf', 'openreview');--> statement-breakpoint
CREATE TYPE "public"."read_status_value" AS ENUM('unread', 'reading', 'read', 'archived');--> statement-breakpoint
CREATE TYPE "public"."venue_type" AS ENUM('arxiv', 'conference', 'journal', 'workshop', 'preprint');--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE TABLE "papers" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"abstract" text,
	"arxiv_id" text,
	"doi" text,
	"title_hash" text NOT NULL,
	"venue" text,
	"venue_type" "venue_type" DEFAULT 'arxiv' NOT NULL,
	"year" integer,
	"published_date" timestamp with time zone NOT NULL,
	"updated_date" timestamp with time zone,
	"pdf_url" text,
	"code_url" text,
	"citation_count" integer,
	"relevance_score" real DEFAULT 0 NOT NULL,
	"relevance_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_source" "paper_source" NOT NULL,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read_status" (
	"paper_id" text NOT NULL,
	"status" "read_status_value" DEFAULT 'unread' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_status_paper_id_pk" PRIMARY KEY("paper_id")
);
--> statement-breakpoint
CREATE TABLE "user_saves" (
	"paper_id" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_saves_paper_id_pk" PRIMARY KEY("paper_id")
);
--> statement-breakpoint
ALTER TABLE "read_status" ADD CONSTRAINT "read_status_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saves" ADD CONSTRAINT "user_saves_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_runs_source_time_idx" ON "ingest_runs" USING btree ("source","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "papers_arxiv_id_uniq" ON "papers" USING btree ("arxiv_id");--> statement-breakpoint
CREATE UNIQUE INDEX "papers_doi_uniq" ON "papers" USING btree ("doi");--> statement-breakpoint
CREATE UNIQUE INDEX "papers_title_hash_uniq" ON "papers" USING btree ("title_hash");--> statement-breakpoint
CREATE INDEX "papers_published_idx" ON "papers" USING btree ("published_date");--> statement-breakpoint
CREATE INDEX "papers_relevance_idx" ON "papers" USING btree ("relevance_score");--> statement-breakpoint
CREATE INDEX "papers_source_idx" ON "papers" USING btree ("primary_source");--> statement-breakpoint
CREATE INDEX "read_status_status_idx" ON "read_status" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_saves_saved_at_idx" ON "user_saves" USING btree ("saved_at");