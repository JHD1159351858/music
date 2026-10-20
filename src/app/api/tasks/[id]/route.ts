import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, ApiError, assignedScore, dbCheck, getTask, readJson, taskAccess, teacher } from '@/lib/teaching-server'
import { taskIsVisible, taskPatchSchema, taskSchema } from '@/lib/teaching-validation'
import type { TeachingProfile } from '@/lib/teaching-types'
import { refreshSubmissionFiles } from '@/lib/teaching-files'
import { validateTaskScores } from '@/lib/task-scores'

type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const { user, supabase } = await actor(request)
    const task = await getTask(supabase, id)
    taskAccess(task, user)
    let query = supabase.from('submissions').select('*,profiles(nickname,class_name),practice_records(piece_title,duration_seconds,started_at,audio_url,audio_file_id)').eq('task_id', id)
    if (user.role === 'student') query = query.eq('student_id', user.id)
    const submitted = await query.order('submitted_at', { ascending: false })
    dbCheck(submitted.error)
    const submissions = await refreshSubmissionFiles(submitted.data ?? [])
    if (user.role === 'student') return NextResponse.json({ task: { ...task, assigned_score_id: await assignedScore(supabase, task, user) }, submissions, students: [user] })
    const roster = await supabase.from('profiles').select('id,nickname,role,class_name').eq('role', 'student')
    dbCheck(roster.error)
    return NextResponse.json({ task, submissions, students: ((roster.data ?? []) as TeachingProfile[]).filter(student => taskIsVisible(task, student)) })
  })
}
export async function PATCH(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const body = taskPatchSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const current = await getTask(supabase, id)
    taskAccess(current, user)
    if (Object.keys(body).every(key => key === 'user_id' || key === 'closed')) {
      const { data, error } = await supabase.from('tasks').update({ closed: body.closed ?? current.closed }).eq('id', id).eq('teacher_id', user.id).select().single()
      dbCheck(error)
      return NextResponse.json(data)
    }
    const merged = taskSchema.parse({ ...current, ...body })
    await validateTaskScores(supabase, user, merged)
    const scoreChanged = current.score_mode !== merged.score_mode || (merged.score_mode === 'fixed' && current.score_id !== merged.score_id)
    if (scoreChanged) {
      const existing = await supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('task_id', id)
      dbCheck(existing.error)
      if (existing.count) throw new ApiError('已有学生提交材料，无法更换任务曲目', 409)
      const cleared = await supabase.from('task_score_assignments').delete().eq('task_id', id)
      dbCheck(cleared.error)
    }
    const values = withoutUserId(merged)
    const { data, error } = await supabase.from('tasks').update({ ...values, score_id: merged.score_mode === 'fixed' ? merged.score_id : null }).eq('id', id).eq('teacher_id', user.id).select().single()
    dbCheck(error)
    return NextResponse.json(data)
  })
}
export async function DELETE(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const body = request.headers.get('content-type')?.includes('application/json') ? await readJson(request) : undefined
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const { data, error } = await supabase.from('tasks').delete().eq('id', id).eq('teacher_id', user.id).select('id').maybeSingle()
    dbCheck(error)
    if (!data) throw new ApiError('任务不存在或无权删除', 404)
    return NextResponse.json({ success: true })
  })
}

