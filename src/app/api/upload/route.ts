import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, canAccessTeachingFile, teacher } from '@/lib/teaching-server'
import { getTeachingFileUrl, teachingStorage } from '@/lib/teaching-files'
import { saveLocalFile } from '@/lib/local-files'
import { useLocalData as localDataEnabled } from '@/lib/storage-mode'
import { createScoreUploadReceipt } from '@/lib/score-upload-receipt'
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
    const purpose = form.get('purpose') === 'map-avatar' ? 'map-avatar' : undefined
    if (purpose) teacher(user)
    const file = form.get('file')
    if (!(file instanceof File) || !file.size) throw new ApiError('请选择非空的琴谱、录音或视频文件')
    if (file.size > MAX_FILE_SIZE) throw new ApiError('单个文件不能超过 100MB', 413)
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    const type = (file.type || EXTENSION_TYPES[extension] || '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/') && type !== 'application/pdf' && !type.startsWith('audio/') && !type.startsWith('video/')) throw new ApiError('仅支持图片、PDF、音频和视频文件', 415)
    const name = file.name.replace(/[\\/]/g, '_')
    const content = Buffer.from(await file.arrayBuffer())
    if (purpose && rasterImageType(content) !== type) throw new ApiError('头像文件内容与图片类型不匹配，请上传 PNG、JPEG、WebP、GIF 或 AVIF 图片', 415)
    if (localDataEnabled()) {
      const uploaded = await saveLocalFile(content, name, type, user.id)
      return NextResponse.json({ ...await getTeachingFileUrl(uploaded.fileId), name: uploaded.name, type: uploaded.type })
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
