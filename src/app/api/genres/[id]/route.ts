import { NextResponse } from 'next/server'
import { z } from 'zod'
import { actor, apiRoute, ApiError, dbCheck, readJson, teacher } from '@/lib/teaching-server'

type Context = { params: Promise<{ id: string }> }
export async function PATCH(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const body = z.object({ user_id: z.string().min(1), name: z.string().trim().min(1).max(100) }).parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const { data, error } = await supabase.from('score_genres').update({ name: body.name }).eq('id', id).eq('teacher_id', user.id).select().maybeSingle()
    dbCheck(error)
    if (!data) throw new ApiError('曲风不存在或无权编辑', 404)
    return NextResponse.json(data)
  })
}
export async function DELETE(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const body = request.headers.get('content-type')?.includes('application/json') ? await readJson(request) : undefined
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const references = await supabase.from('scores').select('id', { count: 'exact', head: true }).eq('genre_id', id)
    dbCheck(references.error)
    if (references.count) throw new ApiError('此曲风正在被琴谱使用，请先修改关联琴谱', 409)
    const { data, error } = await supabase.from('score_genres').delete().eq('id', id).eq('teacher_id', user.id).select('id').maybeSingle()
    dbCheck(error)
    if (!data) throw new ApiError('曲风不存在或无权删除', 404)
    return NextResponse.json({ success: true })
  })
}
