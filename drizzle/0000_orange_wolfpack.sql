CREATE TABLE "comments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "post_likes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_likes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "posts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text NOT NULL,
	"ask_teacher" boolean DEFAULT false NOT NULL,
	"marked_for_lesson" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "practice_records" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"score_id" varchar(36),
	"piece_title" text NOT NULL,
	"source" text NOT NULL,
	"practice_date" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"pause_count" integer DEFAULT 0 NOT NULL,
	"audio_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nickname" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scores" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"composer" text NOT NULL,
	"difficulty" text NOT NULL,
	"tips" text,
	"image_url" text,
	"source" text NOT NULL,
	"owner_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_records" ADD CONSTRAINT "practice_records_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_records" ADD CONSTRAINT "practice_records_score_id_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "scores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_likes_unique" ON "post_likes" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "practice_user_idx" ON "practice_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "practice_date_idx" ON "practice_records" USING btree ("practice_date");--> statement-breakpoint
CREATE INDEX "scores_source_idx" ON "scores" USING btree ("source");--> statement-breakpoint
CREATE INDEX "scores_owner_idx" ON "scores" USING btree ("owner_id");--> statement-breakpoint
CREATE POLICY "comments_read" ON "comments" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "comments_insert" ON "comments" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "likes_read" ON "post_likes" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "likes_insert" ON "post_likes" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "likes_delete" ON "post_likes" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "posts_read" ON "posts" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "posts_insert" ON "posts" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "posts_update" ON "posts" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "posts_delete" ON "posts" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "practice_read" ON "practice_records" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "practice_insert" ON "practice_records" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "practice_delete" ON "practice_records" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "profiles_read" ON "profiles" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "scores_read" ON "scores" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "scores_insert" ON "scores" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "scores_update" ON "scores" AS PERMISSIVE FOR UPDATE TO "anon", "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "scores_delete" ON "scores" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (true);
--> statement-breakpoint
-- === managed grants ===
REVOKE ALL ON TABLE "profiles" FROM anon, authenticated;
GRANT SELECT ON TABLE "profiles" TO anon, authenticated;

REVOKE ALL ON TABLE "scores" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "scores" TO anon, authenticated;

REVOKE ALL ON TABLE "practice_records" FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE "practice_records" TO anon, authenticated;

REVOKE ALL ON TABLE "posts" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "posts" TO anon, authenticated;

REVOKE ALL ON TABLE "post_likes" FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE "post_likes" TO anon, authenticated;

REVOKE ALL ON TABLE "comments" FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE "comments" TO anon, authenticated;
--> statement-breakpoint
-- === seed data ===
INSERT INTO "profiles" ("id", "nickname", "role") VALUES
  ('t0000000-0000-0000-0000-000000000001', '林老师', 'teacher'),
  ('s0000000-0000-0000-0000-000000000001', '抚琴听雨', 'student'),
  ('s0000000-0000-0000-0000-000000000002', '黑白键旅人', 'student'),
  ('s0000000-0000-0000-0000-000000000003', '松间流泉', 'student'),
  ('s0000000-0000-0000-0000-000000000004', '夜航星', 'student'),
  ('s0000000-0000-0000-0000-000000000005', '半音阶', 'student');
--> statement-breakpoint
INSERT INTO "scores" ("title", "composer", "difficulty", "tips", "source", "owner_id") VALUES
  ('车尔尼练习曲 Op.599 No.20', '车尔尼', 'beginner', '注意右手连奏与左手断奏的对比，保持手腕放松。', 'teacher', 't0000000-0000-0000-0000-000000000001'),
  ('巴赫初级钢琴曲集 No.1 小步舞曲', '巴赫', 'beginner', '巴洛克风格，分句要清晰，装饰音在拍点上。', 'teacher', 't0000000-0000-0000-0000-000000000001'),
  ('致爱丽丝', '贝多芬', 'intermediate', '右手的分解八度要轻巧，中段注意情绪转折。', 'teacher', 't0000000-0000-0000-0000-000000000001'),
  ('彩云追月', '任光 / 聂耳', 'intermediate', '民族管弦乐改编曲，注意五声音阶的歌唱性与月色意境的营造。', 'teacher', 't0000000-0000-0000-0000-000000000001'),
  ('月光奏鸣曲 第一乐章', '贝多芬', 'advanced', '三连音伴奏均匀而克制，旋律在暗处吟唱。', 'teacher', 't0000000-0000-0000-0000-000000000001'),
  ('革命练习曲 Op.10 No.12', '肖邦', 'advanced', '左手快速音群需颗粒清晰，注意华沙起义背景下的悲愤情感表达。', 'teacher', 't0000000-0000-0000-0000-000000000001');
--> statement-breakpoint
INSERT INTO "posts" ("user_id", "title", "content", "category", "ask_teacher") VALUES
  ('s0000000-0000-0000-0000-000000000001', '弹快速音阶时手腕总容易酸怎么办？', '最近练车尔尼的时候右手弹到快速段落手腕就紧张，弹一会儿就酸。大家有什么放松的好方法吗？', 'method', false),
  ('s0000000-0000-0000-0000-000000000002', '求讲解：什么是属七和弦的解决？', '乐理课上说属七和弦要解决到主和弦，但我在谱子里看不太出来，能举个具体例子吗？', 'theory', true),
  ('s0000000-0000-0000-0000-000000000003', '中级程度想接触中国作品，求推荐', '目前水平大概在致爱丽丝这个阶段，想弹一些中国钢琴作品，有什么合适的入门曲目吗？', 'repertoire', false),
  ('s0000000-0000-0000-0000-000000000004', '第一次上台演出忘谱了，怎么克服紧张？', '上周汇演弹到一半大脑一片空白……大家上台前都有什么缓解紧张的小技巧？', 'performance', false),
  ('s0000000-0000-0000-0000-000000000005', '练琴时间到底怎么安排效率最高？', '每天只有一小时练琴时间，是应该全部拿来过曲子，还是分时间练基本功？求老师指点。', 'method', true);
--> statement-breakpoint
INSERT INTO "practice_records" ("user_id", "piece_title", "source", "practice_date", "started_at", "duration_seconds", "pause_count") VALUES
  ('s0000000-0000-0000-0000-000000000001', '车尔尼练习曲 Op.599 No.20', 'teacher', CURRENT_DATE - 6, (CURRENT_DATE - 6) + interval '18 hours', 1800, 2),
  ('s0000000-0000-0000-0000-000000000001', '致爱丽丝', 'teacher', CURRENT_DATE - 4, (CURRENT_DATE - 4) + interval '19 hours', 2400, 1),
  ('s0000000-0000-0000-0000-000000000001', '致爱丽丝', 'teacher', CURRENT_DATE - 1, (CURRENT_DATE - 1) + interval '18 hours', 2100, 3),
  ('s0000000-0000-0000-0000-000000000002', '巴赫初级钢琴曲集 No.1 小步舞曲', 'teacher', CURRENT_DATE - 6, (CURRENT_DATE - 6) + interval '17 hours', 1500, 1),
  ('s0000000-0000-0000-0000-000000000002', '巴赫初级钢琴曲集 No.1 小步舞曲', 'teacher', CURRENT_DATE - 3, (CURRENT_DATE - 3) + interval '20 hours', 2700, 2),
  ('s0000000-0000-0000-0000-000000000002', '车尔尼练习曲 Op.599 No.20', 'teacher', CURRENT_DATE - 1, (CURRENT_DATE - 1) + interval '17 hours', 1200, 0),
  ('s0000000-0000-0000-0000-000000000003', '彩云追月', 'teacher', CURRENT_DATE - 5, (CURRENT_DATE - 5) + interval '19 hours', 3000, 2),
  ('s0000000-0000-0000-0000-000000000003', '彩云追月', 'teacher', CURRENT_DATE - 2, (CURRENT_DATE - 2) + interval '19 hours', 3300, 1),
  ('s0000000-0000-0000-0000-000000000003', '月光奏鸣曲 第一乐章', 'teacher', CURRENT_DATE - 1, (CURRENT_DATE - 1) + interval '20 hours', 1800, 4),
  ('s0000000-0000-0000-0000-000000000004', '致爱丽丝', 'teacher', CURRENT_DATE - 4, (CURRENT_DATE - 4) + interval '21 hours', 900, 1),
  ('s0000000-0000-0000-0000-000000000004', '致爱丽丝', 'teacher', CURRENT_DATE, CURRENT_DATE + interval '8 hours', 1500, 2),
  ('s0000000-0000-0000-0000-000000000005', '革命练习曲 Op.10 No.12', 'teacher', CURRENT_DATE - 3, (CURRENT_DATE - 3) + interval '18 hours', 3600, 3),
  ('s0000000-0000-0000-0000-000000000005', '月光奏鸣曲 第一乐章', 'teacher', CURRENT_DATE - 1, (CURRENT_DATE - 1) + interval '18 hours', 2700, 1),
  ('s0000000-0000-0000-0000-000000000005', '革命练习曲 Op.10 No.12', 'teacher', CURRENT_DATE, CURRENT_DATE + interval '7 hours', 3000, 2);