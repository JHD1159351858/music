import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, ApiError, dbCheck, readJson, validateScoreFiles } from '@/lib/teaching-server'
import { canReadScore, scorePatchSchema } from '@/lib/teaching-validation'
import { refreshScoreFiles, removeUnusedTeachingFile } from '@/lib/teaching-files'
import { getScorePages, scoreFileIds } from '@/lib/score-pages'

type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const { user, supabase } = await actor(request)
    const { data, error } = await supabase.from('scores').select('*,genre:score_genres(id,name,teacher_id)').eq('id', id).maybeSingle()
    dbCheck(error)
    if (!data || !canReadScore(user, data)) throw new ApiError('琴谱不存在或尚未发布', 404)
    return NextResponse.json((await refreshScoreFiles([data]))[0])
  })
}
export async function PATCH(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const body = scorePatchSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    const existing = await supabase.from('scores').select('*').eq('id', id).eq('owner_id', user.id).maybeSingle()
    dbCheck(existing.error)
    if (!existing.data || existing.data.source !== user.role) throw new ApiError('琴谱不存在或无权编辑', 404)
    const merged = { ...existing.data, ...body }
    if (user.role === 'student') { merged.published = false; merged.target_classes = [] }
    if (merged.genre_id) {
      const genre = await supabase.from('score_genres').select('id').eq('id', merged.genre_id).maybeSingle()
      dbCheck(genre.error)
      if (!genre.data) throw new ApiError('请选择教师已确认的曲风')
    }
    const legacyFileChanged = ['file_id', 'image_url'].some(key => Object.prototype.hasOwnProperty.call(body, key))
    const files = await validateScoreFiles(supabase, user, { ...merged, pages: body.pages ?? (legacyFileChanged ? undefined : getScorePages(existing.data)) })
    if (merged.published && (!merged.genre_id || !files.pages.length)) throw new ApiError('发布前请设置曲风并上传琴谱文件')
    const values = { ...withoutUserId(body), ...files, ...(user.role === 'student' ? { published: false, target_classes: [] } : {}) }
    const { data, error } = await supabase.from('scores').update(values).eq('id', id).eq('owner_id', user.id).select('*,genre:score_genres(id,name,teacher_id)').single()
    dbCheck(error)
    const retainedFiles = new Set(scoreFileIds(data))
    for (const fileId of scoreFileIds(existing.data)) if (!retainedFiles.has(fileId)) await removeUnusedTeachingFile(supabase, fileId)
    return NextResponse.json(data)
  })
}
export async function DELETE(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const body = request.headers.get('content-type')?.includes('application/json') ? await readJson(request) : undefined
    const { user, supabase } = await actor(request, body)
    const existing = await supabase.from('scores').select('id,file_id,pages,source').eq('id', id).eq('owner_id', user.id).maybeSingle()
    dbCheck(existing.error)
    if (!existing.data || existing.data.source !== user.role) throw new ApiError('琴谱不存在或无权删除', 404)
    const { data, error } = await supabase.from('scores').delete().eq('id', id).eq('owner_id', user.id).select('id').maybeSingle()
    dbCheck(error)
    if (!data) throw new ApiError('琴谱不存在或无权删除', 404)
    for (const fileId of scoreFileIds(existing.data)) await removeUnusedTeachingFile(supabase, fileId)
    return NextResponse.json({ success: true })
  })
}
