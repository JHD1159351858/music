CREATE TABLE "auth_identities" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"details" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "auth_identities_read" ON "auth_identities" AS PERMISSIVE FOR SELECT TO "service_role" USING (true);--> statement-breakpoint
CREATE POLICY "auth_identities_insert" ON "auth_identities" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "auth_identities_update" ON "auth_identities" AS PERMISSIVE FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."auth_identities" FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."auth_identities" TO service_role;
