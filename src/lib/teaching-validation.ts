import { z } from 'zod'
import type { SubmissionRequirements } from './teaching-types'
import { SCORE_PERIOD_MAX_LENGTH, SCORE_TYPES } from './score-classification'
import { MAX_SCORE_PAGES } from './score-pages'

const id = z.string().trim().min(1).max(100)
const text = z.string().trim().min(1).max(200)
const nullableText = z.string().trim().max(5000).nullable().optional()
const nullableUrl = z.string().trim().refine(value => {
  if (/^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\?expires=\d{10,13}&token=[A-Za-z0-9_-]{43}$/.test(value)) return true
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}, '文件地址须为 HTTP、HTTPS 或本站签名文件链接').nullable().optional()
export const userIdSchema = z.object({ user_id: id })
const scorePageSchema = z.object({ image_url: nullableUrl, file_id: nullableText, file_name: nullableText, file_type: nullableText, upload_receipt: z.string().trim().min(1).max(10000).nullable().optional() }).transform(page => ({
  image_url: page.image_url ?? null, file_id: page.file_id ?? null, file_name: page.file_name ?? null, file_type: page.file_type ?? null, upload_receipt: page.upload_receipt ?? null,
}))
export const scoreSchema = userIdSchema.extend({
  id: z.uuid().optional(),
  title: text, composer: text,
  category: z.enum(['domestic', 'foreign']),
  score_type: z.enum(SCORE_TYPES).nullable().optional(),
  period: z.string().trim().min(1).max(SCORE_PERIOD_MAX_LENGTH).nullable().optional(),
  tips: nullableText, image_url: nullableUrl,
  file_id: nullableText, file_name: nullableText, file_type: nullableText,
  cover_file_id: z.string().trim().min(1).max(5000).nullable().optional(),
  cover_receipt: z.string().trim().min(1).max(10000).nullable().optional(),
  pages: z.array(scorePageSchema).max(MAX_SCORE_PAGES, `每份琴谱最多上传 ${MAX_SCORE_PAGES} 页`).optional(),
  published: z.boolean().default(false),
  target_classes: z.array(text).max(100).default([]),
})
export const scorePatchSchema = scoreSchema.omit({ user_id: true, id: true, published: true, target_classes: true }).partial().extend({ user_id: id, published: z.boolean().optional(), target_classes: z.array(text).max(100).optional() })
export const requirementsSchema = z.object({
  audio: z.enum(['required', 'optional', 'off']),
  record: z.enum(['required', 'optional', 'off']),
  video: z.enum(['required', 'optional', 'off']),
})
const taskFields = z.object({
  title: text, description: z.string().trim().min(1).max(10000),
  start_at: z.iso.datetime({ offset: true }), end_at: z.iso.datetime({ offset: true }),
  audience: z.enum(['all', 'classes', 'students']),
  target_classes: z.array(text).max(100).default([]),
  target_student_ids: z.array(id).max(1000).default([]),
  score_mode: z.enum(['fixed', 'random']), score_id: id.nullable().optional(),
  requirements: requirementsSchema,
  closed: z.boolean().default(false),
})
export const taskSchema = taskFields.extend({ user_id: id }).superRefine((task, ctx) => {
  if (new Date(task.end_at) <= new Date(task.start_at)) ctx.addIssue({ code: 'custom', message: '截止时间必须晚于开始时间', path: ['end_at'] })
  if (task.score_mode === 'fixed' && !task.score_id) ctx.addIssue({ code: 'custom', message: '请选择指定曲目', path: ['score_id'] })
  if (task.audience === 'classes' && !task.target_classes.length) ctx.addIssue({ code: 'custom', message: '请选择班级', path: ['target_classes'] })
  if (task.audience === 'students' && !task.target_student_ids.length) ctx.addIssue({ code: 'custom', message: '请选择学生', path: ['target_student_ids'] })
  if (Object.values(task.requirements).every(value => value === 'off')) ctx.addIssue({ code: 'custom', message: '至少选择一种提交材料', path: ['requirements'] })
})
export const taskPatchSchema = taskFields.omit({ target_classes: true, target_student_ids: true, closed: true }).partial().extend({
  user_id: id, target_classes: z.array(text).max(100).optional(), target_student_ids: z.array(id).max(1000).optional(), closed: z.boolean().optional(),
})
export const submissionSchema = userIdSchema.extend({
  audio_url: nullableUrl, audio_file_id: nullableText,
  video_url: nullableUrl, video_file_id: nullableText,
  practice_record_id: id.nullable().optional(), record_text: nullableText,
})
export const reviewSchema = userIdSchema.extend({ grade: z.number().int().min(0).max(100), feedback: z.string().trim().max(10000) })
export const goalSchema = userIdSchema.extend({
  name: text, start_date: z.iso.date(), end_date: z.iso.date(), target_minutes: z.number().int().positive().max(525600),
}).refine(goal => goal.end_date >= goal.start_date, { message: '学期结束日期不能早于开始日期', path: ['end_date'] })
export const goalPatchSchema = z.object({ user_id: id, name: text.optional(), start_date: z.iso.date().optional(), end_date: z.iso.date().optional(), target_minutes: z.number().int().positive().max(525600).optional() })
export const practiceSchema = userIdSchema.extend({
  id: z.uuid().optional(),
  score_id: id.nullable().optional(), piece_title: text, source: z.enum(['teacher', 'student']).default('teacher'),
  started_at: z.iso.datetime({ offset: true }), duration_seconds: z.number().int().min(0).max(86400),
  pause_count: z.number().int().min(0).default(0), audio_url: nullableUrl, audio_file_id: nullableText,
})

export function canReadScore(user: { role: string; id: string; class_name?: string | null }, score: { published: boolean; owner_id: string | null; source?: string; target_classes?: string[] }) {
  if (score.source === 'student') return score.owner_id === user.id
  if (user.role === 'teacher') return score.published || score.owner_id === user.id
  return score.published && (!score.target_classes?.length || !!user.class_name && score.target_classes.includes(user.class_name))
}

export function validateSubmissionRequirements(requirements: SubmissionRequirements, submission: { audio_url?: string | null; audio_file_id?: string | null; video_url?: string | null; video_file_id?: string | null; practice_record_id?: string | null; record_text?: string | null }): string | null {
  const missing: string[] = []
  if (requirements.audio === 'required' && !submission.audio_url && !submission.audio_file_id) missing.push('练习录音')
  if (requirements.record === 'required' && !submission.practice_record_id && !submission.record_text?.trim()) missing.push('练习记录')
  if (requirements.video === 'required' && !submission.video_url && !submission.video_file_id) missing.push('演奏视频')
  return missing.length ? `请提交必交的${missing.join('、')}` : null
}

export function semesterProgress(goal: { start_date: string; end_date: string; target_minutes: number }, records: { practice_date: string; duration_seconds: number }[], now = new Date()) {
  const completed = records.filter(record => record.practice_date >= goal.start_date && record.practice_date <= goal.end_date).reduce((sum, record) => sum + record.duration_seconds, 0)
  const start = new Date(`${goal.start_date}T00:00:00+08:00`).getTime()
  const end = new Date(`${goal.end_date}T23:59:59+08:00`).getTime()
  return { completed_seconds: completed, progress_percent: Math.min(100, Math.round(completed / (goal.target_minutes * 60) * 100)), expected_percent: Math.max(0, Math.min(100, Math.round((now.getTime() - start) / (end - start) * 100))) }
}

export function taskIsVisible(task: { audience: string; target_classes: string[]; target_student_ids: string[] }, user: { id: string; role: string; class_name?: string | null }) {
  return task.audience === 'all' || (task.audience === 'classes' && !!user.class_name && task.target_classes.includes(user.class_name)) || (task.audience === 'students' && task.target_student_ids.includes(user.id))
}

export function stableScoreId(taskId: string, studentId: string, scoreIds: string[]): string | null {
  if (!scoreIds.length) return null
  let hash = 0
  for (const char of `${taskId}:${studentId}`) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return [...scoreIds].sort()[Math.abs(hash) % scoreIds.length]
}
