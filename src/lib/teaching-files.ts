import { StorageClient } from 'coder-coding-dev-sdk'
import { ApiError, dbCheck, type TeachingClient } from './teaching-server'
import { deleteLocalFile, getLocalFileUrl, LocalFileError } from './local-files'
import { getScorePages, scorePageFileIds, type ScoreFiles } from './score-pages'

type ScoreFile = ScoreFiles
interface PracticeFile { audio_file_id?: string | null; audio_url?: string | null }
interface SubmissionFiles extends PracticeFile {
  video_file_id?: string | null
  video_url?: string | null
  practice_records?: PracticeFile | null
}

export function teachingStorage(): StorageClient {
  if (!process.env.CODER_CODING_API_KEY?.trim() || !process.env.CODER_CODING_BASE_URL?.trim()) {
    throw new ApiError('尚未配置对象存储，请设置 CODER_CODING_API_KEY 与 CODER_CODING_BASE_URL 后重试', 503)
  }
  try { return new StorageClient() }
  catch { throw new ApiError('对象存储配置无效，请检查服务地址与密钥配置', 503) }
}

export async function removeUnusedTeachingFile(supabase: TeachingClient, fileId: string): Promise<boolean> {
  const references = await Promise.all([
    supabase.from('scores').select('id').eq('file_id', fileId).limit(1),
    supabase.from('scores').select('id').contains('pages', [{ file_id: fileId }]).limit(1),
    supabase.from('scores').select('id').eq('cover_file_id', fileId).limit(1),
    supabase.from('practice_records').select('id').eq('audio_file_id', fileId).limit(1),
    supabase.from('submissions').select('id').eq('audio_file_id', fileId).limit(1),
    supabase.from('submissions').select('id').eq('video_file_id', fileId).limit(1),
    supabase.from('map_musicians').select('id').eq('avatar_file_id', fileId).limit(1),
  ])
  for (const reference of references) dbCheck(reference.error)
  if (references.some(reference => reference.data?.length)) return false
  if (fileId.startsWith('local:')) { await deleteLocalFile(fileId); return true }
  try {
    const deleted = await teachingStorage().deleteFile({ fileId })
    if (!deleted) throw new Error('Delete failed')
  } catch { throw new ApiError('记录已删除，但存储文件清理失败，请联系教师处理', 502) }
  return true
}

export async function getTeachingFileUrl(fileId: string): Promise<{ fileId: string; url: string; expiresAt: string }> {
  if (fileId.startsWith('local:')) {
    try { return await getLocalFileUrl(fileId) }
    catch (error: unknown) { throw new ApiError(error instanceof LocalFileError ? error.message : '本地文件链接续签失败', error instanceof LocalFileError ? error.status : 500) }
  }
  const storage = teachingStorage()
  try {
    const file = await storage.getFile({ fileId, expiresInSeconds: 86400 * 7 })
    if (!file.url) throw new Error('Missing file URL')
    return { fileId, url: file.url, expiresAt: file.expiresAt }
  } catch { throw new ApiError('文件链接续签失败，请稍后重试', 502) }
}

async function signedUrls(fileIds: (string | null | undefined)[], allowMissing = false): Promise<Map<string, string>> {
  const ids = [...new Set(fileIds.filter((id): id is string => !!id))]
  const urls = new Map<string, string>()
  if (!ids.length) return urls
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (cursor < ids.length) {
      const fileId = ids[cursor++]
      try {
        const file = await getTeachingFileUrl(fileId)
        urls.set(fileId, file.url)
      } catch (error: unknown) {
        if (!allowMissing) throw error
        urls.set(fileId, '')
      }
    }
  }))
  return urls
}

export async function refreshScoreFiles<T extends ScoreFile>(rows: T[]): Promise<T[]> {
  const urls = await signedUrls(rows.flatMap(scorePageFileIds))
  const covers = await signedUrls(rows.map(row => row.cover_file_id), true)
  if (!urls.size && !covers.size && !rows.some(row => Object.prototype.hasOwnProperty.call(row, 'cover_file_id'))) return rows
  return rows.map((row) => {
    const pages = getScorePages(row).map(page => ({ ...page, image_url: page.file_id ? urls.get(page.file_id)! : page.image_url }))
    return { ...row, ...(row.file_id ? { image_url: urls.get(row.file_id)! } : {}), ...(row.pages?.length ? { pages } : {}), ...(Object.prototype.hasOwnProperty.call(row, 'cover_file_id') ? { cover_url: row.cover_file_id ? covers.get(row.cover_file_id) || null : null } : {}) }
  })
}

export async function refreshPracticeFiles<T extends PracticeFile>(rows: T[]): Promise<T[]> {
  const urls = await signedUrls(rows.map((row) => row.audio_file_id))
  if (!urls.size) return rows
  return rows.map((row) => row.audio_file_id ? { ...row, audio_url: urls.get(row.audio_file_id)! } : row)
}

export async function refreshSubmissionFiles<T extends SubmissionFiles>(rows: T[]): Promise<T[]> {
  const urls = await signedUrls(rows.flatMap((row) => [row.audio_file_id, row.video_file_id, row.practice_records?.audio_file_id]))
  if (!urls.size) return rows
  return rows.map((row) => ({
    ...row,
    audio_url: row.audio_file_id ? urls.get(row.audio_file_id)! : row.audio_url,
    video_url: row.video_file_id ? urls.get(row.video_file_id)! : row.video_url,
    practice_records: row.practice_records?.audio_file_id ? { ...row.practice_records, audio_url: urls.get(row.practice_records.audio_file_id)! } : row.practice_records,
  }))
}
