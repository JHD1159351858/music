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
  jsonb,
  check,
} from 'drizzle-orm/pg-core'
import { serviceRole } from 'drizzle-orm/supabase'
import type { ScorePage } from '@/lib/teaching-types'
import type { AuthProfile } from '@/lib/auth-profile-types'

// 远端业务表仅允许后端 service_role 访问，应用 API 校验超星签名会话与数据归属。

// 课堂资料的昵称用于社区；已验证的本人身份资料单独存储。
export const profiles = pgTable(
  'profiles',
  {
    id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    nickname: text('nickname').notNull(),
    role: text('role').notNull(), // student | teacher
    class_name: text('class_name'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  () => [
    pgPolicy('profiles_read', { for: 'select', to: [serviceRole], using: sql`true` }),
    pgPolicy('profiles_update', { for: 'update', to: [serviceRole], using: sql`true`, withCheck: sql`true` }),
  ]
)

// 教师待验证时也会保存已验票资料，因此不依赖正式课堂 profile 已创建。
export const authIdentities = pgTable('auth_identities', {
  id: varchar('id', { length: 36 }).primaryKey(),
  details: jsonb('details').$type<AuthProfile>().notNull(),
}, () => [
  pgPolicy('auth_identities_read', { for: 'select', to: [serviceRole], using: sql`true` }),
  pgPolicy('auth_identities_insert', { for: 'insert', to: [serviceRole], withCheck: sql`true` }),
  pgPolicy('auth_identities_update', { for: 'update', to: [serviceRole], using: sql`true`, withCheck: sql`true` }),
]).enableRLS()

// 琴谱库
export const scores = pgTable(
  'scores',
  {
    id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    title: text('title').notNull(),
    composer: text('composer').notNull(),
    difficulty: text('difficulty').notNull(), // beginner | intermediate | advanced
    category: text('category').default('foreign').notNull(), // domestic | foreign
    genre_id: varchar('genre_id', { length: 36 }).references(() => scoreGenres.id, { onDelete: 'set null' }),
    published: boolean('published').default(false).notNull(),
    target_classes: jsonb('target_classes').$type<string[]>().default([]).notNull(),
    tips: text('tips'),
    image_url: text('image_url'), // 谱面图片（对象存储）
    file_id: text('file_id'),
    file_name: text('file_name'),
    file_type: text('file_type'),
    pages: jsonb('pages').$type<ScorePage[]>().default([]).notNull(),
    source: text('source').notNull(), // teacher | student
    owner_id: varchar('owner_id', { length: 36 }).references(() => profiles.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('scores_category_check', sql`${table.category} IN ('domestic', 'foreign')`),
    index('scores_source_idx').on(table.source),
    index('scores_owner_idx').on(table.owner_id),
    pgPolicy('scores_read', { for: 'select', to: [serviceRole], using: sql`true` }),
    pgPolicy('scores_insert', { for: 'insert', to: [serviceRole], withCheck: sql`true` }),
    pgPolicy('scores_update', { for: 'update', to: [serviceRole], using: sql`true`, withCheck: sql`true` }),
    pgPolicy('scores_delete', { for: 'delete', to: [serviceRole], using: sql`true` }),
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
    audio_file_id: text('audio_file_id'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('practice_user_idx').on(table.user_id),
    index('practice_date_idx').on(table.practice_date),
    pgPolicy('practice_read', { for: 'select', to: [serviceRole], using: sql`true` }),
    pgPolicy('practice_insert', { for: 'insert', to: [serviceRole], withCheck: sql`true` }),
    pgPolicy('practice_delete', { for: 'delete', to: [serviceRole], using: sql`true` }),
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
    recipient_teacher_id: varchar('recipient_teacher_id', { length: 36 }).references(() => profiles.id, { onDelete: 'restrict' }),
    like_count: integer('like_count').default(0).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('posts_category_idx').on(table.category),
    index('posts_created_idx').on(table.created_at),
    pgPolicy('posts_read', { for: 'select', to: [serviceRole], using: sql`true` }),
    pgPolicy('posts_insert', { for: 'insert', to: [serviceRole], withCheck: sql`true` }),
    pgPolicy('posts_update', { for: 'update', to: [serviceRole], using: sql`true`, withCheck: sql`true` }),
    pgPolicy('posts_delete', { for: 'delete', to: [serviceRole], using: sql`true` }),
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
    pgPolicy('likes_read', { for: 'select', to: [serviceRole], using: sql`true` }),
    pgPolicy('likes_insert', { for: 'insert', to: [serviceRole], withCheck: sql`true` }),
    pgPolicy('likes_delete', { for: 'delete', to: [serviceRole], using: sql`true` }),
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
    pgPolicy('comments_read', { for: 'select', to: [serviceRole], using: sql`true` }),
    pgPolicy('comments_insert', { for: 'insert', to: [serviceRole], withCheck: sql`true` }),
  ]
)

// 业务访问仅授予后端 service_role；角色和数据归属继续由 API 校验。
const teachingPolicies = (name: string) => [
  pgPolicy(`${name}_read`, { for: 'select', to: [serviceRole], using: sql`true` }),
  pgPolicy(`${name}_insert`, { for: 'insert', to: [serviceRole], withCheck: sql`true` }),
  pgPolicy(`${name}_update`, { for: 'update', to: [serviceRole], using: sql`true`, withCheck: sql`true` }),
  pgPolicy(`${name}_delete`, { for: 'delete', to: [serviceRole], using: sql`true` }),
]
export const classes = pgTable('classes', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  join_code: varchar('join_code', { length: 8 }).notNull(),
  teacher_id: varchar('teacher_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('classes_name_unique').on(table.name),
  uniqueIndex('classes_join_code_unique').on(table.join_code),
  index('classes_teacher_idx').on(table.teacher_id),
  check('classes_name_check', sql`char_length(${table.name}) BETWEEN 1 AND 100`),
  check('classes_join_code_check', sql`${table.join_code} ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'`),
  pgPolicy('classes_read', { for: 'select', to: [serviceRole], using: sql`true` }),
  pgPolicy('classes_insert', { for: 'insert', to: [serviceRole], withCheck: sql`true` }),
]).enableRLS()
export const lessonMarks = pgTable('lesson_marks', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  post_id: varchar('post_id', { length: 36 }).notNull().references(() => posts.id, { onDelete: 'cascade' }),
  teacher_id: varchar('teacher_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('lesson_marks_unique').on(table.post_id, table.teacher_id), ...teachingPolicies('lesson_marks')])
export const courseKnowledge = pgTable('course_knowledge', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(), content: text('content').notNull(),
  keywords: jsonb('keywords').$type<string[]>().default([]).notNull(),
  source_url: text('source_url'),
  teacher_id: varchar('teacher_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, () => teachingPolicies('course_knowledge'))
export const scoreGenres = pgTable('score_genres', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  teacher_id: varchar('teacher_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('score_genres_name_unique').on(table.name), ...teachingPolicies('score_genres')])
export const practiceList = pgTable('practice_list', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar('user_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  score_id: varchar('score_id', { length: 36 }).notNull().references(() => scores.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('practice_list_unique').on(table.user_id, table.score_id), ...teachingPolicies('practice_list')])
export const semesterGoals = pgTable('semester_goals', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(), start_date: date('start_date').notNull(), end_date: date('end_date').notNull(),
  target_minutes: integer('target_minutes').notNull(),
  teacher_id: varchar('teacher_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [check('semester_goals_minutes_check', sql`${table.target_minutes} > 0`), check('semester_goals_dates_check', sql`${table.end_date} >= ${table.start_date}`), ...teachingPolicies('semester_goals')])
export const tasks = pgTable('tasks', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(), description: text('description').notNull(),
  start_at: timestamp('start_at', { withTimezone: true }).notNull(), end_at: timestamp('end_at', { withTimezone: true }).notNull(),
  audience: text('audience').notNull(),
  target_classes: jsonb('target_classes').$type<string[]>().default([]).notNull(),
  target_student_ids: jsonb('target_student_ids').$type<string[]>().default([]).notNull(),
  score_mode: text('score_mode').notNull(),
  score_id: varchar('score_id', { length: 36 }).references(() => scores.id, { onDelete: 'set null' }),
  requirements: jsonb('requirements').$type<{ audio: string; record: string; video: string }>().notNull(),
  closed: boolean('closed').default(false).notNull(),
  teacher_id: varchar('teacher_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index('tasks_teacher_idx').on(table.teacher_id),
  check('tasks_audience_check', sql`${table.audience} IN ('all', 'classes', 'students')`),
  check('tasks_score_mode_check', sql`${table.score_mode} IN ('fixed', 'random')`),
  check('tasks_dates_check', sql`${table.end_at} > ${table.start_at}`),
  ...teachingPolicies('tasks'),
])
export const taskScoreAssignments = pgTable('task_score_assignments', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  task_id: varchar('task_id', { length: 36 }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  student_id: varchar('student_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  score_id: varchar('score_id', { length: 36 }).references(() => scores.id, { onDelete: 'set null' }),
}, table => [uniqueIndex('task_score_assignments_unique').on(table.task_id, table.student_id), ...teachingPolicies('task_score_assignments')])
export const submissions = pgTable('submissions', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  task_id: varchar('task_id', { length: 36 }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  student_id: varchar('student_id', { length: 36 }).notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  audio_url: text('audio_url'), audio_file_id: text('audio_file_id'),
  video_url: text('video_url'), video_file_id: text('video_file_id'),
  practice_record_id: varchar('practice_record_id', { length: 36 }).references(() => practiceRecords.id, { onDelete: 'set null' }),
  record_text: text('record_text'), grade: integer('grade'), feedback: text('feedback'),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  submitted_at: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex('submissions_unique').on(table.task_id, table.student_id), check('submissions_grade_check', sql`${table.grade} BETWEEN 0 AND 100`), ...teachingPolicies('submissions')])
