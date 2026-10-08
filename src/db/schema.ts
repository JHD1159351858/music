import { sql } from 'drizzle-orm'
import {
  pgTable,
  pgPolicy,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { anonRole, authenticatedRole } from 'drizzle-orm/supabase'

// 演示模式：无真实登录，所有访问通过 anon key + 应用层 user 标识过滤
// RLS 采用显式开放策略（USING true），身份隔离由应用层保证

// 演示用户（昵称制，不存真实姓名学号）
export const profiles = pgTable(
  'profiles',
  {
    id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    nickname: text('nickname').notNull(),
    role: text('role').notNull(), // student | teacher
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('profiles_read', { for: 'select', to: [anonRole, authenticatedRole], using: sql`true` }),
  ]
)

// 琴谱库
export const scores = pgTable(
  'scores',
  {
    id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    title: text('title').notNull(),
    composer: text('composer').notNull(),
    difficulty: text('difficulty').notNull(), // beginner | intermediate | advanced
    tips: text('tips'),
    image_url: text('image_url'), // 谱面图片（对象存储）
    source: text('source').notNull(), // teacher | student
    owner_id: varchar('owner_id', { length: 36 }).references(() => profiles.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('scores_source_idx').on(table.source),
    index('scores_owner_idx').on(table.owner_id),
    pgPolicy('scores_read', { for: 'select', to: [anonRole, authenticatedRole], using: sql`true` }),
    pgPolicy('scores_insert', { for: 'insert', to: [anonRole, authenticatedRole], withCheck: sql`true` }),
    pgPolicy('scores_update', { for: 'update', to: [anonRole, authenticatedRole], using: sql`true`, withCheck: sql`true` }),
    pgPolicy('scores_delete', { for: 'delete', to: [anonRole, authenticatedRole], using: sql`true` }),
  ]
)

// 练习记录
export const practiceRecords = pgTable(
  'practice_records',
  {
    id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar('user_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    score_id: varchar('score_id', { length: 36 }).references(() => scores.id, { onDelete: 'set null' }),
    piece_title: text('piece_title').notNull(),
    source: text('source').notNull(), // teacher | student
    practice_date: date('practice_date').notNull(),
    started_at: timestamp('started_at', { withTimezone: true }).notNull(),
    duration_seconds: integer('duration_seconds').notNull(),
    pause_count: integer('pause_count').default(0).notNull(),
    audio_url: text('audio_url'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('practice_user_idx').on(table.user_id),
    index('practice_date_idx').on(table.practice_date),
    pgPolicy('practice_read', { for: 'select', to: [anonRole, authenticatedRole], using: sql`true` }),
    pgPolicy('practice_insert', { for: 'insert', to: [anonRole, authenticatedRole], withCheck: sql`true` }),
    pgPolicy('practice_delete', { for: 'delete', to: [anonRole, authenticatedRole], using: sql`true` }),
  ]
)

// 社区帖子
export const posts = pgTable(
  'posts',
  {
    id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar('user_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    category: text('category').notNull(), // method | theory | repertoire | performance | other
    ask_teacher: boolean('ask_teacher').default(false).notNull(),
    marked_for_lesson: boolean('marked_for_lesson').default(false).notNull(),
    like_count: integer('like_count').default(0).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('posts_category_idx').on(table.category),
    index('posts_created_idx').on(table.created_at),
    pgPolicy('posts_read', { for: 'select', to: [anonRole, authenticatedRole], using: sql`true` }),
    pgPolicy('posts_insert', { for: 'insert', to: [anonRole, authenticatedRole], withCheck: sql`true` }),
    pgPolicy('posts_update', { for: 'update', to: [anonRole, authenticatedRole], using: sql`true`, withCheck: sql`true` }),
    pgPolicy('posts_delete', { for: 'delete', to: [anonRole, authenticatedRole], using: sql`true` }),
  ]
)

// 帖子点赞（幂等约束）
export const postLikes = pgTable(
  'post_likes',
  {
    id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    post_id: varchar('post_id', { length: 36 }).notNull().references(() => posts.id, { onDelete: 'cascade' }),
    user_id: varchar('user_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('post_likes_unique').on(table.post_id, table.user_id),
    pgPolicy('likes_read', { for: 'select', to: [anonRole, authenticatedRole], using: sql`true` }),
    pgPolicy('likes_insert', { for: 'insert', to: [anonRole, authenticatedRole], withCheck: sql`true` }),
    pgPolicy('likes_delete', { for: 'delete', to: [anonRole, authenticatedRole], using: sql`true` }),
  ]
)

// 评论 / 教师回复
export const comments = pgTable(
  'comments',
  {
    id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    post_id: varchar('post_id', { length: 36 }).notNull().references(() => posts.id, { onDelete: 'cascade' }),
    user_id: varchar('user_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('comments_post_idx').on(table.post_id),
    pgPolicy('comments_read', { for: 'select', to: [anonRole, authenticatedRole], using: sql`true` }),
    pgPolicy('comments_insert', { for: 'insert', to: [anonRole, authenticatedRole], withCheck: sql`true` }),
  ]
)
