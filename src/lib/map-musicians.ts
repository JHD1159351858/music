import { z } from 'zod'
import { CHINA_COMPOSERS, CHINA_ERAS, EUROPE_COMPOSERS, EUROPE_ERAS, type Composer } from './composers'
import { ApiError, dbCheck, type TeachingClient } from './teaching-server'
import { getTeachingFileUrl } from './teaching-files'
import { localFileMetadata, localRasterFileType, LocalFileError } from './local-files'
import { verifyScoreUploadReceipt } from './score-upload-receipt'
import type { TeachingProfile } from './teaching-types'
import type { MapKind, MapMusician } from './map-musician-types'

const fields = z.object({
  name: z.string().trim().min(1, '请填写人物姓名').max(160),
  years: z.string().trim().max(160).default(''),
  era: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1, '请填写人物地域').max(500),
  x: z.number().finite().min(0).max(100), y: z.number().finite().min(0).max(100),
  map_kind: z.enum(['china', 'europe']),
  intro: z.string().trim().min(1, '请填写人物简介').max(12000),
  works: z.string().trim().max(6000).default(''), note: z.string().trim().max(6000).default(''),
  sources: z.array(z.object({ title: z.string().trim().min(1).max(160), url: z.string().trim().max(2048).url().refine(url => /^https?:\/\//i.test(url), '来源链接须使用 HTTP(S)') })).max(20).default([]),
  avatar_file_id: z.string().trim().min(1).max(5000).nullable().default(null),
  avatar_receipt: z.string().trim().min(1).max(10000).optional(),
  avatar: z.never().optional(),
})
export const mapMusicianSchema = fields.refine(value => (value.map_kind === 'china' ? CHINA_ERAS : EUROPE_ERAS).some(era => era.id === value.era), '所选时期与地图不匹配')
export const mapMusicianPatchSchema = fields.partial().extend({
  years: fields.shape.years.unwrap().optional(), works: fields.shape.works.unwrap().optional(),
  note: fields.shape.note.unwrap().optional(), sources: fields.shape.sources.unwrap().optional(),
  avatar_file_id: fields.shape.avatar_file_id.unwrap().optional(),
})

export type MapMusicianRow = Omit<Composer, 'avatar'> & { map_kind: MapKind; teacher_id: string; avatar_file_id: string | null }
const builtin = (composer: Composer, mapKind: MapKind): MapMusician => ({ ...composer, x: 25 + composer.x / 2, origin: 'builtin', map_kind: mapKind, teacher_id: null, avatar_file_id: null })
export function builtinMapMusicians(): MapMusician[] {
  return [...CHINA_COMPOSERS.map(composer => builtin(composer, 'china')), ...EUROPE_COMPOSERS.map(composer => builtin(composer, 'europe'))]
}
export function customMapMusician(row: MapMusicianRow, avatar = ''): MapMusician {
  return { id: row.id, name: row.name, years: row.years, era: row.era, region: row.region, x: row.x, y: row.y, intro: row.intro, works: row.works, note: row.note, sources: row.sources, avatar, origin: 'custom', map_kind: row.map_kind, teacher_id: row.teacher_id, avatar_file_id: row.avatar_file_id }
}
export async function allMapMusicians(supabase: TeachingClient, mapKind?: MapKind): Promise<MapMusician[]> {
  const rows: MapMusicianRow[] = []
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('map_musicians').select('*').order('created_at').order('id').range(offset, offset + 499)
    if (mapKind) query = query.eq('map_kind', mapKind)
    const result = await query
    dbCheck(result.error)
    rows.push(...(result.data ?? []) as MapMusicianRow[])
    if (!result.data || result.data.length < 500) break
  }
  const urls = new Map<string, string>()
  for (const row of rows) {
    if (!row.avatar_file_id || urls.has(row.avatar_file_id)) continue
    urls.set(row.avatar_file_id, '')
    try { urls.set(row.avatar_file_id, (await getTeachingFileUrl(row.avatar_file_id)).url) }
    catch { /* Missing portraits must not hide the musician's teaching material. */ }
  }
  return [...builtinMapMusicians().filter(row => !mapKind || row.map_kind === mapKind), ...rows.map(row => customMapMusician(row, row.avatar_file_id ? urls.get(row.avatar_file_id) ?? '' : ''))]
}
export async function findMapMusician(supabase: TeachingClient, id: string): Promise<Composer | undefined> {
  const builtin = builtinMapMusicians().find(row => row.id === id)
  if (builtin) return builtin
  const result = await supabase.from('map_musicians').select('*').eq('id', id).maybeSingle()
  dbCheck(result.error)
  return result.data ? customMapMusician(result.data as MapMusicianRow) : undefined
}

const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])
export async function validateMapAvatar(supabase: TeachingClient, user: TeachingProfile, fileId: string | null, receipt?: string): Promise<void> {
  if (!fileId) return
  let type: string | null
  if (fileId.startsWith('local:')) {
    try {
      const metadata = await localFileMetadata(fileId)
      if (metadata.ownerId !== user.id) throw new ApiError('不能使用其他用户上传的头像', 403)
      type = metadata.type
      if (await localRasterFileType(fileId) !== type) throw new ApiError('头像文件内容与图片类型不匹配，请上传有效的图片', 415)
    } catch (error: unknown) {
      if (error instanceof LocalFileError) throw new ApiError(error.message, error.status)
      throw error
    }
  } else {
    type = verifyScoreUploadReceipt(receipt, { fileId, ownerId: user.id, purpose: 'map-avatar' })
    if (!type) {
      const owned = await supabase.from('map_musicians').select('id').eq('teacher_id', user.id).eq('avatar_file_id', fileId).limit(1)
      dbCheck(owned.error)
      if (owned.data?.length) return
      throw new ApiError('头像上传凭证无效或已过期，请重新上传', 403)
    }
  }
  if (!RASTER_TYPES.has(type)) throw new ApiError('人物头像仅支持 PNG、JPEG、WebP、GIF 或 AVIF 图片', 415)
}
