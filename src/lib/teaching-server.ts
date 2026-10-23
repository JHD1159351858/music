import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { createSupabaseServer } from './supabase-server'
import type { TeachingProfile, PracticeTask, TeachingScore } from './teaching-types'
import { canReadScore, stableScoreId, taskIsVisible } from './teaching-validation'
import { readAuthSession } from './auth-session'
import { localFileMetadata, LocalFileError } from './local-files'
import { getScorePages, type ScoreFiles } from './score-pages'
import type { ScorePage } from './teaching-types'
import { verifyScoreUploadReceipt } from './score-upload-receipt'

export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export function dbCheck(error: { message: string } | null) {
  if (error) throw new ApiError(error.message, 500)
}
export async function apiRoute(handler: () => Promise<Response>): Promise<Response> {
  try { return await handler() }
  catch (error: unknown) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(issue => issue.message).join('；') }, { status: 400 })
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof SyntaxError) return NextResponse.json({ error: '请求 JSON 格式无效' }, { status: 400 })
    if (error instanceof Error && error.message === 'Supabase server environment is incomplete') return NextResponse.json({ error: '远端数据库配置不完整，请设置仅后端 CODER_SUPABASE_SERVICE_ROLE_KEY 并应用数据库迁移' }, { status: 503 })
    console.error('Teaching API error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: '数据服务暂不可用，请稍后重试' }, { status: 500 })
  }
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json()
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('请求内容必须是对象')
  return body as Record<string, unknown>
}
export function withoutUserId<T extends { user_id: string }>(body: T): Omit<T, 'user_id'> {
  const values = { ...body }
  Reflect.deleteProperty(values, 'user_id')
  return values
}
export async function actor(request: Request, body?: { user_id?: unknown }) {
  const session = await readAuthSession(request)
  if (!session) throw new ApiError('请先登录', 401)
  const requestedIds: unknown[] = new URL(request.url).searchParams.getAll('user_id')
  if (body && Object.prototype.hasOwnProperty.call(body, 'user_id')) requestedIds.push(body.user_id)
  if (requestedIds.some(id => id !== session.userId)) throw new ApiError('不能使用其他用户的身份', 403)
  const supabase = createSupabaseServer()
  const { data, error } = await supabase.from('profiles').select('id,nickname,role,class_name').eq('id', session.userId).maybeSingle()
  dbCheck(error)
  if (!data || data.role !== session.role) throw new ApiError('登录身份已失效，请重新登录', 401)
  return { user: data as TeachingProfile, supabase }
}
export function teacher(user: TeachingProfile) {
  if (user.role !== 'teacher') throw new ApiError('仅教师可执行此操作', 403)
}
export type TeachingClient = ReturnType<typeof createSupabaseServer>
export async function getTask(supabase: TeachingClient, id: string): Promise<PracticeTask> {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
  dbCheck(error)
  if (!data) throw new ApiError('练习任务不存在', 404)
  return data as PracticeTask
}
export function taskAccess(task: PracticeTask, user: TeachingProfile) {
  if (user.role === 'teacher' ? task.teacher_id !== user.id : !taskIsVisible(task, user)) throw new ApiError('没有权限查看此任务', 403)
}
export async function assignedScore(supabase: TeachingClient, task: PracticeTask, user: TeachingProfile): Promise<string | null> {
  if (task.score_mode === 'fixed') {
    if (!task.score_id) return null
    const score = await supabase.from('scores').select('*').eq('id', task.score_id).maybeSingle()
    dbCheck(score.error)
    return score.data && score.data.source === 'teacher' && score.data.published && canReadScore(user, score.data) ? task.score_id : null
  }
  const existing = await supabase.from('task_score_assignments').select('score_id').eq('task_id', task.id).eq('student_id', user.id).maybeSingle()
  dbCheck(existing.error)
  if (existing.data) {
    const score = await supabase.from('scores').select('*').eq('id', existing.data.score_id).maybeSingle()
    dbCheck(score.error)
    return score.data && score.data.source === 'teacher' && score.data.published && canReadScore(user, score.data) ? score.data.id as string : null
  }
  // Store the first assignment so later library changes do not change the student's piece.
  const candidates = await supabase.from('scores').select('*').eq('published', true).eq('source', 'teacher')
  dbCheck(candidates.error)
  const scoreId = stableScoreId(task.id, user.id, (candidates.data ?? []).filter(score => canReadScore(user, score)).map(score => score.id as string))
  if (!scoreId) return null
  const saved = await supabase.from('task_score_assignments').upsert({ task_id: task.id, student_id: user.id, score_id: scoreId }, { onConflict: 'task_id,student_id', ignoreDuplicates: true })
  dbCheck(saved.error)
  const final = await supabase.from('task_score_assignments').select('score_id').eq('task_id', task.id).eq('student_id', user.id).single()
  dbCheck(final.error)
  return final.data?.score_id ?? null
}
export async function validateScoreReference(supabase: TeachingClient, scoreId: string | null | undefined, user: TeachingProfile, requirePublished = false): Promise<TeachingScore | null> {
  if (!scoreId) return null
  const { data, error } = await supabase.from('scores').select('*').eq('id', scoreId).maybeSingle()
  dbCheck(error)
  if (!data || !canReadScore(user, data) || requirePublished && (!data.published || data.source !== 'teacher')) throw new ApiError('琴谱不存在、尚未发布或不在你的班级范围内', 404)
  return data as TeachingScore
}

export async function validateScoreFiles(supabase: TeachingClient, user: TeachingProfile, score: ScoreFiles): Promise<{ pages: ScorePage[] } & ScorePage> {
  const pages: ScorePage[] = []
  for (const page of score.pages ?? getScorePages(score)) {
    if (!page.file_id && !page.image_url) throw new ApiError('请上传有效的琴谱文件')
    const type = page.file_id && !page.file_id.startsWith('local:')
      ? await validateRemoteScoreFile(supabase, user, page)
      : await validateFileReference(supabase, user, page.file_id, page.image_url) ?? page.file_type
    if (user.role === 'student' && (!page.file_id || !type?.startsWith('image/'))) throw new ApiError('个人琴谱请选择上传的图片文件')
    if (type && !type.startsWith('image/') && type !== 'application/pdf') throw new ApiError('琴谱仅支持图片或 PDF')
    pages.push({ image_url: page.image_url ?? null, file_id: page.file_id ?? null, file_name: page.file_name ?? null, file_type: type ?? null })
  }
  if (user.role === 'student' && !pages.length) throw new ApiError('个人琴谱请选择上传的图片文件')
  if (pages.length > 1 && pages.some(page => !page.file_type?.startsWith('image/'))) throw new ApiError('多页琴谱仅支持图片，PDF 请单独上传')
  const first = pages[0] ?? { image_url: null, file_id: null, file_name: null, file_type: null }
  return { ...first, pages }
}

async function validateRemoteScoreFile(supabase: TeachingClient, user: TeachingProfile, page: ScorePage): Promise<string> {
  const fileId = page.file_id
  if (!fileId) throw new ApiError('请上传有效的琴谱文件')
  const receiptType = verifyScoreUploadReceipt(page.upload_receipt, { fileId, ownerId: user.id })
  if (receiptType) return receiptType
  const [legacy, paged] = await Promise.all([
    supabase.from('scores').select('file_type').eq('file_id', fileId).eq('owner_id', user.id).limit(1),
    supabase.from('scores').select('pages').contains('pages', [{ file_id: fileId }]).eq('owner_id', user.id).limit(1),
  ])
  dbCheck(legacy.error)
  dbCheck(paged.error)
  const legacyType = legacy.data?.find(row => typeof row.file_type === 'string')?.file_type
  if (typeof legacyType === 'string' && legacyType) return legacyType
  for (const row of paged.data ?? []) {
    if (!Array.isArray(row.pages)) continue
    for (const stored of row.pages) {
      if (typeof stored === 'object' && stored !== null && 'file_id' in stored && stored.file_id === fileId && 'file_type' in stored && typeof stored.file_type === 'string' && stored.file_type) return stored.file_type
    }
  }
  throw new ApiError('远端琴谱文件凭证无效或已过期，请重新上传', 403)
}

export async function validateFileReference(supabase: TeachingClient, user: TeachingProfile, fileId?: string | null, url?: string | null): Promise<string | null> {
  if (url?.startsWith('/api/files/') && (!fileId?.startsWith('local:') || url.split('?')[0] !== `/api/files/${fileId.slice(6)}`)) throw new ApiError('本站文件必须使用匹配的文件编号')
  if (!fileId?.startsWith('local:')) return null
  try {
    const metadata = await localFileMetadata(fileId)
    if (metadata.ownerId) {
      if (metadata.ownerId !== user.id) throw new ApiError('不能使用其他用户上传的文件', 403)
      return metadata.type
    }
    // 旧文件没有上传者信息，只兼容已由本人持有的数据库引用。
    const references = await Promise.all([
      supabase.from('scores').select('id').eq('file_id', fileId).eq('owner_id', user.id).limit(1),
      supabase.from('scores').select('id').contains('pages', [{ file_id: fileId }]).eq('owner_id', user.id).limit(1),
      supabase.from('practice_records').select('id').eq('audio_file_id', fileId).eq('user_id', user.id).limit(1),
      supabase.from('submissions').select('id').eq('audio_file_id', fileId).eq('student_id', user.id).limit(1),
      supabase.from('submissions').select('id').eq('video_file_id', fileId).eq('student_id', user.id).limit(1),
    ])
    for (const result of references) dbCheck(result.error)
    if (!references.some(result => result.data?.length)) throw new ApiError('旧文件没有可验证的本人引用，请重新上传', 403)
    return metadata.type
  } catch (error: unknown) {
    if (error instanceof LocalFileError) throw new ApiError(error.message, error.status)
    throw error
  }
}

export async function canAccessTeachingFile(supabase: TeachingClient, user: TeachingProfile, fileId: string): Promise<boolean> {
  let records = supabase.from('practice_records').select('id').eq('audio_file_id', fileId)
  if (user.role !== 'teacher') records = records.eq('user_id', user.id)
  const [scores, pageScores, practice, musicians] = await Promise.all([
    supabase.from('scores').select('*').eq('file_id', fileId),
    supabase.from('scores').select('*').contains('pages', [{ file_id: fileId }]), records.limit(1),
    supabase.from('map_musicians').select('id').eq('avatar_file_id', fileId).limit(1),
  ])
  dbCheck(scores.error)
  dbCheck(pageScores.error)
  dbCheck(practice.error)
  dbCheck(musicians.error)
  if (musicians.data?.length) return true
  if ([...(scores.data ?? []), ...(pageScores.data ?? [])].some(score => canReadScore(user, score)) || practice.data?.length) return true

  let submitted = supabase.from('submissions').select('audio_file_id,video_file_id,practice_record_id')
  if (user.role === 'teacher') {
    const tasks = await supabase.from('tasks').select('id').eq('teacher_id', user.id)
    dbCheck(tasks.error)
    const ids = (tasks.data ?? []).map(task => task.id as string)
    submitted = ids.length ? submitted.in('task_id', ids) : submitted.eq('student_id', user.id)
  } else { submitted = submitted.eq('student_id', user.id) }
  const submissions = await submitted
  dbCheck(submissions.error)
  if (submissions.data?.some(row => row.audio_file_id === fileId || row.video_file_id === fileId)) return true
  const recordIds = (submissions.data ?? []).map(row => row.practice_record_id as string | null).filter((id): id is string => !!id)
  if (recordIds.length) {
    const attached = await supabase.from('practice_records').select('id').in('id', recordIds).eq('audio_file_id', fileId).limit(1)
    dbCheck(attached.error)
    if (attached.data?.length) return true
  }
  if (fileId.startsWith('local:')) {
    try { return (await localFileMetadata(fileId)).ownerId === user.id }
    catch (error: unknown) { if (!(error instanceof LocalFileError)) throw error }
  }
  return false
}
