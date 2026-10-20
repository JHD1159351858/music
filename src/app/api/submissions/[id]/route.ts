import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, dbCheck, getTask, readJson, taskAccess, teacher } from '@/lib/teaching-server'
import { reviewSchema } from '@/lib/teaching-validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiRoute(async () => {
    const { id } = await params
    const body = reviewSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const submission = await supabase.from('submissions').select('task_id').eq('id', id).maybeSingle()
    dbCheck(submission.error)
    if (!submission.data) throw new ApiError('提交材料不存在', 404)
    taskAccess(await getTask(supabase, submission.data.task_id), user)
    const { data, error } = await supabase.from('submissions').update({ grade: body.grade, feedback: body.feedback, reviewed_at: new Date().toISOString() }).eq('id', id).select().single()
    dbCheck(error)
    return NextResponse.json(data)
  })
}
