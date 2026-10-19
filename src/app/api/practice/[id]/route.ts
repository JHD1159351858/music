import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, dbCheck, readJson } from '@/lib/teaching-server'
import { removeUnusedTeachingFile } from '@/lib/teaching-files'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiRoute(async () => {
    const { id } = await params
    const body = request.headers.get('content-type')?.includes('application/json') ? await readJson(request) : undefined
    const { user, supabase } = await actor(request, body)
    const references = await supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('practice_record_id', id).eq('student_id', user.id)
    dbCheck(references.error)
    if (references.count) throw new ApiError('此练习记录已用于任务提交，无法删除', 409)
    const { data, error } = await supabase.from('practice_records').delete().eq('id', id).eq('user_id', user.id).select('id,audio_file_id').maybeSingle()
    dbCheck(error)
    if (!data) throw new ApiError('练习记录不存在或无权删除', 404)
    if (data.audio_file_id) await removeUnusedTeachingFile(supabase, data.audio_file_id)
    return NextResponse.json({ success: true })
  })
}
