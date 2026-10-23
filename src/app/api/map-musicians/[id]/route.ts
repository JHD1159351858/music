import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, dbCheck, readJson, teacher } from '@/lib/teaching-server'
import { customMapMusician, mapMusicianPatchSchema, mapMusicianSchema, validateMapAvatar, type MapMusicianRow } from '@/lib/map-musicians'
import { getTeachingFileUrl, removeUnusedTeachingFile } from '@/lib/teaching-files'

type Context = { params: Promise<{ id: string }> }
async function cleanup(supabase: Parameters<typeof removeUnusedTeachingFile>[0], fileId: string | null): Promise<string | undefined> {
  if (!fileId) return
  try { await removeUnusedTeachingFile(supabase, fileId) }
  catch { return '资料已保存，旧头像文件清理失败，请联系教师处理。' }
}
export async function PATCH(request: Request, context: Context) {
  return apiRoute(async () => {
    const raw = await readJson(request)
    const { user, supabase } = await actor(request, raw)
    teacher(user)
    const { id } = await context.params
    const existing = await supabase.from('map_musicians').select('*').eq('id', id).eq('teacher_id', user.id).maybeSingle()
    dbCheck(existing.error)
    if (!existing.data) throw new ApiError('人物不存在或没有修改权限', 404)
    const patch = mapMusicianPatchSchema.parse(raw)
    const merged = mapMusicianSchema.parse({ ...existing.data, ...patch })
    await validateMapAvatar(supabase, user, merged.avatar_file_id, patch.avatar_receipt)
    const avatar = merged.avatar_file_id ? (await getTeachingFileUrl(merged.avatar_file_id)).url : ''
    const values = { ...patch }
    Reflect.deleteProperty(values, 'avatar_receipt')
    const result = await supabase.from('map_musicians').update(values).eq('id', id).eq('teacher_id', user.id).select().single()
    dbCheck(result.error)
    const warning = existing.data.avatar_file_id !== merged.avatar_file_id ? await cleanup(supabase, existing.data.avatar_file_id as string | null) : undefined
    return NextResponse.json({ ...customMapMusician(result.data as MapMusicianRow, avatar), ...(warning ? { warning } : {}) })
  })
}
export async function DELETE(request: Request, context: Context) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    teacher(user)
    const { id } = await context.params
    const result = await supabase.from('map_musicians').delete().eq('id', id).eq('teacher_id', user.id).select('avatar_file_id').maybeSingle()
    dbCheck(result.error)
    if (!result.data) throw new ApiError('人物不存在或没有修改权限', 404)
    const warning = await cleanup(supabase, result.data.avatar_file_id as string | null)
    return NextResponse.json({ ok: true, ...(warning ? { warning: '人物已删除，旧头像文件清理失败，请联系教师处理。' } : {}) })
  })
}
