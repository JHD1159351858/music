CREATE TABLE "course_knowledge" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_url" text,
	"teacher_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_knowledge" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_marks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar(36) NOT NULL,
	"teacher_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "recipient_teacher_id" varchar(36);--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "target_classes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "course_knowledge" ADD CONSTRAINT "course_knowledge_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_marks" ADD CONSTRAINT "lesson_marks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_marks" ADD CONSTRAINT "lesson_marks_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_marks_unique" ON "lesson_marks" USING btree ("post_id","teacher_id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_recipient_teacher_id_profiles_id_fk" FOREIGN KEY ("recipient_teacher_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "course_knowledge_read" ON "course_knowledge" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "course_knowledge_insert" ON "course_knowledge" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "course_knowledge_update" ON "course_knowledge" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "course_knowledge_delete" ON "course_knowledge" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "lesson_marks_read" ON "lesson_marks" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "lesson_marks_insert" ON "lesson_marks" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "lesson_marks_update" ON "lesson_marks" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "lesson_marks_delete" ON "lesson_marks" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);
--> statement-breakpoint
-- Legacy marks have an identifiable owner only where exactly one teacher exists.
INSERT INTO "lesson_marks" ("post_id", "teacher_id")
SELECT p."id", t."id" FROM "posts" p CROSS JOIN "profiles" t
WHERE p."marked_for_lesson" = true AND t."role" = 'teacher'
  AND (SELECT count(*) FROM "profiles" WHERE "role" = 'teacher') = 1
ON CONFLICT ("post_id", "teacher_id") DO NOTHING;
--> statement-breakpoint
UPDATE "posts" SET "marked_for_lesson" = false
WHERE "marked_for_lesson" = true
  AND (SELECT count(*) FROM "profiles" WHERE "role" = 'teacher') = 1;
