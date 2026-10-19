import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, assignedScore, dbCheck, readJson, teacher } from '@/lib/teaching-server'
import { taskIsVisible, taskSchema } from '@/lib/teaching-validation'
import type { PracticeTask, TaskSubmission, TeachingProfile } from '@/lib/teaching-types'
import { refreshSubmissionFiles } from '@/lib/teaching-files'
import { validateTaskScores } from '@/lib/task-scores'

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
      return NextResponse.json(await Promise.all(visible.map(async task => ({ ...task, assigned_score_id: await assignedScore(supabase, task, user), my_submission: submissions.find(submission => submission.task_id === task.id) ?? null }))))
    }
    const roster = await supabase.from('profiles').select('id,nickname,role,class_name').eq('role', 'student')
    dbCheck(roster.error)
    const students = (roster.data ?? []) as TeachingProfile[]
    return NextResponse.json(tasks.map(task => {
      const targetIds = new Set(students.filter(student => taskIsVisible(task, student)).map(student => student.id))
      return { ...task, submitted_count: submissions.filter(submission => submission.task_id === task.id && targetIds.has(submission.student_id)).length, student_count: targetIds.size }
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

