import { NextResponse } from 'next/server'
import { actor, apiRoute, withoutUserId, ApiError, dbCheck, readJson, validateScoreCover, validateScoreFiles } from '@/lib/teaching-server'
import { canReadScore, scorePatchSchema } from '@/lib/teaching-validation'
import { refreshScoreFiles, removeUnusedTeachingFile } from '@/lib/teaching-files'
import { getScorePages, scoreFileIds } from '@/lib/score-pages'

type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const { user, supabase } = await actor(request)
    const { data, error } = await supabase.from('scores').select('*').eq('id', id).maybeSingle()
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
    const legacyFileChanged = ['file_id', 'image_url'].some(key => Object.prototype.hasOwnProperty.call(body, key))
    const files = await validateScoreFiles(supabase, user, { ...merged, pages: body.pages ?? (legacyFileChanged ? undefined : getScorePages(existing.data)) })
    const cover = Object.prototype.hasOwnProperty.call(body, 'cover_file_id') ? await validateScoreCover(supabase, user, body) : {}
    if (merged.published && !files.pages.length) throw new ApiError('发布前请上传琴谱文件')
    const values = { ...withoutUserId(body), ...files, ...cover, ...(user.role === 'student' ? { published: false, target_classes: [] } : {}) }
    Reflect.deleteProperty(values, 'cover_receipt')
    const { data, error } = await supabase.from('scores').update(values).eq('id', id).eq('owner_id', user.id).select('*').single()
    dbCheck(error)
    const retainedFiles = new Set(scoreFileIds(data))
    let warning: string | undefined
    for (const fileId of scoreFileIds(existing.data)) if (!retainedFiles.has(fileId)) {
      try { await removeUnusedTeachingFile(supabase, fileId) }
      catch (error: unknown) {
        if (fileId !== existing.data.cover_file_id) throw error
        warning = '琴谱已保存，旧封面文件清理失败，请联系教师处理。'
      }
    }
    return NextResponse.json({ ...(await refreshScoreFiles([data]))[0], ...(warning ? { warning } : {}) })
  })
}
export async function DELETE(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const body = request.headers.get('content-type')?.includes('application/json') ? await readJson(request) : undefined
    const { user, supabase } = await actor(request, body)
    const existing = await supabase.from('scores').select('id,file_id,pages,cover_file_id,source').eq('id', id).eq('owner_id', user.id).maybeSingle()
    dbCheck(existing.error)
    if (!existing.data || existing.data.source !== user.role) throw new ApiError('琴谱不存在或无权删除', 404)
    const { data, error } = await supabase.from('scores').delete().eq('id', id).eq('owner_id', user.id).select('id').maybeSingle()
    dbCheck(error)
    if (!data) throw new ApiError('琴谱不存在或无权删除', 404)
    let warning: string | undefined
    for (const fileId of scoreFileIds(existing.data)) {
      try { await removeUnusedTeachingFile(supabase, fileId) }
      catch (error: unknown) {
        if (fileId !== existing.data.cover_file_id) throw error
        warning = '琴谱已删除，封面文件清理失败，请联系教师处理。'
      }
    }
    return NextResponse.json({ success: true, ...(warning ? { warning } : {}) })
  })
}
