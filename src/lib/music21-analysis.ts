import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { ApiError } from './teaching-server'
import type { AnalysisResult, Music21Details } from './score-analysis'

const MAX_FILE_BYTES = 8 * 1024 * 1024
// Python bounds Unicode code points; JavaScript counts two UTF-16 units for some characters.
const string = z.string().max(3200)
const number = z.number().finite()
const nullableString = string.nullable()
const background = z.string().max(200000).nullable()
const position = { measure: number.nullable(), beat: number.nullable(), offset: number }
export const music21ResultSchema = z.object({
  title: nullableString, composer: nullableString, key: nullableString, range: nullableString,
  noteCount: z.number().int().min(0).max(10000).nullable(), chordColor: nullableString,
  pitchHistogram: z.record(z.string().max(16), z.number().int().nonnegative()).nullable(),
  pitchSequence: z.array(z.object({ index: number, midi: number, note: string })).max(10000).nullable(),
  summary: nullableString, background, workBackground: background, composerBackground: background,
  creationYear: nullableString, period: nullableString, melody: nullableString,
  provenance: z.literal('musicxml'), warnings: z.array(string).max(30),
  music21: z.object({
    version: z.string().max(80), partCount: z.number().int().nonnegative(), measureCount: z.number().int().nonnegative(), restCount: z.number().int().nonnegative(),
    timeSignatures: z.array(string).max(1000), tempos: z.array(number).max(1000), declaredKeys: z.array(string).max(1000),
    estimatedKey: z.object({ name: string, correlation: number.nullable() }).nullable(),
    notes: z.array(z.object({ ...position, index: number, midi: number, note: string, part: z.string().max(160), duration: number.nonnegative(), voice: z.string().max(80).nullable() })).max(10000),
    chords: z.array(z.object({ ...position, notes: z.array(string).max(128), name: string, romanNumeral: nullableString })).max(5000),
  }),
})

export type Music21Analysis = AnalysisResult & { music21: Music21Details }
let activeParsers = 0

function validFile(name: string, size: number): void {
  if (!/\.(?:musicxml|mxl|xml)$/i.test(name)) throw new ApiError('请上传 MusicXML 文件（.musicxml、.mxl 或 .xml）', 415)
  if (!size) throw new ApiError('请选择非空的 MusicXML 文件')
  if (size > MAX_FILE_BYTES) throw new ApiError('MusicXML 文件不能超过 8MB', 413)
}

export async function readMusicXmlUpload(request: Request): Promise<{ name: string; content: Buffer }> {
  const limit = MAX_FILE_BYTES + 64 * 1024
  const length = Number(request.headers.get('content-length'))
  if (Number.isFinite(length) && length > limit) throw new ApiError('MusicXML 文件不能超过 8MB', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError('请选择非空的 MusicXML 文件')
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > limit) {
        await reader.cancel()
        throw new ApiError('MusicXML 文件不能超过 8MB', 413)
      }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  let form: FormData
  try {
    form = await new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type') ?? '' }, body: Buffer.concat(chunks) }).formData()
  } catch { throw new ApiError('上传内容无效，请重新选择 MusicXML 文件') }
  const files = form.getAll('file')
  if (files.length !== 1) throw new ApiError('每次请选择一个 MusicXML 文件')
  const file = files[0]
  if (!(file instanceof File)) throw new ApiError('请选择非空的 MusicXML 文件')
  validFile(file.name, file.size)
  return { name: file.name, content: Buffer.from(await file.arrayBuffer()) }
}

export async function analyzeMusicXml(content: Buffer, name: string): Promise<Music21Analysis> {
  validFile(name, content.byteLength)
  if (activeParsers >= 2) throw new ApiError('乐谱分析正忙，请稍后重试', 429)
  const localPython = path.resolve(process.cwd(), '.venv-music21', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const python = process.env.ZHIYIN_MUSIC21_PYTHON?.trim() || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3')
  const parserEnvironment: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1', MPLBACKEND: 'Agg' }
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'SYSTEMDRIVE']) {
    if (process.env[key] !== undefined) parserEnvironment[key] = process.env[key]
  }
  activeParsers++
  try {
    return await new Promise<Music21Analysis>((resolve, reject) => {
      const child = execFile(python, [path.resolve(process.cwd(), 'scripts/music21/analyze.py')], {
        encoding: 'utf8', timeout: 60_000, maxBuffer: 12 * 1024 * 1024, windowsHide: true,
        env: parserEnvironment,
      }, (error, stdout) => {
        if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          reject(new ApiError('乐谱分析结果过大，请分段导出后再试', 413))
          return
        }
        let raw: unknown
        try { raw = JSON.parse(stdout.trim()) }
        catch {
          reject(new ApiError(error?.killed ? '乐谱分析超时，请缩短谱面后重试' : 'music21 解析环境不可用，请按部署说明配置 Python 依赖', error?.killed ? 504 : 503))
          return
        }
        const failure = z.object({ error: string, code: z.enum(['invalid', 'too-large', 'unavailable']) }).safeParse(raw)
        if (failure.success) {
          reject(new ApiError(failure.data.error, failure.data.code === 'unavailable' ? 503 : failure.data.code === 'too-large' ? 413 : 422))
          return
        }
        const parsed = music21ResultSchema.safeParse(raw)
        if (error || !parsed.success) {
          reject(new ApiError('music21 返回的分析数据无效，请检查谱面或解析环境', 502))
          return
        }
        resolve(parsed.data)
      })
      child.stdin?.on('error', () => { /* Process exit is handled by execFile's callback. */ })
      child.stdin?.end(JSON.stringify({ name, contentBase64: content.toString('base64') }))
    })
  } finally { activeParsers-- }
}
