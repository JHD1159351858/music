CREATE TABLE "practice_list" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"score_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_list" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "score_genres" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"teacher_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_genres" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "semester_goals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"target_minutes" integer NOT NULL,
	"teacher_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semester_goals_minutes_check" CHECK ("semester_goals"."target_minutes" > 0),
	CONSTRAINT "semester_goals_dates_check" CHECK ("semester_goals"."end_date" >= "semester_goals"."start_date")
);
--> statement-breakpoint
ALTER TABLE "semester_goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(36) NOT NULL,
	"student_id" varchar(36) NOT NULL,
	"audio_url" text,
	"audio_file_id" text,
	"video_url" text,
	"video_file_id" text,
	"practice_record_id" varchar(36),
	"record_text" text,
	"grade" integer,
	"feedback" text,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_grade_check" CHECK ("submissions"."grade" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_score_assignments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(36) NOT NULL,
	"student_id" varchar(36) NOT NULL,
	"score_id" varchar(36)
);
--> statement-breakpoint
ALTER TABLE "task_score_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"audience" text NOT NULL,
	"target_classes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_student_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score_mode" text NOT NULL,
	"score_id" varchar(36),
	"requirements" jsonb NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"teacher_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_audience_check" CHECK ("tasks"."audience" IN ('all', 'classes', 'students')),
	CONSTRAINT "tasks_score_mode_check" CHECK ("tasks"."score_mode" IN ('fixed', 'random')),
	CONSTRAINT "tasks_dates_check" CHECK ("tasks"."end_at" > "tasks"."start_at")
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "practice_records" ADD COLUMN "audio_file_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "class_name" text;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "category" text DEFAULT 'foreign' NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "genre_id" varchar(36);--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "file_id" text;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "file_type" text;--> statement-breakpoint
ALTER TABLE "practice_list" ADD CONSTRAINT "practice_list_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_list" ADD CONSTRAINT "practice_list_score_id_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_genres" ADD CONSTRAINT "score_genres_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semester_goals" ADD CONSTRAINT "semester_goals_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_practice_record_id_practice_records_id_fk" FOREIGN KEY ("practice_record_id") REFERENCES "public"."practice_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_score_assignments" ADD CONSTRAINT "task_score_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_score_assignments" ADD CONSTRAINT "task_score_assignments_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_score_assignments" ADD CONSTRAINT "task_score_assignments_score_id_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."scores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_score_id_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."scores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_list_unique" ON "practice_list" USING btree ("user_id","score_id");--> statement-breakpoint
CREATE UNIQUE INDEX "score_genres_name_unique" ON "score_genres" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_unique" ON "submissions" USING btree ("task_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_score_assignments_unique" ON "task_score_assignments" USING btree ("task_id","student_id");--> statement-breakpoint
CREATE INDEX "tasks_teacher_idx" ON "tasks" USING btree ("teacher_id");--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_genre_id_score_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."score_genres"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_category_check" CHECK ("scores"."category" IN ('domestic', 'foreign'));--> statement-breakpoint
CREATE POLICY "profiles_update" ON "profiles" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "practice_list_read" ON "practice_list" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "practice_list_insert" ON "practice_list" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "practice_list_update" ON "practice_list" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "practice_list_delete" ON "practice_list" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "score_genres_read" ON "score_genres" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "score_genres_insert" ON "score_genres" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "score_genres_update" ON "score_genres" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "score_genres_delete" ON "score_genres" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "semester_goals_read" ON "semester_goals" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "semester_goals_insert" ON "semester_goals" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "semester_goals_update" ON "semester_goals" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "semester_goals_delete" ON "semester_goals" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "submissions_read" ON "submissions" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "submissions_insert" ON "submissions" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "submissions_update" ON "submissions" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "submissions_delete" ON "submissions" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "task_score_assignments_read" ON "task_score_assignments" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "task_score_assignments_insert" ON "task_score_assignments" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "task_score_assignments_update" ON "task_score_assignments" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "task_score_assignments_delete" ON "task_score_assignments" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "tasks_read" ON "tasks" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "tasks_insert" ON "tasks" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tasks_update" ON "tasks" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tasks_delete" ON "tasks" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);
--> statement-breakpoint
-- Managed grants retain the existing demo identity model. No unconfirmed genres are seeded.
GRANT UPDATE ON "profiles" TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "practice_list", "score_genres", "semester_goals", "submissions", "task_score_assignments", "tasks" TO anon, authenticated;
