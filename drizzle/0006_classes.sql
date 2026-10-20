CREATE TABLE "classes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"join_code" varchar(8) NOT NULL,
	"teacher_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_name_check" CHECK (char_length("classes"."name") BETWEEN 1 AND 100),
	CONSTRAINT "classes_join_code_check" CHECK ("classes"."join_code" ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$')
);
--> statement-breakpoint
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "classes_name_unique" ON "classes" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_join_code_unique" ON "classes" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "classes_teacher_idx" ON "classes" USING btree ("teacher_id");--> statement-breakpoint
CREATE POLICY "classes_read" ON "classes" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "classes_insert" ON "classes" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."classes" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "public"."classes" TO service_role;
