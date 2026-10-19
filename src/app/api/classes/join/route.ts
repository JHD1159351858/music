import { NextResponse } from 'next/server'
import { z } from 'zod'
import { actor, apiRoute, ApiError, dbCheck, readJson } from '@/lib/teaching-server'

export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = await readJson(request)
    const { user, supabase } = await actor(request, body)
    if (user.role !== 'student') throw new ApiError('仅学生可通过代码加入班级', 403)
    const { code } = z.object({ code: z.string().trim().toUpperCase().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/, '请输入有效的 8 位班级代码') }).parse(body)
    const classroom = await supabase.from('classes').select('id,name').eq('join_code', code).maybeSingle()
    dbCheck(classroom.error)
    if (!classroom.data) throw new ApiError('班级代码不存在，请向教师确认', 404)
    const updated = await supabase.from('profiles').update({ class_name: classroom.data.name }).eq('id', user.id).eq('role', 'student').select('id').maybeSingle()
    dbCheck(updated.error)
    if (!updated.data) throw new ApiError('登录身份已失效，请重新登录', 401)
    return NextResponse.json({ class: classroom.data })
  })
}
