ALTER POLICY "comments_read" ON "comments" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "comments_insert" ON "comments" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "course_knowledge_read" ON "course_knowledge" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "course_knowledge_insert" ON "course_knowledge" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "course_knowledge_update" ON "course_knowledge" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "course_knowledge_delete" ON "course_knowledge" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "lesson_marks_read" ON "lesson_marks" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "lesson_marks_insert" ON "lesson_marks" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "lesson_marks_update" ON "lesson_marks" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "lesson_marks_delete" ON "lesson_marks" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "likes_read" ON "post_likes" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "likes_insert" ON "post_likes" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "likes_delete" ON "post_likes" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "posts_read" ON "posts" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "posts_insert" ON "posts" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "posts_update" ON "posts" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "posts_delete" ON "posts" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "practice_list_read" ON "practice_list" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "practice_list_insert" ON "practice_list" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "practice_list_update" ON "practice_list" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "practice_list_delete" ON "practice_list" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "practice_read" ON "practice_records" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "practice_insert" ON "practice_records" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "practice_delete" ON "practice_records" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "profiles_read" ON "profiles" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "profiles_update" ON "profiles" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "score_genres_read" ON "score_genres" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "score_genres_insert" ON "score_genres" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "score_genres_update" ON "score_genres" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "score_genres_delete" ON "score_genres" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "scores_read" ON "scores" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "scores_insert" ON "scores" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "scores_update" ON "scores" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "scores_delete" ON "scores" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "semester_goals_read" ON "semester_goals" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "semester_goals_insert" ON "semester_goals" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "semester_goals_update" ON "semester_goals" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "semester_goals_delete" ON "semester_goals" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "submissions_read" ON "submissions" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "submissions_insert" ON "submissions" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "submissions_update" ON "submissions" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "submissions_delete" ON "submissions" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "task_score_assignments_read" ON "task_score_assignments" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "task_score_assignments_insert" ON "task_score_assignments" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "task_score_assignments_update" ON "task_score_assignments" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "task_score_assignments_delete" ON "task_score_assignments" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "tasks_read" ON "tasks" TO service_role USING (true);--> statement-breakpoint
ALTER POLICY "tasks_insert" ON "tasks" TO service_role WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "tasks_update" ON "tasks" TO service_role USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "tasks_delete" ON "tasks" TO service_role USING (true);
--> statement-breakpoint
-- Custom app sessions are checked by backend APIs, never by an anonymous database client.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."profiles", "public"."scores", "public"."practice_records",
  "public"."posts", "public"."comments", "public"."post_likes",
  "public"."score_genres", "public"."practice_list", "public"."semester_goals",
  "public"."tasks", "public"."task_score_assignments", "public"."submissions",
  "public"."lesson_marks", "public"."course_knowledge"
FROM anon, authenticated, PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."profiles", "public"."scores", "public"."practice_records",
  "public"."posts", "public"."comments", "public"."post_likes",
  "public"."score_genres", "public"."practice_list", "public"."semester_goals",
  "public"."tasks", "public"."task_score_assignments", "public"."submissions",
  "public"."lesson_marks", "public"."course_knowledge"
TO service_role;
