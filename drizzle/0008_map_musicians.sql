CREATE TABLE "map_musicians" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"years" text DEFAULT '' NOT NULL,
	"era" text NOT NULL,
	"region" text NOT NULL,
	"intro" text NOT NULL,
	"works" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"map_kind" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avatar_file_id" text,
	"teacher_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_musicians_name_check" CHECK (char_length("map_musicians"."name") BETWEEN 1 AND 160),
	CONSTRAINT "map_musicians_kind_check" CHECK ("map_musicians"."map_kind" IN ('china', 'europe')),
	CONSTRAINT "map_musicians_x_check" CHECK ("map_musicians"."x" BETWEEN 0 AND 100),
	CONSTRAINT "map_musicians_y_check" CHECK ("map_musicians"."y" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "map_musicians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "map_musicians" ADD CONSTRAINT "map_musicians_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_musicians_teacher_idx" ON "map_musicians" USING btree ("teacher_id");--> statement-breakpoint
CREATE POLICY "map_musicians_read" ON "map_musicians" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "map_musicians_insert" ON "map_musicians" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "map_musicians_update" ON "map_musicians" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "map_musicians_delete" ON "map_musicians" AS PERMISSIVE FOR DELETE TO "service_role" USING (true);
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."map_musicians" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."map_musicians" TO service_role;
