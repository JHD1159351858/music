import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, dbCheck, readJson, teacher } from '@/lib/teaching-server'
import { goalSchema, semesterProgress } from '@/lib/teaching-validation'
import type { SemesterGoal } from '@/lib/teaching-types'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    let query = supabase.from('semester_goals').select('*')
    if (user.role === 'teacher') query = query.eq('teacher_id', user.id)
    const goals = await query.order('start_date', { ascending: false })
    dbCheck(goals.error)
    const list = (goals.data ?? []) as SemesterGoal[]
    if (!list.length) return NextResponse.json([])
    const start = [...list].sort((a, b) => a.start_date.localeCompare(b.start_date))[0].start_date
    const end = [...list].sort((a, b) => b.end_date.localeCompare(a.end_date))[0].end_date
    const records: { user_id: string; practice_date: string; duration_seconds: number }[] = []
    for (let offset = 0; ; offset += 1000) {
      let query = supabase.from('practice_records').select('user_id,practice_date,duration_seconds').gte('practice_date', start).lte('practice_date', end)
      if (user.role !== 'teacher') query = query.eq('user_id', user.id)
      const page = await query.order('id').range(offset, offset + 999)
      dbCheck(page.error)
      records.push(...(page.data ?? []))
      if (!page.data || page.data.length < 1000) break
    }
    if (user.role === 'teacher') {
      const students = await supabase.from('profiles').select('id,nickname,class_name').eq('role', 'student').order('nickname')
      dbCheck(students.error)
      const byStudent = new Map<string, typeof records>()
      for (const record of records) {
        const rows = byStudent.get(record.user_id) ?? []
        rows.push(record)
        byStudent.set(record.user_id, rows)
      }
      return NextResponse.json(list.map(goal => ({ ...goal, student_progress: (students.data ?? []).map(student => ({ ...student, ...semesterProgress(goal, byStudent.get(student.id) ?? []) })) })))
    }
    return NextResponse.json(list.map(goal => ({ ...goal, ...semesterProgress(goal, records) })))
  })
}
export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = goalSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const values = withoutUserId(body)
    const { data, error } = await supabase.from('semester_goals').insert({ ...values, teacher_id: user.id }).select().single()
    dbCheck(error)
    return NextResponse.json(data, { status: 201 })
  })
}

