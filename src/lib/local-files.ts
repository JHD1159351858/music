import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { rasterImageType } from './raster-image'

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_FILE_SIZE = 100 * 1024 * 1024

interface LocalFile {
  id: string
  name: string
  type: string
  size: number
  createdAt: string
  ownerId?: string
}

export class LocalFileError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

function dataDirectory(): string {
  return path.resolve(process.env.ZHIYIN_DATA_DIR?.trim() || path.join(process.cwd(), 'data'))
}

function filePaths(id: string) {
  if (!ID.test(id)) throw new LocalFileError('文件不存在', 404)
  const directory = path.join(dataDirectory(), 'uploads')
  return { directory, content: path.join(directory, `${id}.bin`), metadata: path.join(directory, `${id}.json`) }
}

function fileType(value: string): string {
  const type = value.split(';')[0].trim().toLowerCase()
  if (!/^(image|audio|video)\/[a-z0-9.+-]+$/.test(type) && type !== 'application/pdf') throw new LocalFileError('仅支持图片、PDF、音频和视频文件', 415)
  return type
}

async function signingSecret(): Promise<string> {
  const directory = dataDirectory()
  await mkdir(directory, { recursive: true })
  const filename = path.join(directory, '.file-url-secret')
  try {
    await writeFile(filename, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 })
  } catch (error: unknown) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  const secret = await readFile(filename, 'utf8')
  if (!/^[0-9a-f]{64}$/.test(secret)) throw new LocalFileError('本地文件签名配置无效', 503)
  return secret
}

function signature(secret: string, id: string, expires: string): string {
  return createHmac('sha256', secret).update(`${id}.${expires}`).digest('base64url')
}

async function readMetadata(id: string): Promise<LocalFile> {
  const files = filePaths(id)
  try {
    const data: unknown = JSON.parse(await readFile(files.metadata, 'utf8'))
    if (!data || typeof data !== 'object' || !('id' in data) || data.id !== id || !('name' in data) || typeof data.name !== 'string' || !('type' in data) || typeof data.type !== 'string' || !('size' in data) || typeof data.size !== 'number' || !('createdAt' in data) || typeof data.createdAt !== 'string') throw new Error('Invalid metadata')
    const info = await stat(files.content)
    if (!info.isFile() || data.size < 1 || data.size > MAX_FILE_SIZE || info.size !== data.size) throw new Error('Invalid content')
    return { id, name: data.name, type: fileType(data.type), size: data.size, createdAt: data.createdAt, ownerId: 'ownerId' in data && typeof data.ownerId === 'string' ? data.ownerId : undefined }
  } catch { throw new LocalFileError('文件不存在或已损坏', 404) }
}

export async function saveLocalFile(content: Buffer, name: string, contentType: string, ownerId?: string): Promise<{ fileId: string; name: string; type: string }> {
  if (!content.length) throw new LocalFileError('请选择非空文件', 400)
  if (content.length > MAX_FILE_SIZE) throw new LocalFileError('单个文件不能超过 100MB', 413)
  const id = randomUUID()
  const files = filePaths(id)
  const metadata: LocalFile = { id, name: name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 255), type: fileType(contentType), size: content.length, createdAt: new Date().toISOString(), ownerId }
  await mkdir(files.directory, { recursive: true })
  await writeFile(files.content, content, { flag: 'wx' })
  try { await writeFile(files.metadata, JSON.stringify(metadata), { flag: 'wx' }) }
  catch (error: unknown) { await unlink(files.content); throw error }
  return { fileId: `local:${id}`, name: metadata.name, type: metadata.type }
}

export async function localFileMetadata(fileId: string): Promise<{ ownerId?: string; type: string }> {
  if (!fileId.startsWith('local:')) throw new LocalFileError('文件编号无效', 404)
  return readMetadata(fileId.slice(6))
}

export async function localRasterFileType(fileId: string): Promise<string | null> {
  if (!fileId.startsWith('local:')) throw new LocalFileError('文件编号无效', 404)
  const file = await open(filePaths(fileId.slice(6)).content, 'r')
  try {
    const header = Buffer.alloc(32)
    const { bytesRead } = await file.read(header, 0, header.length, 0)
    return rasterImageType(header.subarray(0, bytesRead))
  } finally { await file.close() }
}

export async function deleteLocalFile(fileId: string): Promise<void> {
  if (!fileId.startsWith('local:')) throw new LocalFileError('文件编号无效', 404)
  const files = filePaths(fileId.slice(6))
  for (const filename of [files.metadata, files.content]) {
    try { await unlink(filename) }
    catch (error: unknown) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
  }
}

export async function getLocalFileUrl(fileId: string): Promise<{ fileId: string; url: string; expiresAt: string }> {
  if (!fileId.startsWith('local:')) throw new LocalFileError('文件编号无效', 404)
  const id = fileId.slice(6)
  await readMetadata(id)
  const expires = String(Math.floor(Date.now() / 1000) + 86400 * 7)
  const token = signature(await signingSecret(), id, expires)
  return { fileId, url: `/api/files/${id}?expires=${expires}&token=${token}`, expiresAt: new Date(Number(expires) * 1000).toISOString() }
}

function byteRange(range: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match || (!match[1] && !match[2])) return null
  let start: number
  let end: number
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return null
    end = Math.min(end, size - 1)
  }
  return { start, end }
}

export async function serveLocalFile(request: Request, id: string): Promise<Response> {
  try {
    const files = filePaths(id)
    const url = new URL(request.url)
    const expires = url.searchParams.get('expires') ?? ''
    const token = url.searchParams.get('token') ?? ''
    if (!/^\d{10,13}$/.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000) || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new LocalFileError('文件链接已过期或无效，请刷新后重试', 403)
    const expected = signature(await signingSecret(), id, expires)
    if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new LocalFileError('文件链接无效', 403)
    const metadata = await readMetadata(id)
    const headers = new Headers({
      'Content-Type': metadata.type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'",
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(metadata.name).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    })
    const rangeHeader = request.headers.get('range')
    const range = rangeHeader ? byteRange(rangeHeader, metadata.size) : { start: 0, end: metadata.size - 1 }
    if (!range) {
      headers.set('Content-Range', `bytes */${metadata.size}`)
      return new Response(null, { status: 416, headers })
    }
    headers.set('Content-Length', String(range.end - range.start + 1))
    if (rangeHeader) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${metadata.size}`)
    const body = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(files.content, range)) as ReadableStream<Uint8Array>
    return new Response(body, { status: rangeHeader ? 206 : 200, headers })
  } catch (error: unknown) {
    const known = error instanceof LocalFileError
    return Response.json({ error: known ? error.message : '本地文件暂不可用' }, { status: known ? error.status : 500 })
  }
}
