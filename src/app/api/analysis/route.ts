import { NextResponse } from 'next/server'
import { LLMClient, Config, type Message } from 'coder-coding-dev-sdk'
import { z } from 'zod'
import { actor, apiRoute, ApiError, readJson } from '@/lib/teaching-server'
import { normalizeImageAnalysis, parseNotation, type AnalysisResult } from '@/lib/score-analysis'
import { retrieveKnowledge, type CourseKnowledge } from '@/lib/course-knowledge'
import { analyzeMusicXml, readMusicXmlUpload } from '@/lib/music21-analysis'
import { createScoreAnalysisReceipt } from '@/lib/score-analysis-receipt'
import { saveAnalysisHistory } from '@/lib/analysis-history'
import { baselineScoreGuide, type GuideField, type GuideSource } from '@/lib/score-guide'

const inputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('image'), image: z.string().max(12 * 1024 * 1024).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/, '请上传 PNG、JPG 或 WebP 图片'), fileName: z.string().max(255).optional() }),
  z.object({ mode: z.literal('text'), notation: z.string().trim().min(1).max(200000, '记谱文本不能超过20万字符') }),
])
const imagePrompt = `你是乐谱图片识别引擎，仅识别清晰可辨的谱面，返回严格 JSON。字段 title、composer、key、chordColor、summary 为 string 或 null；notes 是按谱面顺序逐个抄录的有音高音符数组，每项为 {step:音名字母C至B,octave:整数八度,alter:整数升降记号(-2至2)}。休止符不计入，不展开反复。无法完整读取音符时 notes 必须为 null，不得只输出少量样例或估计全谱。不得生成音符总数、直方图或示例数值，它们由服务端基于实际抄录计算。未识别字段填 null。作品背景和史实不由图片猜测。无法辨认谱面返回 {"error":"无法识别乐谱内容，请上传清晰谱图或MusicXML/ABC文本"}。`

export async function POST(request: Request) {
  return apiRoute(async () => {
    const isUpload = request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')
    const raw = isUpload ? undefined : await readJson(request)
    const { user, supabase } = await actor(request, raw)
    const input = isUpload ? null : inputSchema.parse(raw)
    let result: AnalysisResult
    if (!input) {
      const file = await readMusicXmlUpload(request)
      result = await analyzeMusicXml(file.content, file.name)
      result.fileName = file.name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 255)
    } else if (input.mode === 'text') {
      try { result = parseNotation(input.notation) }
      catch (cause: unknown) { throw new ApiError(cause instanceof Error ? cause.message : '记谱解析失败', 422) }
    } else {
      try {
        const client = new LLMClient(new Config())
        const message: Message = { role: 'user', content: [{ type: 'text', text: '请完整识别这张乐谱，不确定的指标留空。' }, { type: 'image_url', image_url: { url: input.image, detail: 'high' } }] }
        const response = await client.invoke([{ role: 'system', content: imagePrompt }, message], { temperature: 0.1, maxTokens: 16000 })
        const match = response.content.trim().match(/\{[\s\S]*\}/)
        if (!match) throw new ApiError('识别结果格式异常，请重试或使用结构化记谱', 502)
        const parsed: unknown = JSON.parse(match[0])
        if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') throw new ApiError(parsed.error.slice(0, 300), 422)
        result = normalizeImageAnalysis(parsed)
      } catch (cause: unknown) {
        if (cause instanceof ApiError) throw cause
        throw new ApiError('图片识别服务暂时不可用，请重试或使用 MusicXML / ABC 文本', 503)
      }
    }
    if (input?.mode === 'image' && input.fileName) result.fileName = input.fileName.replace(/[\\/\u0000-\u001f\u007f]/g, '_')
    const entries = await retrieveKnowledge(`${result.title ?? ''} ${result.composer ?? ''}`)
    const sourceText = entries.map(entry => `${entry.title}\n${entry.content}`).join('\n\n')
    const workEntries = entries.filter(entry => result.title && (entry.title === result.title || entry.keywords.includes(result.title)))
    const toSource = (entry: CourseKnowledge): GuideSource => ({ title: entry.title, url: entry.source_url })
    const guideSources: Partial<Record<GuideField, GuideSource>> = {}
    const field = (key: GuideField, label: string) => {
      const pattern = new RegExp(`(?:${label})[：:]([^\\n；;]+)`)
      for (const entry of workEntries) {
        const text = entry.content.match(pattern)?.[1]?.trim()
        if (!text) continue
        guideSources[key] = toSource(entry)
        return text
      }
      return null
    }
    result.workBackground = workEntries[0]?.content ?? null
    if (workEntries[0]) guideSources.workBackground = toSource(workEntries[0])
    const composerEntry = entries.find(entry => result.composer && entry.title === result.composer)
      ?? entries.find(entry => result.composer && entry.keywords.includes(result.composer) && !workEntries.includes(entry))
    result.composerBackground = composerEntry?.content ?? null
    if (composerEntry) guideSources.composerBackground = toSource(composerEntry)
    result.creationYear = field('creationYear', '创作年代|创作时间')
    result.period = field('period', '所属时期|音乐时期')
    result.melody = field('melody', '乐曲曲调|曲调特点|旋律特点')
    result.background = sourceText || null
    const response = { ...result, sources: entries.map(toSource), scoreGuide: baselineScoreGuide(result, guideSources) }
    const historyId = await saveAnalysisHistory(supabase, user.id, response)
    const saved = { ...response, historyId }
    return NextResponse.json({ ...saved, ...(result.music21 ? { analysisReceipt: createScoreAnalysisReceipt(saved, user.id) } : {}) })
  })
}
