import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, dbCheck, readJson, teacher } from '@/lib/teaching-server'
import { knowledgeSchema } from '@/lib/course-knowledge'

type Params = { params: Promise<{ id: string }> }

async function modify(request: Request, context: Params, deleting: boolean) {
  return apiRoute(async () => {
    const raw = deleting ? undefined : await readJson(request)
    const { user, supabase } = await actor(request, raw)
    teacher(user)
    const { id } = await context.params
    const existing = await supabase.from('course_knowledge').select('id,teacher_id').eq('id', id).maybeSingle()
    dbCheck(existing.error)
    if (!existing.data || existing.data.teacher_id !== user.id) throw new ApiError('知识条目不存在或没有修改权限', 404)
    const result = deleting
      ? await supabase.from('course_knowledge').delete().eq('id', id).eq('teacher_id', user.id)
      : await supabase.from('course_knowledge').update(knowledgeSchema.parse(raw)).eq('id', id).eq('teacher_id', user.id).select().single()
    dbCheck(result.error)
    return NextResponse.json(deleting ? { ok: true } : result.data)
  })
}
export async function PATCH(request: Request, context: Params) { return modify(request, context, false) }
export async function DELETE(request: Request, context: Params) { return modify(request, context, true) }
