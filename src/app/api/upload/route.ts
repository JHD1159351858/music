import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, canAccessTeachingFile, dbCheck, readJson, teacher } from '@/lib/teaching-server'
import { getTeachingFileUrl, removeUnusedTeachingFile, teachingStorage } from '@/lib/teaching-files'
import { saveLocalFile } from '@/lib/local-files'
import { useLocalData as localDataEnabled } from '@/lib/storage-mode'
import { createScoreUploadReceipt, verifyScoreUploadReceipt } from '@/lib/score-upload-receipt'
import { rasterImageType } from '@/lib/raster-image'

const MAX_FILE_SIZE = 100 * 1024 * 1024
const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
}

export async function POST(request: Request) {
  return apiRoute(async () => {
    const form = await request.formData()
    const { user } = await actor(request, { user_id: form.get('user_id') })
    const requestedPurpose = form.get('purpose')
    const purpose = requestedPurpose === 'map-avatar' || requestedPurpose === 'score-cover' ? requestedPurpose : undefined
    if (purpose === 'map-avatar') teacher(user)
    const file = form.get('file')
    if (!(file instanceof File) || !file.size) throw new ApiError('请选择非空的琴谱、录音或视频文件')
    if (purpose === 'score-cover' && file.size > 10 * 1024 * 1024) throw new ApiError('单个封面文件不能超过 10MB', 413)
    if (file.size > MAX_FILE_SIZE) throw new ApiError('单个文件不能超过 100MB', 413)
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    const type = (file.type || EXTENSION_TYPES[extension] || '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/') && type !== 'application/pdf' && !type.startsWith('audio/') && !type.startsWith('video/')) throw new ApiError('仅支持图片、PDF、音频和视频文件', 415)
    const name = file.name.replace(/[\\/]/g, '_')
    const content = Buffer.from(await file.arrayBuffer())
    if (purpose && rasterImageType(content) !== type) throw new ApiError(`${purpose === 'score-cover' ? '封面' : '头像'}文件内容与图片类型不匹配，请上传 PNG、JPEG、WebP、GIF 或 AVIF 图片`, 415)
    if (localDataEnabled()) {
      const uploaded = await saveLocalFile(content, name, type, user.id)
      return NextResponse.json({ ...await getTeachingFileUrl(uploaded.fileId), name: uploaded.name, type: uploaded.type, ...(purpose === 'score-cover' ? { receipt: createScoreUploadReceipt({ fileId: uploaded.fileId, ownerId: user.id, fileType: type, purpose }) } : {}) })
    }
    const storage = teachingStorage()
    let fileId: string
    try {
      const uploaded = await storage.uploadFile({ fileContent: content, fileName: `${Date.now()}_${name}`, contentType: type })
      fileId = uploaded.fileId
    } catch { throw new ApiError('文件上传失败，请稍后重试', 502) }
    const access = await getTeachingFileUrl(fileId)
    return NextResponse.json({ ...access, name, type, receipt: createScoreUploadReceipt({ fileId, ownerId: user.id, fileType: type, purpose }) })
  })
}

export async function GET(request: Request) {
  return apiRoute(async () => {
    const fileId = new URL(request.url).searchParams.get('file_id')?.trim()
    if (!fileId || fileId.length > 5000) throw new ApiError('缺少有效的文件编号')
    const { user, supabase } = await actor(request)
    if (!await canAccessTeachingFile(supabase, user, fileId)) throw new ApiError('文件不存在或无权访问', 404)
    return NextResponse.json(await getTeachingFileUrl(fileId))
  })
}

export async function DELETE(request: Request) {
  return apiRoute(async () => {
    const body = await readJson(request)
    const { user, supabase } = await actor(request, body)
    const fileId = typeof body.file_id === 'string' ? body.file_id.trim() : ''
    const receipt = typeof body.receipt === 'string' ? body.receipt : null
    if (!fileId || fileId.length > 5000 || !verifyScoreUploadReceipt(receipt, { fileId, ownerId: user.id, purpose: 'score-cover' })) throw new ApiError('仅可清理本人尚未保存的曲目封面上传', 403)
    const linked = await supabase.from('scores').select('id').eq('cover_file_id', fileId).limit(1)
    dbCheck(linked.error)
    if (linked.data?.length) throw new ApiError('封面已关联琴谱，不能作为未保存上传清理', 409)
    return NextResponse.json({ removed: await removeUnusedTeachingFile(supabase, fileId) })
  })
}
