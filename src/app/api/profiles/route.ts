import { NextResponse } from 'next/server'
import { z } from 'zod'
import { actor, apiRoute, ApiError, dbCheck, readJson, teacher } from '@/lib/teaching-server'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    let query = supabase.from('profiles').select('id,nickname,role,class_name')
    if (user.role !== 'teacher') query = query.eq('id', user.id)
    const { data, error } = await query.order('created_at', { ascending: true })
    dbCheck(error)
    return NextResponse.json(data ?? [])
  })
}
export async function PATCH(request: Request) {
  return apiRoute(async () => {
    const body = z.object({ user_id: z.string().min(1), student_id: z.string().min(1), class_name: z.string().trim().max(100).nullable() }).parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const { data, error } = await supabase.from('profiles').update({ class_name: body.class_name || null }).eq('id', body.student_id).eq('role', 'student').select('id,nickname,role,class_name').maybeSingle()
    dbCheck(error)
    if (!data) throw new ApiError('学生不存在', 404)
    return NextResponse.json(data)
  })
}
