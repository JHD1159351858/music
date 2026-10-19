import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, ApiError, dbCheck, readJson, teacher } from '@/lib/teaching-server'
import { goalPatchSchema, goalSchema } from '@/lib/teaching-validation'

type Context = { params: Promise<{ id: string }> }
export async function PATCH(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const body = goalPatchSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const existing = await supabase.from('semester_goals').select('*').eq('id', id).eq('teacher_id', user.id).maybeSingle()
    dbCheck(existing.error)
    if (!existing.data) throw new ApiError('学期目标不存在或无权编辑', 404)
    goalSchema.parse({ ...existing.data, ...body })
    const values = withoutUserId(body)
    const { data, error } = await supabase.from('semester_goals').update(values).eq('id', id).eq('teacher_id', user.id).select().single()
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
    const { data, error } = await supabase.from('semester_goals').delete().eq('id', id).eq('teacher_id', user.id).select('id').maybeSingle()
    dbCheck(error)
    if (!data) throw new ApiError('学期目标不存在或无权删除', 404)
    return NextResponse.json({ success: true })
  })
}

