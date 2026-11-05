import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, assignedScore, dbCheck, readJson, teacher, type TeachingClient } from '@/lib/teaching-server'
import { canReadScore, taskIsVisible, taskSchema } from '@/lib/teaching-validation'
import type { PracticeTask, TaskScoreSummary, TaskSubmission, TeachingProfile, TeachingScore } from '@/lib/teaching-types'
import { refreshScoreFiles, refreshSubmissionFiles } from '@/lib/teaching-files'
import { validateTaskScores } from '@/lib/task-scores'

async function taskScoreSummaries(supabase: TeachingClient, user: TeachingProfile, scoreIds: (string | null | undefined)[]): Promise<Map<string, TaskScoreSummary>> {
  const ids = [...new Set(scoreIds.filter((id): id is string => Boolean(id)))]
  if (!ids.length) return new Map()
  const result = await supabase.from('scores').select('id,title,composer,cover_file_id,source,published,owner_id,target_classes').in('id', ids)
  dbCheck(result.error)
  type ReadableScore = TaskScoreSummary & Pick<TeachingScore, 'source' | 'published' | 'owner_id' | 'target_classes'>
  const scores = ((result.data ?? []) as ReadableScore[]).filter(score => score.source === 'teacher' && canReadScore(user, score))
  const summaries = await refreshScoreFiles(scores.map(score => ({ id: score.id, title: score.title, composer: score.composer, cover_file_id: score.cover_file_id ?? null })))
  return new Map(summaries.map(score => [score.id, score]))
}

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    let query = supabase.from('tasks').select('*')
    if (user.role === 'teacher') query = query.eq('teacher_id', user.id)
    const result = await query.order('created_at', { ascending: false })
    dbCheck(result.error)
    const tasks = (result.data ?? []) as PracticeTask[]
    const ids = tasks.map(task => task.id)
    if (!ids.length) return NextResponse.json([])
    let submissionQuery = supabase.from('submissions').select('*').in('task_id', ids)
    if (user.role === 'student') submissionQuery = submissionQuery.eq('student_id', user.id)
    const submitted = await submissionQuery
    dbCheck(submitted.error)
    const submissions = await refreshSubmissionFiles((submitted.data ?? []) as TaskSubmission[])
    if (user.role === 'student') {
      const visible = tasks.filter(task => taskIsVisible(task, user))
      const assigned = await Promise.all(visible.map(async task => ({ ...task, assigned_score_id: await assignedScore(supabase, task, user), my_submission: submissions.find(submission => submission.task_id === task.id) ?? null })))
      const scores = await taskScoreSummaries(supabase, user, assigned.map(task => task.assigned_score_id))
      return NextResponse.json(assigned.map(task => ({ ...task, score: task.assigned_score_id ? scores.get(task.assigned_score_id) ?? null : null })))
    }
    const roster = await supabase.from('profiles').select('id,nickname,role,class_name').eq('role', 'student')
    dbCheck(roster.error)
    const students = (roster.data ?? []) as TeachingProfile[]
    const scores = await taskScoreSummaries(supabase, user, tasks.filter(task => task.score_mode === 'fixed').map(task => task.score_id))
    return NextResponse.json(tasks.map(task => {
      const targetIds = new Set(students.filter(student => taskIsVisible(task, student)).map(student => student.id))
      return { ...task, score: task.score_mode === 'fixed' && task.score_id ? scores.get(task.score_id) ?? null : null, submitted_count: submissions.filter(submission => submission.task_id === task.id && targetIds.has(submission.student_id)).length, student_count: targetIds.size }
    }))
  })
}

export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = taskSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    teacher(user)
    await validateTaskScores(supabase, user, body)
    const values = withoutUserId(body)
    const { data, error } = await supabase.from('tasks').insert({ ...values, score_id: body.score_mode === 'fixed' ? body.score_id : null, teacher_id: user.id }).select().single()
    dbCheck(error)
    return NextResponse.json(data, { status: 201 })
  })
}

