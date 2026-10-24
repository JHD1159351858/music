CREATE TABLE "score_analyses" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"title" text,
	"composer" text,
	"file_name" text,
	"provenance" text NOT NULL,
	"engine" text NOT NULL,
	"note_count" integer,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_analyses_provenance_check" CHECK ("score_analyses"."provenance" IN ('musicxml', 'abc', 'image-model')),
	CONSTRAINT "score_analyses_engine_check" CHECK ("score_analyses"."engine" IN ('music21', 'basic', 'image-model')),
	CONSTRAINT "score_analyses_note_count_check" CHECK ("score_analyses"."note_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "score_analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "score_analyses" ADD CONSTRAINT "score_analyses_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "score_analyses_user_created_idx" ON "score_analyses" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE POLICY "score_analyses_read" ON "score_analyses" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "score_analyses_insert" ON "score_analyses" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "score_analyses_update" ON "score_analyses" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "score_analyses_delete" ON "score_analyses" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."score_analyses" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."score_analyses" TO service_role;
