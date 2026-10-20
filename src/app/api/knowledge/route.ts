import { NextResponse } from 'next/server'
import { actor, apiRoute, dbCheck, readJson, teacher } from '@/lib/teaching-server'
import { allCourseKnowledge, knowledgeSchema } from '@/lib/course-knowledge'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user } = await actor(request)
    const entries = await allCourseKnowledge()
    return NextResponse.json(user.role === 'teacher' ? entries.filter(entry => entry.teacher_id === user.id) : entries)
  })
}
export async function POST(request: Request) {
  return apiRoute(async () => {
    const raw = await readJson(request)
    const { user, supabase } = await actor(request, raw)
    teacher(user)
    const values = knowledgeSchema.parse(raw)
    const result = await supabase.from('course_knowledge').insert({ ...values, teacher_id: user.id }).select().single()
    dbCheck(result.error)
    return NextResponse.json(result.data, { status: 201 })
  })
}
